/**
 * Context Service - Provides additional context to improve LLM reliability
 */

const { execSync } = require('child_process');
const core = require('@actions/core');
const CONTEXT_CONFIG = require('../config/context');
const CORE_CONFIG = require('../config/core');
const { getLanguageAnalyzer, normalizeLanguage } = require('../language-analyzers');
const { LANGUAGE_FILE_CONFIGS, LANGUAGE_DEPENDENCY_CONFIGS } = require('../config/languages');

/**
 * Optimized shell command execution with better error handling
 */
class ShellExecutor {
  static execute(command, options = {}) {
    const defaultOptions = {
      encoding: 'utf8',
      maxBuffer: 5 * 1024 * 1024,
      timeout: 30000, // 30 second timeout
      ...options
    };

    try {
      return execSync(command, defaultOptions);
    } catch (error) {
      if (error.signal === 'SIGTERM') {
        throw new Error(`Command timed out: ${command}`);
      }
      throw error;
    }
  }

  static executeWithFallback(primaryCommand, fallbackCommand, options = {}) {
    try {
      return this.execute(primaryCommand, options);
    } catch (error) {
      core.warning(`⚠️  Primary command failed, trying fallback: ${error.message}`);
      try {
        return this.execute(fallbackCommand, options);
      } catch (fallbackError) {
        throw new Error(
          `Both primary and fallback commands failed. Primary: ${error.message}, Fallback: ${fallbackError.message}`
        );
      }
    }
  }
}

class ContextService {
  constructor(baseBranch, language = CORE_CONFIG.DEFAULT_LANGUAGE) {
    this.baseBranch = baseBranch;
    this.language = normalizeLanguage(language || CORE_CONFIG.DEFAULT_LANGUAGE || 'js');
  }

  /**
   * Infer language from file extension with fallback to configured language
   */
  detectLanguageFromPath(filePath) {
    if (!filePath) {
      return this.language || 'js';
    }

    const lowerPath = filePath.toLowerCase();
    const matchedEntry = Object.entries(LANGUAGE_FILE_CONFIGS).find(([, config]) => {
      if (!config || !config.extensions) {
        return false;
      }
      return config.extensions.some(extension => lowerPath.endsWith(extension.toLowerCase()));
    });

    if (matchedEntry) {
      return normalizeLanguage(matchedEntry[0]);
    }

    return this.language || 'js';
  }

  /**
   * Execute context generation with performance monitoring
   */
  executeWithTiming(contextType, generator) {
    const startTime = Date.now();
    const data = generator();
    const duration = Date.now() - startTime;

    core.info(`⏱️  Generated ${contextType} context in ${duration}ms`);
    return data;
  }

  /**
   * Safely escape file path for shell commands
   */
  escapeFilePath(filePath) {
    // Escape single quotes and wrap in single quotes to handle special characters
    return `'${filePath.replace(/'/g, "'\"'\"'")}'`;
  }

  /**
   * Get fixed context size for deterministic reviews
   * CHANGED: Now uses FIXED size instead of dynamic calculation
   */
  getContextSize() {
    // Use FIXED context size for determinism
    const contextSize = CONTEXT_CONFIG.FIXED_CONTEXT_SIZE;

    core.info(`🎯 Using FIXED context size: ${Math.round(contextSize / 1024)}KB (deterministic)`);
    return contextSize;
  }

  /**
   * @deprecated Use getContextSize() instead
   * Kept for backward compatibility
   */
  calculateDynamicContextSize(_estimatedTokens, _maxTokens = 200000) {
    // Fallback to fixed context size
    return this.getContextSize();
  }

  /**
   * Build dependency sections for the provided language
   */
  buildDependencySectionsForLanguage(language) {
    const normalized = normalizeLanguage(language);
    const configs = LANGUAGE_DEPENDENCY_CONFIGS[normalized] || [];
    const sections = [];

    for (const config of configs) {
      const section = this.renderDependencySection(config);
      if (section) {
        sections.push(section);
      }
    }

    return sections;
  }

  /**
   * Safely read dependency file content
   */
  readDependencyFile(filePath, maxLines) {
    if (!filePath) {
      return null;
    }

    try {
      const escapedPath = this.escapeFilePath(filePath);
      const command = maxLines
        ? `if [ -f ${escapedPath} ]; then head -n ${maxLines} ${escapedPath}; else true; fi`
        : `if [ -f ${escapedPath} ]; then cat ${escapedPath}; else true; fi`;

      const content = ShellExecutor.execute(command);
      if (!content || !content.trim()) {
        return null;
      }

      return content.trimEnd();
    } catch {
      return null;
    }
  }

  /**
   * Render dependency section based on configuration
   */
  renderDependencySection(config) {
    const content = this.readDependencyFile(config.file, config.maxLines);
    if (!content) {
      return null;
    }

    if (config.parser === 'nodePackage') {
      return this.renderNodePackageSection(content);
    }

    if (config.parser === 'composerPackage') {
      return this.renderComposerPackageSection(content);
    }

    const label = config.label || config.file;
    const linesNote = config.maxLines ? ` (first ${config.maxLines} lines)` : '';
    return `📄 ${label}${linesNote}:\n${content}`.trimEnd();
  }

  /**
   * Provide compact summary for package.json dependencies
   */
  renderNodePackageSection(content) {
    try {
      const packageJson = JSON.parse(content);
      let summary = '📦 package.json\n';

      if (packageJson.name) {
        summary += `  Name: ${packageJson.name}\n`;
      }

      if (packageJson.version) {
        summary += `  Version: ${packageJson.version}\n`;
      }

      summary += `  Project Type: ${packageJson.type || 'CommonJS'}\n`;

      summary += this.formatDependencyList('Dependencies', packageJson.dependencies);
      summary += this.formatDependencyList('Dev Dependencies', packageJson.devDependencies);

      return summary.trimEnd();
    } catch {
      return `📦 package.json (raw):\n${content}`.trimEnd();
    }
  }

  /**
   * Provide compact summary for composer.json dependencies
   */
  renderComposerPackageSection(content) {
    try {
      const composerJson = JSON.parse(content);
      let summary = '📦 composer.json\n';

      if (composerJson.name) {
        summary += `  Name: ${composerJson.name}\n`;
      }

      if (composerJson.type) {
        summary += `  Type: ${composerJson.type}\n`;
      }

      summary += this.formatDependencyList('Require', composerJson.require);
      summary += this.formatDependencyList('Require Dev', composerJson['require-dev']);

      return summary.trimEnd();
    } catch {
      return `📦 composer.json (raw):\n${content}`.trimEnd();
    }
  }

  /**
   * Format dependency map into readable list
   */
  formatDependencyList(title, deps, limit = 8) {
    if (!deps || Object.keys(deps).length === 0) {
      return '';
    }

    const entries = Object.entries(deps);
    let result = `  ${title} (${entries.length}):\n`;

    entries.slice(0, limit).forEach(([name, version]) => {
      result += `    - ${name}: ${version}\n`;
    });

    if (entries.length > limit) {
      result += `    ... +${entries.length - limit} more\n`;
    }

    return result;
  }

  /**
   * Get dependency context (package.json, imports)
   */
  getDependencyContext() {
    if (!CONTEXT_CONFIG.ENABLE_DEPENDENCIES) {
      return '';
    }

    return this.executeWithTiming('dependencies', () => {
      try {
        const normalizedLanguage = this.language || CORE_CONFIG.DEFAULT_LANGUAGE || 'js';
        let sections = this.buildDependencySectionsForLanguage(normalizedLanguage);
        let fallbackLanguage = null;

        if (sections.length === 0 && normalizedLanguage !== 'js') {
          sections = this.buildDependencySectionsForLanguage('js');
          if (sections.length > 0) {
            fallbackLanguage = 'js';
          }
        }

        let context = '--- Dependencies Context ---\n';
        context += `🔤 Language preference: ${normalizedLanguage}\n`;

        if (fallbackLanguage) {
          context += `ℹ️ No dependency manifests detected for ${normalizedLanguage}. Falling back to ${fallbackLanguage}.\n\n`;
        } else {
          context += '\n';
        }

        if (sections.length === 0) {
          context += 'No dependency manifests detected.\n';
        } else {
          context += `${sections.join('\n\n')}\n`;
        }

        context += '--- End Dependencies ---\n';
        return context;
      } catch (error) {
        core.warning(`⚠️  Could not get dependency context: ${error.message}`);
        return '';
      }
    });
  }

  /**
   * Get recent commit context for pattern analysis
   */
  getRecentCommitContext() {
    if (!CONTEXT_CONFIG.ENABLE_COMMIT_HISTORY) {
      return '';
    }

    return this.executeWithTiming('commit_history', () => {
      try {
        const commitCommand = `git log --oneline --no-merges origin/${this.baseBranch}..HEAD | head -${CONTEXT_CONFIG.MAX_COMMIT_HISTORY} | sed 's/^[a-f0-9]* //'`;
        const commits = ShellExecutor.execute(commitCommand);
        return `--- Recent Commits Context ---\n${commits}\n--- End Recent Commits ---\n`;
      } catch (error) {
        core.warning(`⚠️  Could not get recent commit context: ${error.message}`);
        return '';
      }
    });
  }

  /**
   * Get file relationship context (imports/exports between changed files)
   */
  getFileRelationshipsContext(changedFiles) {
    if (!CONTEXT_CONFIG.ENABLE_FILE_RELATIONSHIPS) {
      return '';
    }

    return this.executeWithTiming('file_relationships', () => {
      try {
        let context = '--- File Relationships Context ---\n';

        if (!changedFiles || changedFiles.length === 0) {
          context += 'No changed files to analyze relationships.\n';
          context += '--- End File Relationships ---\n';
          return context;
        }

        // DETERMINISM FIX: Sort files to ensure consistent order across runs
        const sortedFiles = [...changedFiles].sort((a, b) => a.localeCompare(b));

        // Analyze each changed file for comprehensive relationships
        for (const file of sortedFiles) {
          try {
            context += `\n🔗 ${file}:\n`;

            // Get file content to analyze
            const escapedFile = this.escapeFilePath(file);
            const fileContent = ShellExecutor.executeWithFallback(
              `git show HEAD:${escapedFile} 2>/dev/null`,
              `cat ${escapedFile} 2>/dev/null`
            );

            if (!fileContent.trim()) {
              context += '  (File not found or empty)\n';
              continue;
            }

            const fileLanguage = this.detectLanguageFromPath(file);
            const analyzer = getLanguageAnalyzer(fileLanguage);

            // Focus only on direct imports and exports (most relevant for review)
            const incomingRelationships = analyzer.getImports(fileContent) || [];
            if (incomingRelationships.length > 0) {
              context += '  📥 Imports:\n';
              incomingRelationships.slice(0, 5).forEach(rel => {
                // Limit to 5 most important
                context += `    ${rel}\n`;
              });
            }

            const outgoingRelationships = analyzer.getExports(fileContent) || [];
            if (outgoingRelationships.length > 0) {
              context += '  📤 Exports:\n';
              outgoingRelationships.slice(0, 5).forEach(rel => {
                // Limit to 5 most important
                context += `    ${rel}\n`;
              });
            }
          } catch (error) {
            context += `  ⚠️ Could not analyze ${file}: ${error.message}\n`;
          }
        }

        context += '\n--- End File Relationships ---\n';
        return context;
      } catch (error) {
        core.warning(`⚠️  Could not get file relationship context: ${error.message}`);
        return '';
      }
    });
  }

  /**
   * Get semantic code context - analyze what functions/classes are being used and their relationships
   */
  getSemanticCodeContext(changedFiles) {
    return this.executeWithTiming('semantic_code', () => {
      try {
        let context = '--- Semantic Code Context ---\n';

        if (!changedFiles || changedFiles.length === 0) {
          context += 'No changed files to analyze.\n';
          context += '--- End Semantic Code ---\n';
          return context;
        }

        // DETERMINISM FIX: Sort files to ensure consistent order across runs
        const sortedFiles = [...changedFiles].sort((a, b) => a.localeCompare(b));

        // Analyze each changed file for semantic understanding
        for (const file of sortedFiles) {
          try {
            context += `\n🔍 ${file}:\n`;

            // Get file content
            const escapedFile = this.escapeFilePath(file);
            const fileContent = ShellExecutor.executeWithFallback(
              `git show HEAD:${escapedFile} 2>/dev/null`,
              `cat ${escapedFile} 2>/dev/null`
            );

            if (!fileContent.trim()) {
              context += '  (File not found or empty)\n';
              continue;
            }

            const fileLanguage = this.detectLanguageFromPath(file);
            const analyzer = getLanguageAnalyzer(fileLanguage);

            // Extract only key function/class definitions (most relevant for review)
            const definitions = analyzer.getDefinitions(fileContent) || [];
            if (definitions.length > 0) {
              context += '  📝 Key Definitions:\n';
              definitions.slice(0, 5).forEach(def => {
                // Limit to 5 most important
                context += `    ${def}\n`;
              });
            }
          } catch (error) {
            context += `  ⚠️ Could not analyze ${file}: ${error.message}\n`;
          }
        }

        context += '\n--- End Semantic Code ---\n';
        return context;
      } catch (error) {
        core.warning(`⚠️  Could not get semantic code context: ${error.message}`);
        return '';
      }
    });
  }

  /**
   * Get comprehensive context for LLM with size limits and parallel processing
   */
  async getComprehensiveContext(changedFiles, estimatedTokens = 0) {
    const startTime = Date.now();

    core.info(
      `🔍 Context Service: Received ${changedFiles ? changedFiles.length : 0} changed files`
    );
    if (changedFiles && changedFiles.length > 0) {
      core.info(`🔍 Changed files: ${changedFiles.join(', ')}`);
    }

    // Generate focused context for code review - only what's truly relevant
    const contextPromises = [
      this.getSemanticCodeContext(changedFiles),
      this.getFileRelationshipsContext(changedFiles),
      this.getDependencyContext(),
      this.getRecentCommitContext()
    ];

    // Wait for all contexts to be generated in parallel
    const contexts = await Promise.all(contextPromises);
    const filteredContexts = contexts.filter(context => context.trim());

    // Organize context with LLM-focused structure
    const organizedContext = this.organizeLLMContext(filteredContexts, changedFiles);

    const totalTime = Date.now() - startTime;
    core.info(
      `🚀 Generated comprehensive context in ${totalTime}ms (${filteredContexts.length} contexts)`
    );

    // Apply relevance filtering
    const filteredContext = this.filterRelevantContext(organizedContext, changedFiles);
    const originalSize = Math.round(organizedContext.length / 1024);
    const filteredSize = Math.round(filteredContext.length / 1024);

    if (filteredSize < originalSize) {
      core.info(
        `🎯 Context filtered: ${originalSize}KB → ${filteredSize}KB (${Math.round((1 - filteredSize / originalSize) * 100)}% reduction)`
      );
    }

    // Calculate dynamic context size limit
    const dynamicLimit =
      estimatedTokens > 0
        ? this.calculateDynamicContextSize(estimatedTokens)
        : CONTEXT_CONFIG.MAX_CONTEXT_SIZE;

    // Limit context size to prevent token overflow
    if (filteredContext.length > dynamicLimit) {
      core.warning(
        `⚠️  Context size (${filteredSize}KB) exceeds dynamic limit (${Math.round(dynamicLimit / 1024)}KB), truncating...`
      );
      const truncatedContext =
        filteredContext.substring(0, dynamicLimit) +
        '\n\n--- [Context truncated due to size limits] ---';

      core.info(`📋 Final context (truncated): ${Math.round(truncatedContext.length / 1024)}KB`);
      return truncatedContext;
    }

    core.info(`📋 Final context: ${filteredSize}KB`);
    return filteredContext;
  }

  /**
   * Filter context based on relevance to changed files
   */
  filterRelevantContext(context, changedFiles) {
    if (!changedFiles || changedFiles.length === 0) {
      return context;
    }

    try {
      // Extract file extensions from changed files
      const changedExtensions = new Set(
        changedFiles.map(file => file.split('.').pop()).filter(Boolean)
      );

      // Filter project structure context to only include relevant files
      const lines = context.split('\n');
      const filteredLines = [];
      let inProjectStructure = false;
      let skipFile = false;

      for (const line of lines) {
        if (line.includes('--- Project Structure Context ---')) {
          inProjectStructure = true;
          filteredLines.push(line);
          continue;
        }

        if (line.includes('--- End Project Structure ---')) {
          inProjectStructure = false;
          filteredLines.push(line);
          continue;
        }

        if (inProjectStructure && line.startsWith('=== ')) {
          // Check if this file is relevant to changed files
          const filePath = line.replace('=== ', '').replace(' ===', '');
          const fileExt = filePath.split('.').pop();

          // Include if extension matches changed files or if it's a core file
          skipFile =
            !changedExtensions.has(fileExt) &&
            !filePath.includes('package.json') &&
            !filePath.includes('config') &&
            !filePath.includes('src/');
        }

        if (!skipFile) {
          filteredLines.push(line);
        }
      }

      return filteredLines.join('\n');
    } catch (error) {
      core.warning(`⚠️  Error filtering context: ${error.message}`);
      return context; // Return original context if filtering fails
    }
  }

  /**
   * Summarize large context for later chunks
   */
  summarizeContext(context, maxSize) {
    if (context.length <= maxSize) {
      return context;
    }

    // Extract key sections and summarize
    const sections = context.split('---');
    const summary = [];

    for (const section of sections) {
      if (section.includes('Dependencies Context')) {
        // Keep dependencies as-is (usually small)
        summary.push(`---${section}`);
      } else if (section.includes('Project Structure Context')) {
        // Summarize project structure
        const lines = section.split('\n').filter(line => line.trim());
        const keyFiles = lines.slice(0, 5); // Keep first 5 files
        summary.push(
          `--- Project Structure Context (Summary) ---\n${keyFiles.join('\n')}\n[Project structure truncated for brevity]\n--- End Project Structure ---`
        );
      } else if (section.includes('File Relationships Context')) {
        // Keep file relationships (usually small)
        summary.push(`---${section}`);
      } else if (section.includes('Recent Commits Context')) {
        // Keep recent commits (usually small)
        summary.push(`---${section}`);
      }
    }

    const summarized = summary.join('\n');
    if (summarized.length > maxSize) {
      return (
        summarized.substring(0, maxSize) + '\n\n--- [Context summarized due to size limits] ---'
      );
    }

    return summarized;
  }

  /**
   * Get context-aware chunk prompt
   */
  getContextAwareChunkPrompt(basePrompt, chunkIndex, totalChunks, context) {
    if (totalChunks === 1) {
      const singleChunkPrompt = `${basePrompt}\n\n${context}`;
      core.info(
        `📝 Generated single-chunk prompt: ${Math.round(singleChunkPrompt.length / 1024)}KB`
      );
      return singleChunkPrompt;
    }

    // For later chunks, summarize context to save tokens
    const processedContext =
      chunkIndex > 0
        ? this.summarizeContext(context, CONTEXT_CONFIG.MAX_CONTEXT_SIZE / 2)
        : context;

    const contextSize = Math.round(processedContext.length / 1024);
    const originalContextSize = Math.round(context.length / 1024);

    if (chunkIndex > 0 && processedContext.length < context.length) {
      core.info(
        `📝 Chunk ${chunkIndex + 1}/${totalChunks}: Context summarized ${originalContextSize}KB → ${contextSize}KB`
      );
    } else {
      core.info(`📝 Chunk ${chunkIndex + 1}/${totalChunks}: Using full context (${contextSize}KB)`);
    }

    const chunkPrompt = `${basePrompt}

**CHUNK CONTEXT:** This is chunk ${chunkIndex + 1} of ${totalChunks} total chunks.
**PROJECT CONTEXT:** ${processedContext}

**INSTRUCTIONS:** 
- Review this specific portion of the code changes
- Consider the project context and file relationships provided above
- Focus on issues that are relevant to this chunk
- If you find critical issues, mark them clearly
- Provide specific, actionable feedback for this code section
- Consider how this chunk relates to the overall changes and project structure

============================================================
📋 ACTUAL CODE CHANGES TO REVIEW (REVIEW THESE ONLY):
============================================================

**The following diffs/files are what you should review:**`;

    const totalPromptSize = Math.round(chunkPrompt.length / 1024);
    core.info(
      `📝 Generated context-aware prompt for chunk ${chunkIndex + 1}: ${totalPromptSize}KB total`
    );

    return chunkPrompt;
  }

  /**
   * Organize context sections for LLM consumption with better structure
   */
  organizeLLMContext(contexts, changedFiles) {
    if (!contexts || contexts.length === 0) {
      return '';
    }

    let organizedContext = '🧠 LLM-FOCUSED CODE REVIEW CONTEXT\n';
    organizedContext += '='.repeat(60) + '\n\n';

    // Add changed files summary
    if (changedFiles && changedFiles.length > 0) {
      organizedContext += '📝 FILES BEING REVIEWED:\n';
      changedFiles.forEach((file, index) => {
        organizedContext += `  ${index + 1}. ${file}\n`;
      });
      organizedContext += '\n';
    }

    // Process each context section with LLM-focused formatting
    contexts.forEach(context => {
      if (!context.trim()) return;

      // Extract section type and content
      const lines = context.split('\n');
      let sectionType = '';
      let content = '';
      let inSection = false;

      for (const line of lines) {
        if (line.includes('---') && line.includes('Context')) {
          sectionType = line
            .replace(/---/g, '')
            .replace(/Context/g, '')
            .trim();
          inSection = true;
          continue;
        }
        if (line.includes('--- End')) {
          inSection = false;
          continue;
        }
        if (inSection) {
          content += line + '\n';
        }
      }

      // Format section based on type with LLM-friendly structure
      if (sectionType && content.trim()) {
        const emoji = this.getContextEmoji(sectionType);
        organizedContext += `${emoji} ${sectionType.toUpperCase()}:\n`;
        organizedContext += '-'.repeat(40) + '\n';
        organizedContext += content.trim() + '\n\n';
      }
    });

    organizedContext += '='.repeat(60) + '\n';
    organizedContext += 'END LLM CONTEXT\n\n';

    return organizedContext;
  }

  /**
   * Get emoji for context section type
   */
  getContextEmoji(sectionType) {
    const emojiMap = {
      'semantic code': '🔍',
      'file relationships': '🔗',
      architectural: '🏗️',
      'test context': '🧪',
      'code patterns': '🔄',
      security: '🔒',
      performance: '⚡',
      configuration: '⚙️',
      documentation: '📚',
      dependencies: '📦',
      'commit history': '📜',
      'project structure': '📁'
    };
    return emojiMap[sectionType.toLowerCase()] || '📋';
  }
}

module.exports = ContextService;
