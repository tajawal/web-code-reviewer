/**
 * LLM service for handling AI model interactions and chunking
 */

const core = require('@actions/core');
const { LLM_PROVIDERS, CONFIG } = require('../constants');
const ContextService = require('./context-service');

class LLMService {
  constructor(provider, maxTokens, temperature, baseBranch, language = CONFIG.DEFAULT_LANGUAGE) {
    this.provider = provider;
    this.maxTokens = maxTokens;
    this.temperature = temperature;
    this.chunkSize = CONFIG.DEFAULT_CHUNK_SIZE;
    this.maxConcurrentRequests = CONFIG.MAX_CONCURRENT_REQUESTS;
    this.batchDelayMs = CONFIG.BATCH_DELAY_MS;
    this.language = language || CONFIG.DEFAULT_LANGUAGE;
    this.contextService = new ContextService(baseBranch, this.language);
  }

  /**
   * Estimate token count for text with improved precision
   * Uses more conservative estimate to prevent overflow and ensure determinism
   */
  estimateTokenCount(prompt, diff) {
    // Improved estimation: ~3.5 characters per token for code (accounts for syntax complexity)
    // Claude/GPT typically use 3-4 chars per token; use 3.5 for code-heavy content
    const totalText = prompt + diff;
    // Add 10% safety buffer to prevent overflow and ensure consistency
    return Math.ceil((totalText.length / 3.5) * 1.1);
  }

  /**
   * Create optimized prompt for chunk processing with context
   */
  async createChunkPrompt(
    prompt,
    chunkIndex,
    totalChunks,
    changedFiles = [],
    sharedContext = null
  ) {
    // Use shared context if provided, otherwise generate new one
    const context =
      sharedContext || (await this.contextService.getComprehensiveContext(changedFiles));

    if (totalChunks === 1) {
      // For single chunk, include full context
      return `${prompt}\n\n${context}\n\n============================================================\n📋 ACTUAL CODE CHANGES TO REVIEW (REVIEW THESE ONLY):\n============================================================\n\n**The following diffs/files are what you should review:**`;
    }

    // For multiple chunks, include project context
    return this.contextService.getContextAwareChunkPrompt(prompt, chunkIndex, totalChunks, context);
  }

  /**
   * Process chunks with adaptive concurrency based on chunk count
   */
  async processChunksIntelligently(prompt, chunks, changedFiles = []) {
    const results = [];

    // Generate context once and share across all chunks
    let sharedContext = null;
    if (chunks.length > 1) {
      core.info('🔄 Generating shared context for all chunks...');
      // Estimate total tokens for all chunks to calculate dynamic context size
      const totalEstimatedTokens = chunks.reduce(
        (sum, chunk) => sum + this.estimateTokenCount(prompt, chunk),
        0
      );
      sharedContext = await this.contextService.getComprehensiveContext(
        changedFiles,
        totalEstimatedTokens
      );
    }

    if (chunks.length <= 3) {
      // For small numbers, process sequentially with delays
      core.info(`📦 Processing ${chunks.length} chunks sequentially (small batch)`);

      for (let i = 0; i < chunks.length; i++) {
        core.info(`📦 Processing chunk ${i + 1}/${chunks.length}`);

        const result = await this.callLLMChunk(
          prompt,
          chunks[i],
          i,
          chunks.length,
          changedFiles,
          sharedContext
        );
        results.push(result);

        if (i + 1 < chunks.length) {
          core.info(`⏳ Waiting ${this.batchDelayMs}ms before next request...`);
          await new Promise(resolve => setTimeout(resolve, this.batchDelayMs));
        }
      }
    } else {
      // For larger numbers, use controlled concurrency
      const maxConcurrent = Math.min(2, chunks.length); // Max 2 concurrent requests
      core.info(
        `📦 Processing ${chunks.length} chunks with controlled concurrency (max ${maxConcurrent})`
      );

      for (let i = 0; i < chunks.length; i += maxConcurrent) {
        const batch = chunks.slice(i, i + maxConcurrent);
        const batchPromises = batch.map((chunk, batchIndex) =>
          this.callLLMChunk(
            prompt,
            chunk,
            i + batchIndex,
            chunks.length,
            changedFiles,
            sharedContext
          )
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
    core.warning(
      `⚠️  Token limit exceeded for chunk ${chunkIndex + 1}. Creating summary review...`
    );

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
  async callLLMChunk(
    prompt,
    diffChunk,
    chunkIndex,
    totalChunks,
    changedFiles = [],
    sharedContext = null
  ) {
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
        if (estimatedTokens > 180000) {
          // Leave buffer for Claude's 200k limit
          core.warning(
            `⚠️  Chunk ${chunkIndex + 1} estimated at ${estimatedTokens} tokens - may exceed limits`
          );
        }

        // Log token usage for monitoring
        core.info(
          `📊 Token Usage - Input: ~${estimatedTokens}, Output Limit: ${this.maxTokens}, Provider: ${this.provider.toUpperCase()}`
        );

        // Create chunk-specific prompt with better context
        const chunkPrompt = await this.createChunkPrompt(
          prompt,
          chunkIndex,
          totalChunks,
          changedFiles,
          sharedContext
        );

        core.info(
          `🤖 Calling ${this.provider.toUpperCase()} LLM for chunk ${chunkIndex + 1}/${totalChunks} (attempt ${attempt}/${maxRetries})...`
        );

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
            const retryAfter =
              parseInt(response.headers.get('retry-after')) || Math.pow(2, attempt);
            core.warning(
              `⚠️  Rate limit hit for chunk ${chunkIndex + 1}. Waiting ${retryAfter}s (attempt ${attempt}/${maxRetries})...`
            );
            await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
            continue; // Retry with next attempt
          } else if (response.status === 400 && errorData.includes('token')) {
            // Token limit exceeded
            core.error(`❌ Token limit exceeded for chunk ${chunkIndex + 1}: ${errorData}`);
            return this.handleTokenLimitExceeded(chunkIndex, totalChunks);
          } else if (response.status >= 500) {
            // Server error - retry with exponential backoff
            const delay = baseDelay * Math.pow(2, attempt - 1);
            core.warning(
              `⚠️  Server error (${response.status}) for chunk ${chunkIndex + 1}. Retrying in ${delay}ms...`
            );
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          } else {
            throw new Error(
              `${this.provider.toUpperCase()} API error: ${response.status} ${response.statusText} - ${errorData}`
            );
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

        // Monitor response length to detect potential truncation
        const responseLength = result.length;
        const estimatedResponseTokens = Math.round(responseLength / 4); // Rough estimation
        const tokenUsagePercent = Math.round((estimatedResponseTokens / this.maxTokens) * 100);

        core.info(
          `✅ Received valid response for chunk ${chunkIndex + 1}/${totalChunks} (${responseLength} chars)`
        );
        core.info(
          `📊 Response Stats - Est. Tokens: ~${estimatedResponseTokens}, Usage: ${tokenUsagePercent}% of limit`
        );

        // Warn if response might be truncated
        if (tokenUsagePercent > 90) {
          core.warning(
            `⚠️  Response may be truncated - using ${tokenUsagePercent}% of token limit`
          );
        }

        return result;
      } catch (error) {
        if (error.message.includes('Cannot find module') || error.message.includes('node-fetch')) {
          core.error('❌ node-fetch not found. Please install it with: npm install node-fetch');
          return null;
        }

        if (attempt === maxRetries) {
          core.error(
            `❌ LLM review failed for chunk ${chunkIndex + 1} after ${maxRetries} attempts: ${error.message}`
          );
          return null;
        } else {
          const delay = baseDelay * Math.pow(2, attempt - 1);
          core.warning(
            `⚠️  Attempt ${attempt}/${maxRetries} failed for chunk ${chunkIndex + 1}. Retrying in ${delay}ms...`
          );
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    return null;
  }

  /**
   * Call LLM API with improved chunking and intelligent processing
   */
  async callLLM(prompt, diff, changedFiles = []) {
    try {
      const apiKey = this.getApiKey();
      if (!apiKey) {
        core.warning(`⚠️  No ${this.provider.toUpperCase()} API key found. Skipping LLM review.`);
        return null;
      }

      const diffSize = Buffer.byteLength(diff, 'utf8');
      const estimatedTokens = this.estimateTokenCount(prompt, diff);

      core.info(`📊 Diff analysis: ${Math.round(diffSize / 1024)}KB, ~${estimatedTokens} tokens`);
      core.info(`📁 Changed files passed to LLM: ${changedFiles.length} files`);
      if (changedFiles.length > 0) {
        core.info(`📁 Changed files: ${changedFiles.join(', ')}`);
      }

      // If diff is small enough, process it normally
      if (diffSize <= this.chunkSize && estimatedTokens < 150000) {
        core.info(
          `🤖 Processing single diff chunk (${Math.round(diffSize / 1024)}KB, ~${estimatedTokens} tokens)...`
        );
        return await this.callLLMChunk(prompt, diff, 0, 1, changedFiles, null);
      }

      // Split diff into chunks with intelligent sizing
      const chunks = this.splitDiffIntoChunks(diff);

      if (chunks.length === 0) {
        core.warning('⚠️  No chunks created from diff');
        return null;
      }

      core.info(`🚀 Processing ${chunks.length} chunks with intelligent batching...`);

      // Process chunks with adaptive concurrency
      const results = await this.processChunksIntelligently(prompt, chunks, changedFiles);

      // Filter out failed responses and combine results
      const validResults = results.filter(result => result !== null);

      if (validResults.length === 0) {
        core.error('❌ All LLM API calls failed');
        return null;
      }

      if (validResults.length < chunks.length) {
        core.warning(
          `⚠️  Only ${validResults.length}/${chunks.length} chunks processed successfully`
        );
      }

      // Combine all responses with improved logic
      const combinedResponse = this.combineLLMResponses(validResults);

      core.info(`✅ Successfully processed ${validResults.length}/${chunks.length} chunks`);
      return combinedResponse;
    } catch (error) {
      core.error(`❌ LLM review failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Split diff into chunks based on size
   */
  splitDiffIntoChunks(diff) {
    if (!diff || diff.length === 0) {
      return [];
    }

    // Ensure chunk size is reasonable
    if (this.chunkSize <= 0) {
      core.warning(
        `⚠️  Invalid chunk size: ${this.chunkSize}, using default: ${CONFIG.DEFAULT_CHUNK_SIZE}`
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
      if (currentSize + sectionSize > this.chunkSize && currentChunk.length > 0) {
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
      `📦 Split diff into ${chunks.length} chunks (max ${Math.round(this.chunkSize / 1024)}KB each)`
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
   * Combine multiple LLM responses into a single coherent review with improved analysis
   */
  combineLLMResponses(responses) {
    if (responses.length === 0) {
      return 'No review results available.';
    }

    if (responses.length === 1) {
      return responses[0];
    }

    // Extract and categorize information from each response
    let combinedResponse = '';

    responses.forEach(response => {
      combinedResponse += response;
    });

    return combinedResponse;
  }
}

module.exports = LLMService;
