/**
 * File service for handling git operations, file filtering, and chunking
 */

const core = require('@actions/core');
const { execSync } = require('child_process');
const { CONFIG } = require('../constants');

class FileService {
  constructor(baseBranch, language, pathToFiles, ignorePatterns) {
    this.baseBranch = baseBranch;
    this.language = language;
    this.pathToFiles = pathToFiles;
    this.ignorePatterns = ignorePatterns;
    this.chunkSize = CONFIG.DEFAULT_CHUNK_SIZE;
  }

  /**
   * Get changed files from git diff with language filtering
   */
  getChangedFiles() {
    try {
      core.info('🔍 Detecting changed files...');
      core.info(`Comparing ${process.env.GITHUB_SHA || 'HEAD'} against origin/${this.baseBranch}`);
      core.info(
        `🔤 Language filter: ${this.language} (${CONFIG.LANGUAGE_CONFIGS[this.language]?.name || 'Unknown'})`
      );

      const rawOutput = execSync(`git diff --name-only origin/${this.baseBranch}...HEAD`, {
        encoding: 'utf8'
      });
      const allFiles = rawOutput
        .split('\n')
        .filter(Boolean) // Remove empty lines
        .filter(file => {
          // Check if file matches any of the specified paths
          const matchesPath = this.pathToFiles.some(path => file.startsWith(path));

          // Check if file should be ignored using ignore patterns from input or default
          const shouldIgnore = this.ignorePatterns.some(pattern => file.endsWith(pattern));

          // Check if file matches the specified language
          const matchesLanguage = this.matchesLanguage(file);

          return matchesPath && !shouldIgnore && matchesLanguage;
        });

      core.info(`Found ${allFiles.length} changed files matching language: ${this.language}`);

      return allFiles;
    } catch (error) {
      core.error(`❌ Error getting changed files: ${error.message}`);
      return [];
    }
  }

  /**
   * Check if file matches the specified language
   */
  matchesLanguage(filePath) {
    const languageConfig = CONFIG.LANGUAGE_CONFIGS[this.language];
    if (!languageConfig) {
      core.warning(`⚠️  Unknown language: ${this.language}, defaulting to all files`);
      return true; // Default to include all files if language not recognized
    }

    return languageConfig.extensions.some(ext => filePath.endsWith(ext));
  }

  /**
   * Get diff for a single file
   */
  getFileDiff(filePath) {
    try {
      // Enhanced diff with more context lines and file structure
      // Using unified=10 for optimal balance between context and performance
      const diffCommand = `git diff origin/${this.baseBranch}...HEAD --unified=10 --no-prefix --ignore-blank-lines --ignore-space-at-eol --no-color -- "${filePath}"`;
      const diff = execSync(diffCommand, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }); // 10MB buffer

      // Add file structure context
      const fileStructure = this.getFileStructureContext(filePath);

      return `${fileStructure}\n${diff}`;
    } catch (error) {
      core.warning(`⚠️  Could not get diff for ${filePath}: ${error.message}`);
      return '';
    }
  }

  /**
   * Get file structure context (imports, exports, class/function definitions)
   */
  getFileStructureContext(filePath) {
    try {
      // Get file structure without full content (try multiple approaches)
      let structure = '';
      try {
        // First try git show - get more comprehensive structure
        const structureCommand = `git show HEAD:${filePath} 2>/dev/null | head -100 | grep -E '^(import|export|class|function|func|struct|protocol|extension|actor|const|let|var|interface|type|enum|module\\.exports|require\\(|@State|@Binding|@ObservedObject|@StateObject|\\/\\*|\\/\\/|^\\s*\\/\\*|^\\s*\\/\\/)' | head -30`;
        structure = execSync(structureCommand, { encoding: 'utf8', maxBuffer: 1024 * 1024 });
      } catch {
        // If git show fails, try reading file directly
        try {
          const directCommand = `cat ${filePath} 2>/dev/null | head -100 | grep -E '^(import|export|class|function|func|struct|protocol|extension|actor|const|let|var|interface|type|enum|module\\.exports|require\\(|@State|@Binding|@ObservedObject|@StateObject|\\/\\*|\\/\\/|^\\s*\\/\\*|^\\s*\\/\\/)' | head -30`;
          structure = execSync(directCommand, { encoding: 'utf8', maxBuffer: 1024 * 1024 });
        } catch {
          // If both fail, return basic file header
          return `--- File: ${filePath} ---\n`;
        }
      }

      if (structure.trim()) {
        return `--- File Structure Context for ${filePath} ---\n${structure}\n--- End Structure ---\n`;
      } else {
        return `--- File: ${filePath} ---\n`;
      }
    } catch {
      // If structure extraction fails, continue without it
      return `--- File: ${filePath} ---\n`;
    }
  }

  /**
   * Split diff into chunks based on size
   */
  splitDiffIntoChunks(diff, maxChunkSize = null) {
    const chunkSize = maxChunkSize || this.chunkSize;

    if (!diff || diff.length === 0) {
      return [];
    }

    // Ensure chunk size is reasonable
    if (chunkSize <= 0) {
      core.warning(
        `⚠️  Invalid chunk size: ${chunkSize}, using default: ${CONFIG.DEFAULT_CHUNK_SIZE}`
      );
      return [diff]; // Return as single chunk if chunk size is invalid
    }

    const chunks = [];
    let currentChunk = '';
    let currentSize = 0;

    // Split by file boundaries (--- File: ... ---)
    const fileSections = diff.split(/(?=--- File: )/);

    for (const section of fileSections) {
      const sectionSize = Buffer.byteLength(section, 'utf8');

      // If adding this section would exceed chunk size, start a new chunk
      if (currentSize + sectionSize > chunkSize && currentChunk.length > 0) {
        chunks.push(currentChunk);
        currentChunk = section;
        currentSize = sectionSize;
      } else {
        currentChunk += section;
        currentSize += sectionSize;
      }
    }

    // Add the last chunk if it has content
    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
    }

    core.info(
      `📦 Split diff into ${chunks.length} chunks (max ${Math.round(chunkSize / 1024)}KB each)`
    );

    // Warn if too many chunks are created
    if (chunks.length > 50) {
      core.warning(
        `⚠️  Large number of chunks (${chunks.length}) created. Consider increasing chunk size.`
      );
    }

    return chunks;
  }

  /**
   * Get full diff for all changed files with chunking support
   */
  getFullDiff() {
    try {
      const changedFiles = this.getChangedFiles();

      if (changedFiles.length === 0) {
        return '';
      }

      core.info(`📊 Processing ${changedFiles.length} files for diff generation...`);

      const allDiffs = [];

      // Process files one by one to avoid command line length issues
      for (let i = 0; i < changedFiles.length; i++) {
        const filePath = changedFiles[i];
        core.info(`📄 Processing diff for: ${filePath} (${i + 1}/${changedFiles.length})`);

        const fileDiff = this.getFileDiff(filePath);

        if (fileDiff) {
          const diffWithHeader = `\n--- File: ${filePath} ---\n${fileDiff}\n`;
          allDiffs.push(diffWithHeader);
        }
      }

      const finalDiff = allDiffs.join('\n');
      core.info(
        `✅ Generated diff of ${allDiffs.length} files, total size: ${Math.round(Buffer.byteLength(finalDiff, 'utf8') / 1024)}KB`
      );

      if (allDiffs.length === 0) {
        core.warning('⚠️  No valid diffs could be generated for any files');
        return '';
      }

      return finalDiff;
    } catch (error) {
      core.error(`❌ Error getting diff: ${error.message}`);
      return '';
    }
  }
}

module.exports = FileService;
