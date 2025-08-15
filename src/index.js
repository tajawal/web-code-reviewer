#!/usr/bin/env node

const core = require('@actions/core');
const github = require('@actions/github');
const { execSync } = require('child_process');
const { CONFIG, LLM_PROVIDERS, getReviewPrompt } = require('./constants');

/**
 * GitHub Actions Code Reviewer
 */
class GitHubActionsReviewer {
  constructor() {
    // Get inputs from action
    this.provider = core.getInput('llm_provider') || CONFIG.DEFAULT_PROVIDER;
    this.pathToFiles = this.parsePathToFiles(core.getInput('path_to_files') || CONFIG.DEFAULT_PATH_TO_FILES);
    this.language = core.getInput('language') || CONFIG.DEFAULT_LANGUAGE;
    this.maxTokens = parseInt(core.getInput('max_tokens')) || CONFIG.MAX_TOKENS;
    this.temperature = parseFloat(core.getInput('temperature')) || CONFIG.TEMPERATURE;
    
    // Chunking configuration - Always use CONFIG defaults
    this.chunkSize = CONFIG.DEFAULT_CHUNK_SIZE;
    this.maxConcurrentRequests = CONFIG.MAX_CONCURRENT_REQUESTS;
    this.batchDelayMs = CONFIG.BATCH_DELAY_MS;
    
    // GitHub context
    this.octokit = github.getOctokit(process.env.GITHUB_TOKEN);
    this.context = github.context;
    
    // Get base branch dynamically from PR or use input/default
    this.baseBranch = this.getBaseBranch();
    
    // Set environment variables for API keys
    if (this.provider === 'openai') {
      const openaiKey = core.getInput('openai_api_key');
      if (openaiKey) {
        process.env.OPENAI_API_KEY = openaiKey;
      }
    } else if (this.provider === 'claude') {
      const claudeKey = core.getInput('claude_api_key');
      if (claudeKey) {
        process.env.CLAUDE_API_KEY = claudeKey;
      }
    }
  }

  /**
   * Parse path_to_files input to support multiple comma-separated paths
   */
  parsePathToFiles(input) {
    if (!input) {
      return [CONFIG.DEFAULT_PATH_TO_FILES];
    }
    
    // Split by comma and clean up whitespace
    const paths = input.split(',').map(path => path.trim()).filter(path => path.length > 0);
    
    if (paths.length === 0) {
      return [CONFIG.DEFAULT_PATH_TO_FILES];
    }
    
    core.info(`📁 Parsed paths to review: ${paths.join(', ')}`);
    return paths;
  }

  /**
   * Get base branch dynamically from PR or use input/default
   */
  getBaseBranch() {
    // If we're in a pull request context, get the base branch from the PR
    if (this.context.eventName === 'pull_request' && this.context.payload.pull_request) {
      const prBaseBranch = this.context.payload.pull_request.base.ref;
      core.info(`📋 Using PR base branch: ${prBaseBranch}`);
      return prBaseBranch;
    }
    
    // Fallback to input or default
    const inputBaseBranch = core.getInput('base_branch');
    if (inputBaseBranch) {
      core.info(`📋 Using input base branch: ${inputBaseBranch}`);
      return inputBaseBranch;
    }
    
    core.info(`📋 Using default base branch: ${CONFIG.DEFAULT_BASE_BRANCH}`);
    return CONFIG.DEFAULT_BASE_BRANCH;
  }

  /**
   * Get changed files from git diff with language filtering
   */
  getChangedFiles() {
    try {
      core.info('🔍 Detecting changed files...');
      core.info(`Comparing ${this.context.sha} against origin/${this.baseBranch}`);
      core.info(`🔤 Language filter: ${this.language} (${CONFIG.LANGUAGE_CONFIGS[this.language]?.name || 'Unknown'})`);
      
      const rawOutput = execSync(`git diff --name-only origin/${this.baseBranch}...HEAD`, { encoding: 'utf8' });
      const allFiles = rawOutput
        .split('\n')
        .filter(Boolean) // Remove empty lines
        .filter(file => {
          // Check if file matches any of the specified paths
          const matchesPath = this.pathToFiles.some(path => file.startsWith(path));
          
          // Check if file should be ignored
          const shouldIgnore = file.endsWith('.json') ||
                              file.endsWith('.md') ||
                              file.endsWith('.test.js') ||
                              file.endsWith('.spec.js');
          
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
      const diffCommand = `git diff origin/${this.baseBranch}...HEAD --unified=3 --no-prefix --ignore-blank-lines --ignore-space-at-eol --no-color -- "${filePath}"`;
      const diff = execSync(diffCommand, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }); // 10MB buffer
      return diff;
    } catch (error) {
      core.warning(`⚠️  Could not get diff for ${filePath}: ${error.message}`);
      return '';
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
      core.warning(`⚠️  Invalid chunk size: ${chunkSize}, using default: ${CONFIG.DEFAULT_CHUNK_SIZE}`);
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
    
    core.info(`📦 Split diff into ${chunks.length} chunks (max ${Math.round(chunkSize / 1024)}KB each)`);
    
    // Warn if too many chunks are created
    if (chunks.length > 50) {
      core.warning(`⚠️  Large number of chunks (${chunks.length}) created. Consider increasing chunk size.`);
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
      
      let allDiffs = [];
      
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
      core.info(`✅ Generated diff of ${allDiffs.length} files, total size: ${Math.round(Buffer.byteLength(finalDiff, 'utf8') / 1024)}KB`);
      
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

  /**
   * Estimate token count for text (rough approximation)
   */
  estimateTokenCount(prompt, diff) {
    // Rough estimation: ~4 characters per token for code
    const totalText = prompt + diff;
    return Math.ceil(totalText.length / 4);
  }

  /**
   * Create optimized prompt for chunk processing
   */
  createChunkPrompt(prompt, chunkIndex, totalChunks) {
    if (totalChunks === 1) {
      return prompt;
    }
    
    return `${prompt}

**CHUNK CONTEXT:** This is chunk ${chunkIndex + 1} of ${totalChunks} total chunks.
**INSTRUCTIONS:** 
- Review this specific portion of the code changes
- Focus on issues that are relevant to this chunk
- If you find critical issues, mark them clearly
- Provide specific, actionable feedback for this code section
- Consider how this chunk relates to the overall changes

**CODE CHANGES TO REVIEW:**`;
  }

  /**
   * Process chunks with adaptive concurrency based on chunk count
   */
  async processChunksIntelligently(prompt, chunks) {
    const results = [];
    
    if (chunks.length <= 3) {
      // For small numbers, process sequentially with delays
      core.info(`📦 Processing ${chunks.length} chunks sequentially (small batch)`);
      
      for (let i = 0; i < chunks.length; i++) {
        core.info(`📦 Processing chunk ${i + 1}/${chunks.length}`);
        
        const result = await this.callLLMChunk(prompt, chunks[i], i, chunks.length);
        results.push(result);
        
        if (i + 1 < chunks.length) {
          core.info(`⏳ Waiting ${this.batchDelayMs}ms before next request...`);
          await new Promise(resolve => setTimeout(resolve, this.batchDelayMs));
        }
      }
    } else {
      // For larger numbers, use controlled concurrency
      const maxConcurrent = Math.min(2, chunks.length); // Max 2 concurrent requests
      core.info(`📦 Processing ${chunks.length} chunks with controlled concurrency (max ${maxConcurrent})`);
      
      for (let i = 0; i < chunks.length; i += maxConcurrent) {
        const batch = chunks.slice(i, i + maxConcurrent);
        const batchPromises = batch.map((chunk, batchIndex) => 
          this.callLLMChunk(prompt, chunk, i + batchIndex, chunks.length)
        );
        
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
        
        // Add delay between batches
        if (i + maxConcurrent < chunks.length) {
          core.info(`⏳ Waiting ${this.batchDelayMs}ms before next batch...`);
          await new Promise(resolve => setTimeout(resolve, this.batchDelayMs));
        }
      }
    }
    
    return results;
  }

  /**
   * Parse error response from API
   */
  parseErrorResponse(errorText) {
    try {
      const errorData = JSON.parse(errorText);
      return errorData.error?.message || errorData.message || errorText;
    } catch {
      return errorText;
    }
  }

  /**
   * Handle token limit exceeded errors
   */
  handleTokenLimitExceeded(chunkIndex, totalChunks) {
    core.warning(`⚠️  Token limit exceeded for chunk ${chunkIndex + 1}. Creating summary review...`);
    
    return `**CHUNK ${chunkIndex + 1}/${totalChunks} - TOKEN LIMIT EXCEEDED**

This chunk was too large to process completely. Here's a summary of what was detected:

🔍 **Large Code Changes Detected**
- This chunk contains significant code changes
- Manual review recommended for this section
- Consider breaking down large files into smaller changes

⚠️ **Recommendation**: Please review this code section manually to ensure:
- No security vulnerabilities
- Proper error handling
- Performance considerations
- Code quality standards

*Note: This is an automated summary due to token limits. Full review requires manual inspection.*`;
  }

  /**
   * Validate LLM response structure
   */
  validateLLMResponse(data, provider) {
    if (!data) return false;
    
    if (provider === 'claude') {
      return data.content && Array.isArray(data.content) && data.content.length > 0;
    } else if (provider === 'openai') {
      return data.choices && Array.isArray(data.choices) && data.choices.length > 0;
    }
    
    return false;
  }

  /**
   * Get API key for the current provider
   */
  getApiKey() {
    if (this.provider === 'openai') {
      return process.env.OPENAI_API_KEY;
    } else if (this.provider === 'claude') {
      return process.env.CLAUDE_API_KEY;
    }
    return null;
  }

  /**
   * Call LLM API for a single chunk with improved error handling and retry logic
   */
  async callLLMChunk(prompt, diffChunk, chunkIndex, totalChunks) {
    const maxRetries = 3;
    const baseDelay = 1000; // 1 second base delay
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const { default: fetch } = await import('node-fetch');
        
        const providerConfig = LLM_PROVIDERS[this.provider];
        if (!providerConfig) {
          throw new Error(`Unsupported LLM provider: ${this.provider}`);
        }

        const apiKey = this.getApiKey();
        if (!apiKey) {
          core.warning(`⚠️  No ${this.provider.toUpperCase()} API key found. Skipping LLM review.`);
          return null;
        }

        // Estimate token count for this chunk
        const estimatedTokens = this.estimateTokenCount(prompt, diffChunk);
        if (estimatedTokens > 180000) { // Leave buffer for Claude's 200k limit
          core.warning(`⚠️  Chunk ${chunkIndex + 1} estimated at ${estimatedTokens} tokens - may exceed limits`);
        }

        // Create chunk-specific prompt with better context
        const chunkPrompt = this.createChunkPrompt(prompt, chunkIndex, totalChunks);
        
        core.info(`🤖 Calling ${this.provider.toUpperCase()} LLM for chunk ${chunkIndex + 1}/${totalChunks} (attempt ${attempt}/${maxRetries})...`);
        
        const response = await fetch(providerConfig.url, {
          method: 'POST',
          headers: providerConfig.headers(apiKey),
          body: JSON.stringify(providerConfig.body(chunkPrompt, diffChunk)),
          timeout: 60000 // 60 second timeout
        });

        if (!response.ok) {
          const errorText = await response.text();
          const errorData = this.parseErrorResponse(errorText);
          
          if (response.status === 429) {
            // Rate limit - exponential backoff
            const retryAfter = parseInt(response.headers.get('retry-after')) || Math.pow(2, attempt);
            core.warning(`⚠️  Rate limit hit for chunk ${chunkIndex + 1}. Waiting ${retryAfter}s (attempt ${attempt}/${maxRetries})...`);
            await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
            continue; // Retry with next attempt
          } else if (response.status === 400 && errorData.includes('token')) {
            // Token limit exceeded
            core.error(`❌ Token limit exceeded for chunk ${chunkIndex + 1}: ${errorData}`);
            return this.handleTokenLimitExceeded(chunkIndex, totalChunks);
          } else if (response.status >= 500) {
            // Server error - retry with exponential backoff
            const delay = baseDelay * Math.pow(2, attempt - 1);
            core.warning(`⚠️  Server error (${response.status}) for chunk ${chunkIndex + 1}. Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          } else {
            throw new Error(`${this.provider.toUpperCase()} API error: ${response.status} ${response.statusText} - ${errorData}`);
          }
        }

        const data = await response.json();
        
        // Validate response structure
        if (!this.validateLLMResponse(data, this.provider)) {
          throw new Error(`Invalid response structure from ${this.provider.toUpperCase()} API`);
        }
        
        const result = providerConfig.extractResponse(data);
        
        // Validate extracted response
        if (!result || typeof result !== 'string' || result.trim().length === 0) {
          throw new Error(`Empty or invalid response from ${this.provider.toUpperCase()} API`);
        }
        
        core.info(`✅ Received valid response for chunk ${chunkIndex + 1}/${totalChunks} (${result.length} chars)`);
        return result;
        
      } catch (error) {
        if (error.message.includes('Cannot find module') || error.message.includes('node-fetch')) {
          core.error('❌ node-fetch not found. Please install it with: npm install node-fetch');
          return null;
        }
        
        if (attempt === maxRetries) {
          core.error(`❌ LLM review failed for chunk ${chunkIndex + 1} after ${maxRetries} attempts: ${error.message}`);
          return null;
        } else {
          const delay = baseDelay * Math.pow(2, attempt - 1);
          core.warning(`⚠️  Attempt ${attempt}/${maxRetries} failed for chunk ${chunkIndex + 1}. Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    return null;
  }

  /**
   * Call LLM API with improved chunking and intelligent processing
   */
  async callLLM(prompt, diff) {
    try {
      const apiKey = this.getApiKey();
      if (!apiKey) {
        core.warning(`⚠️  No ${this.provider.toUpperCase()} API key found. Skipping LLM review.`);
        return null;
      }

      const diffSize = Buffer.byteLength(diff, 'utf8');
      const estimatedTokens = this.estimateTokenCount(prompt, diff);
      
      core.info(`📊 Diff analysis: ${Math.round(diffSize / 1024)}KB, ~${estimatedTokens} tokens`);
      
      // If diff is small enough, process it normally
      if (diffSize <= this.chunkSize && estimatedTokens < 150000) {
        core.info(`🤖 Processing single diff chunk (${Math.round(diffSize / 1024)}KB, ~${estimatedTokens} tokens)...`);
        return await this.callLLMChunk(prompt, diff, 0, 1);
      }
      
      // Split diff into chunks with intelligent sizing
      const chunks = this.splitDiffIntoChunks(diff);
      
      if (chunks.length === 0) {
        core.warning('⚠️  No chunks created from diff');
        return null;
      }
      
      core.info(`🚀 Processing ${chunks.length} chunks with intelligent batching...`);
      
      // Process chunks with adaptive concurrency
      const results = await this.processChunksIntelligently(prompt, chunks);
      
      // Filter out failed responses and combine results
      const validResults = results.filter(result => result !== null);
      
      if (validResults.length === 0) {
        core.error('❌ All LLM API calls failed');
        return null;
      }
      
      if (validResults.length < chunks.length) {
        core.warning(`⚠️  Only ${validResults.length}/${chunks.length} chunks processed successfully`);
      }
      
      // Combine all responses with improved logic
      const combinedResponse = this.combineLLMResponses(validResults, chunks.length);
      
      core.info(`✅ Successfully processed ${validResults.length}/${chunks.length} chunks`);
      return combinedResponse;
      
    } catch (error) {
      core.error(`❌ LLM review failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Combine multiple LLM responses into a single coherent review with improved analysis
   */
  combineLLMResponses(responses, totalChunks) {
    if (responses.length === 0) {
      return 'No review results available.';
    }
    
    if (responses.length === 1) {
      return responses[0];
    }
    
    // Extract and categorize information from each response
    let combinedResponse = '';
    
    responses.forEach((response) => {
      combinedResponse += response
    });
    
    return combinedResponse;
  }

  /**
   * Check if LLM response indicates merge should be blocked based on JSON analysis
   */
  checkMergeDecision(llmResponse) {
    try {
      // Try to extract all JSON objects from the response
      const jsonMatches = llmResponse.match(/```json\s*([\s\S]*?)\s*```/g);
      
      if (jsonMatches && jsonMatches.length > 0) {
        core.info(`📊 Found ${jsonMatches.length} JSON objects in response`);
        
        // Parse all JSON objects and combine their data
        const allIssues = [];
        let hasBlockingRecommendation = false;
        let totalCriticalCount = 0;
        
        jsonMatches.forEach((match, index) => {
          try {
            const jsonStr = match.replace(/```json\s*/, '').replace(/\s*```/, '');
            const reviewData = JSON.parse(jsonStr);
            
            core.info(`📋 Parsing JSON object ${index + 1}/${jsonMatches.length}: ${reviewData.issues?.length || 0} issues`);
            
            // Check final recommendation from this chunk
            if (reviewData.final_recommendation) {
              if (reviewData.final_recommendation === 'do_not_merge') {
                hasBlockingRecommendation = true;
                core.info(`🤖 Chunk ${index + 1} final recommendation: ${reviewData.final_recommendation} (BLOCK)`);
              } else {
                core.info(`🤖 Chunk ${index + 1} final recommendation: ${reviewData.final_recommendation} (APPROVE)`);
              }
            }
            
            // Collect issues
            if (reviewData.issues && Array.isArray(reviewData.issues)) {
              reviewData.issues.forEach(issue => {
                // Add chunk context to issue
                const issueWithContext = {
                  ...issue,
                  chunk: index + 1,
                  originalId: issue.id
                };
                allIssues.push(issueWithContext);
              });
            }
            
            // Collect metrics
            if (reviewData.metrics) {
              totalCriticalCount += reviewData.metrics.critical_count || 0;
            }
            
          } catch (parseError) {
            core.warning(`⚠️  Error parsing JSON object ${index + 1}: ${parseError.message}`);
          }
        });
        
        // Check if any chunk recommended blocking
        if (hasBlockingRecommendation) {
          core.info(`🚨 At least one chunk recommended blocking the merge`);
          return true;
        }
        
        // Analyze all issues based on severity and confidence
        if (allIssues.length > 0) {
          const criticalIssues = allIssues.filter(issue => 
            issue.severity_proposed === 'critical' && issue.confidence >= 0.6
          );
          
          const highConfidenceCritical = criticalIssues.length;
          
          if (highConfidenceCritical > 0) {
            core.info(`🚨 Found ${highConfidenceCritical} critical issues with confidence ≥ 0.6 across all chunks`);
            core.info(`   Issues: ${criticalIssues.map(i => `${i.originalId} (${i.category}, Chunk ${i.chunk}, score: ${i.severity_score?.toFixed(1) || 'N/A'})`).join(', ')}`);
            return true; // Block merge
          }
          
          // Log all issues for transparency with severity scores
          const allIssuesSummary = allIssues.map(issue => 
            `${issue.severity_proposed.toUpperCase()} ${issue.originalId}: ${issue.category} (Chunk ${issue.chunk}, score: ${issue.severity_score?.toFixed(1) || 'N/A'}, confidence: ${issue.confidence})`
          );
          
          if (allIssuesSummary.length > 0) {
            core.info(`📋 All issues found: ${allIssuesSummary.join(', ')}`);
          }
        }
        
        // Check combined metrics
        if (totalCriticalCount > 0) {
          core.info(`🚨 Total critical issues count across all chunks: ${totalCriticalCount}`);
          return true; // Block merge if any critical issues
        }
        
        core.info('✅ No critical issues found across all chunks - safe to merge');
        return false;
      }
      
      // Fallback to old text-based parsing if JSON not found
      core.warning('⚠️  JSON not found in response, falling back to text-based parsing');
      return this.checkMergeDecisionLegacy(llmResponse);
      
    } catch (error) {
      core.warning(`⚠️  Error parsing JSON response: ${error.message}`);
      core.warning('⚠️  Falling back to text-based parsing');
      return this.checkMergeDecisionLegacy(llmResponse);
    }
  }

  /**
   * Legacy text-based merge decision checking (fallback)
   */
  checkMergeDecisionLegacy(llmResponse) {
    const response = llmResponse.toLowerCase();

    // Check for explicit approval phrases
    for (const phrase of CONFIG.APPROVAL_PHRASES) {
      if (response.includes(phrase)) {
        core.info(`✅ Found approval phrase: "${phrase}"`);
        return false; // Safe to merge
      }
    }

    // Check for explicit blocking phrases
    for (const phrase of CONFIG.BLOCKING_PHRASES) {
      if (response.includes(phrase)) {
        core.info(`🚨 Found blocking phrase: "${phrase}"`);
        return true; // Block merge
      }
    }

    // Check for critical issue indicators
    let criticalIssueCount = 0;
    for (const issue of CONFIG.CRITICAL_ISSUES) {
      if (response.includes(issue)) {
        criticalIssueCount++;
      }
    }
    
    if (criticalIssueCount >= 2) {
      core.info(`🚨 Found ${criticalIssueCount} critical issues without explicit approval`);
      return true;
    }
    
    core.info('⚠️  No explicit merge decision found, defaulting to allow merge');
    return false;
  }

  /**
   * Add PR comment to GitHub
   */
  async addPRComment(comment) {
    if (this.context.eventName !== 'pull_request') {
      core.info('⚠️  Not a pull request event, skipping PR comment');
      return;
    }

    try {
      await this.octokit.rest.issues.createComment({
        owner: this.context.repo.owner,
        repo: this.context.repo.repo,
        issue_number: this.context.issue.number,
        body: comment
      });
      
      core.info('✅ Added PR comment successfully');
    } catch (error) {
      core.error(`❌ Error adding PR comment: ${error.message}`);
    }
  }

  /**
   * Generate PR comment content with enhanced JSON parsing
   */
  generatePRComment(shouldBlockMerge, changedFiles, llmResponse) {
    const status = shouldBlockMerge ? '❌ **DO NOT MERGE**' : '✅ **SAFE TO MERGE**';
    const statusDescription = shouldBlockMerge 
      ? 'Issues found that must be addressed before merging' 
      : 'All changes are safe and well-implemented';

    // Try to extract and parse JSON for enhanced display
    let reviewSummary = '';
    let issueDetails = '';
    
    try {
      // Find all JSON matches in the response
      const jsonMatches = llmResponse.match(/```json\s*([\s\S]*?)\s*```/g);
      
      if (jsonMatches && jsonMatches.length > 0) {
        core.info(`📊 Found ${jsonMatches.length} JSON objects in response`);
        
        // Parse all JSON objects and combine their data
        const allIssues = [];
        const allSummaries = [];
        let totalCriticalCount = 0;
        let totalSuggestionCount = 0;
        
        jsonMatches.forEach((match, index) => {
          try {
            const jsonStr = match.replace(/```json\s*/, '').replace(/\s*```/, '');
            const reviewData = JSON.parse(jsonStr);
            
            core.info(`📋 Parsing JSON object ${index + 1}/${jsonMatches.length}: ${reviewData.issues?.length || 0} issues`);
            
            // Collect summary
            if (reviewData.summary) {
              allSummaries.push(`**Chunk ${index + 1}**: ${reviewData.summary}`);
            }
            
            // Collect issues
            if (reviewData.issues && Array.isArray(reviewData.issues)) {
              reviewData.issues.forEach(issue => {
                // Add chunk context to issue
                const issueWithContext = {
                  ...issue,
                  chunk: index + 1,
                  originalId: issue.id
                };
                allIssues.push(issueWithContext);
              });
            }
            
            // Collect metrics
            if (reviewData.metrics) {
              totalCriticalCount += reviewData.metrics.critical_count || 0;
              totalSuggestionCount += reviewData.metrics.suggestion_count || 0;
            }
            
          } catch (parseError) {
            core.warning(`⚠️  Error parsing JSON object ${index + 1}: ${parseError.message}`);
          }
        });
        
        // Create combined summary
        if (allSummaries.length > 0) {
          reviewSummary = `**AI Summary**: ${allSummaries.join(' ')}\n\n`;
        }
        
        // Create structured issue display from combined data
        if (allIssues.length > 0) {
          const criticalIssues = allIssues.filter(i => i.severity_proposed === 'critical');
          const suggestions = allIssues.filter(i => i.severity_proposed === 'suggestion');
          
          issueDetails = `## 🔍 **Issues Found**\n\n`;
          
          if (criticalIssues.length > 0) {
            issueDetails += `### 🚨 **Critical Issues (${criticalIssues.length})**\n`;
            criticalIssues.forEach(issue => {
              issueDetails += `🔴 ${issue.originalId} - ${issue.category.toUpperCase()} (Chunk ${issue.chunk})\n`;
              issueDetails += `- **File**: \`${issue.file}\` (lines ${issue.lines.join('-')})\n`;
              issueDetails += `- **Severity Score**: ${issue.severity_score?.toFixed(1) || 'N/A'}/5.0\n`;
              issueDetails += `- **Confidence**: ${Math.round(issue.confidence * 100)}%\n`;
              issueDetails += `- **Impact**: ${issue.why_it_matters}\n`;
              if (issue.fix) {
                issueDetails += `- **Fix**: ${issue.fix}\n`;
              }
              if (issue.tests) {
                issueDetails += `- **Test**: ${issue.tests}\n`;
              }
              if (issue.snippet) {
                issueDetails += `${issue.snippet}\n`;
              }
              issueDetails += `\n`;
            });
          }
          
          if (suggestions.length > 0) {
            issueDetails += `### 💡 **Suggestions (${suggestions.length})**\n`;
            suggestions.forEach(issue => {
              issueDetails += `🟡 ${issue.originalId} - ${issue.category.toUpperCase()} (Chunk ${issue.chunk})\n`;
              issueDetails += `- **File**: \`${issue.file}\` (lines ${issue.lines.join('-')})\n`;
              issueDetails += `- **Severity Score**: ${issue.severity_score?.toFixed(1) || 'N/A'}/5.0\n`;
              issueDetails += `- **Confidence**: ${Math.round(issue.confidence * 100)}%\n`;
              issueDetails += `- **Impact**: ${issue.why_it_matters}\n`;
              if (issue.fix) {
                issueDetails += `- **Fix**: ${issue.fix}\n`;
              }
              if (issue.snippet) {
                issueDetails += `${issue.snippet}\n`;
              }
              issueDetails += `\n`;
            });
          }
          
          // Add combined metrics
          issueDetails += `### 📊 **Review Metrics**\n`;
          issueDetails += `- **Critical Issues**: ${totalCriticalCount}\n`;
          issueDetails += `- **Suggestions**: ${totalSuggestionCount}\n`;
          issueDetails += `- **Total Issues**: ${allIssues.length}\n`;
          issueDetails += `- **Chunks Processed**: ${jsonMatches.length}\n\n`;
        }
      }
    } catch (error) {
      core.warning(`⚠️  Error parsing JSON for enhanced comment: ${error.message}`);
    }

    return `## 🤖 DeepReview

**Overall Assessment**: ${status} - ${statusDescription}

${reviewSummary}

**Review Details:**
- **Provider**: ${this.provider.toUpperCase()}
- **Files Reviewed**: ${changedFiles.length} files
- **Review Date**: ${new Date().toLocaleString()}
- **Base Branch**: ${this.baseBranch}
- **Head Branch**: ${(this.context.payload.pull_request && this.context.payload.pull_request.head && this.context.payload.pull_request.head.ref) || 'HEAD'}
- **Path Filter**: ${this.pathToFiles.join(', ')}

---

${issueDetails}

---

**What to do next:**
${shouldBlockMerge 
  ? '1. 🔍 Review the critical issues above\n2. 🛠️ Fix the issues mentioned in the review\n3. 🔄 Push changes and re-run the review\n4. ✅ Merge only after all critical issues are resolved'
  : '1. ✅ Review the suggestions above\n2. 🚀 Safe to merge when ready\n3. 💡 Consider any optimization suggestions as future improvements'
}
`;
  }

  /**
   * Log review details
   */
  logReviewDetails() {
    core.info(`🚀 Starting LLM Code Review (GitHub Actions)...\n`);
    core.info(`🤖 Using ${this.provider.toUpperCase()} LLM`);
    
    core.info(`📋 Review Details:`);
    core.info(`  - Base Branch: ${this.baseBranch}`);
    core.info(`  - Head Ref: ${this.context.sha}`);
    core.info(`  - Review Date: ${new Date().toLocaleString()}`);
    core.info(`  - Reviewer: ${this.provider.toUpperCase()} LLM`);
    core.info(`  - Language: ${this.language} (${CONFIG.LANGUAGE_CONFIGS[this.language]?.name || 'Unknown'})`);
    core.info(`  - Path to Files: ${this.pathToFiles.join(', ')}`);
    core.info(`  - PR Number: ${(this.context.issue && this.context.issue.number) || 'Not available'}`);
    core.info(`  - Chunk Size: ${Math.round(this.chunkSize / 1024)}KB (${this.chunkSize} bytes)`);
    core.info(`  - Max Concurrent Requests: ${this.maxConcurrentRequests}`);
    core.info(`  - Batch Delay: ${this.batchDelayMs}ms`);
    
    // Debug chunk size configuration
    if (this.chunkSize <= 0) {
      core.warning(`⚠️  WARNING: Chunk size is ${this.chunkSize} - this will cause excessive chunking!`);
      core.warning(`   Check your chunk_size input parameter or CONFIG.DEFAULT_CHUNK_SIZE`);
    }
    
    core.info('');
  }

  /**
   * Log changed files
   */
  logChangedFiles(changedFiles) {
    if (changedFiles.length === 0) {
      core.info('✅ No changes detected - nothing to review');
      return false;
    }

    core.info(`📁 Found ${changedFiles.length} changed files in repository:\n`);
    changedFiles.forEach(filePath => {
      core.info(`  📄 ${filePath}`);
    });
    core.info('');
    return true;
  }

  /**
   * Log LLM response
   */
  logLLMResponse(llmResponse) {
    if (llmResponse) {
      core.info('🤖 LLM Review Results:');
      core.info('================================================================================');
      core.info(llmResponse);
      core.info('================================================================================\n');
      return true;
    }
    return false;
  }

  /**
   * Log final decision with enhanced details
   */
  logFinalDecision(shouldBlockMerge, llmResponse) {
    try {
      // Try to extract all JSON objects for detailed logging
      const jsonMatches = llmResponse.match(/```json\s*([\s\S]*?)\s*```/g);
      if (jsonMatches && jsonMatches.length > 0) {
        core.info(`📊 Found ${jsonMatches.length} JSON objects for detailed logging`);
        
        // Parse all JSON objects and combine their data
        const allIssues = [];
        let totalCriticalCount = 0;
        let totalSuggestionCount = 0;
        
        jsonMatches.forEach((match, index) => {
          try {
            const jsonStr = match.replace(/```json\s*/, '').replace(/\s*```/, '');
            const reviewData = JSON.parse(jsonStr);
            
            // Collect issues
            if (reviewData.issues && Array.isArray(reviewData.issues)) {
              reviewData.issues.forEach(issue => {
                // Add chunk context to issue
                const issueWithContext = {
                  ...issue,
                  chunk: index + 1,
                  originalId: issue.id
                };
                allIssues.push(issueWithContext);
              });
            }
            
            // Collect metrics
            if (reviewData.metrics) {
              totalCriticalCount += reviewData.metrics.critical_count || 0;
              totalSuggestionCount += reviewData.metrics.suggestion_count || 0;
            }
            
          } catch (parseError) {
            core.warning(`⚠️  Error parsing JSON object ${index + 1} for logging: ${parseError.message}`);
          }
        });
        
        if (shouldBlockMerge) {
          const criticalIssues = allIssues.filter(i => i.severity_proposed === 'critical');
          const highConfidenceCritical = criticalIssues.filter(i => i.confidence >= 0.6);
          
          core.setFailed(`🚨 MERGE BLOCKED: LLM review found ${criticalIssues.length} critical issues (${highConfidenceCritical.length} with high confidence ≥ 0.6) across ${jsonMatches.length} chunks`);
          
          if (highConfidenceCritical.length > 0) {
            core.info('   High-confidence critical issues:');
            highConfidenceCritical.forEach(issue => {
              core.info(`   - ${issue.originalId}: ${issue.category} (Chunk ${issue.chunk}, score: ${issue.severity_score?.toFixed(1) || 'N/A'}, ${Math.round(issue.confidence * 100)}% confidence)`);
              core.info(`     File: ${issue.file}, Lines: ${issue.lines.join('-')}`);
              if (issue.risk_factors) {
                core.info(`     Risk Factors: I:${issue.risk_factors.impact} E:${issue.risk_factors.exploitability} L:${issue.risk_factors.likelihood} B:${issue.risk_factors.blast_radius} Ev:${issue.risk_factors.evidence_strength}`);
              }
              core.info(`     Impact: ${issue.why_it_matters}`);
            });
          }
          
          core.info('   Please fix the critical issues mentioned above and run the review again.');
        } else {
          const suggestions = allIssues.filter(i => i.severity_proposed === 'suggestion');
          core.info(`✅ MERGE APPROVED: No critical issues found across ${jsonMatches.length} chunks. ${suggestions.length} suggestions available for consideration.`);
          
          if (suggestions.length > 0) {
            core.info('   Suggestions for improvement:');
            suggestions.slice(0, 3).forEach(issue => { // Show first 3 suggestions
              core.info(`   - ${issue.originalId}: ${issue.category} (Chunk ${issue.chunk}, score: ${issue.severity_score?.toFixed(1) || 'N/A'}, ${Math.round(issue.confidence * 100)}% confidence)`);
            });
            if (suggestions.length > 3) {
              core.info(`   ... and ${suggestions.length - 3} more suggestions`);
            }
          }
        }
        
        // Log combined metrics
        core.info(`📊 Review Summary: ${totalCriticalCount} critical, ${totalSuggestionCount} suggestions across ${jsonMatches.length} chunks`);
        
        return;
      }
    } catch (error) {
      core.warning(`⚠️  Error parsing JSON for detailed logging: ${error.message}`);
    }
    
    // Fallback to simple logging
    if (shouldBlockMerge) {
      core.setFailed('🚨 MERGE BLOCKED: LLM review found critical issues that must be addressed before merging.');
      core.info('   Please fix the issues mentioned above and run the review again.');
    } else {
      core.info('✅ MERGE APPROVED: No critical issues found. Safe to merge.');
    }
  }

  /**
   * Run the complete review process
   */
  async runReview() {
    this.logReviewDetails();

    const changedFiles = this.getChangedFiles();
    
    if (!this.logChangedFiles(changedFiles)) {
      return;
    }

    // LLM Review
    core.info(`🤖 Running LLM Review of branch changes...\n`);
    
    // Get language-specific review prompt
    const reviewPrompt = getReviewPrompt(this.language);
    core.info(`📝 Using ${CONFIG.LANGUAGE_CONFIGS[this.language]?.name || this.language} review prompt`);
      
    const fullDiff = this.getFullDiff();
    const llmResponse = await this.callLLM(reviewPrompt, fullDiff);
    
    if (this.logLLMResponse(llmResponse)) {
      // Check if LLM recommends blocking the merge
      const shouldBlockMerge = this.checkMergeDecision(llmResponse);
      
      // Generate and post PR comment
      const prComment = this.generatePRComment(shouldBlockMerge, changedFiles, llmResponse);
      await this.addPRComment(prComment);
      
      this.logFinalDecision(shouldBlockMerge, llmResponse);
    }
  }
}

// Run the review
async function run() {
  try {
    const reviewer = new GitHubActionsReviewer();
    await reviewer.runReview();
  } catch (error) {
    core.setFailed(`❌ Review failed: ${error.message}`);
  }
}

run(); 