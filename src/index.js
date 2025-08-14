#!/usr/bin/env node

const core = require('@actions/core');
const github = require('@actions/github');
const { execSync } = require('child_process');

/**
 * Configuration constants
 */
const CONFIG = {
  DEFAULT_BASE_BRANCH: 'develop',
  DEFAULT_PROVIDER: 'claude',
  DEFAULT_PATH_TO_FILES: 'packages/',
  IGNORE_PATTERNS: ['.json', '.md', '.lock', '.test.js', '.spec.js'],
  MAX_TOKENS: 3000, // Increased for comprehensive code reviews
  TEMPERATURE: 0, // Optimal for consistent analytical responses
  // Chunking configuration
  DEFAULT_CHUNK_SIZE: 300 * 1024, // 300KB default chunk size (optimized for Claude Sonnet 4)
  MAX_CONCURRENT_REQUESTS: 1, // Reduced to 1 to avoid rate limits
  BATCH_DELAY_MS: 2000, // Increased delay between requests
  APPROVAL_PHRASES: [
    'safe to merge', '✅ safe to merge', 'merge approved', 
    'no critical issues', 'safe to commit', 'approved for merge',
    'proceed with merge', 'merge is safe'
  ],
  BLOCKING_PHRASES: [
    'do not merge', '❌ do not merge', 'block merge', 
    'merge blocked', 'not safe to merge', 'critical issues found',
    'must be fixed', 'blockers found'
  ],
  CRITICAL_ISSUES: [
    'security vulnerability', 'security issue', 'critical bug', 
    'memory leak', 'race condition', 'xss vulnerability',
    'authentication issue', 'authorization problem'
  ]
};

/**
 * LLM Provider configurations
 */
const LLM_PROVIDERS = {
  openai: {
    url: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o-mini',
    headers: (apiKey) => ({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    }),
    body: (prompt, diff) => ({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'system',
        content: 'You are a senior frontend engineer performing a code review. Provide detailed, actionable feedback focusing on bugs, security issues, performance problems. Be specific and provide code examples when possible. Give merge decisions.'
      }, {
        role: 'user',
        content: `${prompt}\n\n${diff}`
      }],
      max_tokens: CONFIG.MAX_TOKENS,
      temperature: CONFIG.TEMPERATURE
    }),
    extractResponse: (data) => data.choices[0].message.content
  },
  claude: {
    url: 'https://api.anthropic.com/v1/messages',
    model: 'claude-sonnet-4-20250514',
    headers: (apiKey) => ({
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    }),
    body: (prompt, diff) => ({
      model: 'claude-sonnet-4-20250514',
      max_tokens: CONFIG.MAX_TOKENS,
      temperature: CONFIG.TEMPERATURE,
      messages: [{
        role: 'user',
        content: `${prompt}\n\n${diff}`
      }]
    }),
    extractResponse: (data) => data.content[0].text
  }
};

/**
 * Review prompt template
 */
const REVIEW_PROMPT = `Role & Goal
You are a senior frontend engineer (10+ years) reviewing only the provided diff/files for enterprise web apps. Produce a single summary comment (no inline clutter) that highlights critical, hard-to-spot issues across Performance, Security, Maintainability, and Best Practices.

Scope & Exclusions (very important)
- Focus on critical risks: exploitable security flaws, meaningful performance regressions, memory leaks, unsafe patterns, architectural violations.
- Ignore style/formatting/naming/import order/semicolons/lint/prettier concerns, and any non-material preferences.
- Do not assume code that is not shown. If essential context is missing, do NOT invent details: lower confidence and/or treat the point as a Suggestion.

Severity Scoring (mandatory)
For EACH issue, assign 0–5 scores:
- impact
- exploitability
- likelihood
- blast_radius
- evidence_strength

Compute:
severity_score = 0.35*impact + 0.30*exploitability + 0.20*likelihood + 0.10*blast_radius + 0.05*evidence_strength

Set "severity_proposed" using ONLY:
- "critical" if severity_score ≥ 3.6 AND evidence_strength ≥ 3
- otherwise "suggestion"

Auto-critical overrides (regardless of score):
- Unsanitized HTML sinks (e.g., innerHTML/dangerouslySetInnerHTML) with untrusted input
- Secret/credential/API key embedded in client code
- Unbounded listener/timer or render-time loop causing growth/leak
- Direct DOM injection/navigation from untrusted input without validation/escaping

Evidence Requirements (for EACH issue)
- Provide: file (relative path), lines ([start,end]), a minimal snippet (≤10 lines), why_it_matters (1 sentence), fix (concise, code if helpful), tests (brief test), confidence ∈ [0,1].
- Deduplicate repeated patterns: one issue with an "occurrences" array of {file, lines}.

Final Policy
- final_recommendation = "do_not_merge" if any issue ends up "critical" with confidence ≥ 0.6; else "safe_to_merge".

Output Format (JSON first, then a short human summary)
Return THIS JSON object followed by a brief human-readable summary:

\`\`\`json
{
  "summary": "1–3 sentences overall assessment.",
  "issues": [
    {
      "id": "SEC-01",
      "category": "security|performance|maintainability|best_practices",
      "severity_proposed": "critical|suggestion",
      "severity_score": 0.0,
      "risk_factors": {
        "impact": 0,
        "exploitability": 0,
        "likelihood": 0,
        "blast_radius": 0,
        "evidence_strength": 0
      },
      "confidence": 0.0,
      "file": "src/components/Table.tsx",
      "lines": [120, 134],
      "snippet": "<10-line minimal excerpt>",
      "why_it_matters": "Concrete impact in 1 sentence.",
      "fix": "Specific steps or code patch.",
      "tests": "Brief test to prevent regression.",
      "occurrences": [
        {"file": "src/pages/List.tsx", "lines": [88, 95]}
      ]
    }
  ],
  "metrics": { "critical_count": 0, "suggestion_count": 0 },
  "final_recommendation": "safe_to_merge|do_not_merge"
}
\`\`\`

Then add a short human summary:
- Summary of key issues by category (bullets, ≤6 lines)
- Final Recommendation: ✅ Safe to merge / ❌ Do NOT merge

Frontend-specific checks (only if visible in diff)
- React: unstable hook deps; heavy work in render; missing cleanup in useEffect; dangerouslySetInnerHTML; index-as-key on dynamic lists; consider Suspense/lazy for large modules.
- TypeScript: any/unknown leakage; unsafe narrowing; non-null assertions (!).
- Fetch/IO: missing abort/timeout; lack of retry/backoff for critical calls; leaking subscriptions/websockets.
- Accessibility: critical only if it blocks core flows.

Context: Here are the code changes (diff or full files):`;

/**
 * GitHub Actions Code Reviewer
 */
class GitHubActionsReviewer {
  constructor() {
    // Get inputs from action
    this.provider = core.getInput('llm_provider') || CONFIG.DEFAULT_PROVIDER;
    this.pathToFiles = this.parsePathToFiles(core.getInput('path_to_files') || CONFIG.DEFAULT_PATH_TO_FILES);
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
   * Get changed files from git diff
   */
  getChangedFiles() {
    try {
      core.info('🔍 Detecting changed files...');
      core.info(`Comparing ${this.context.sha} against origin/${this.baseBranch}`);
      
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
          
          return matchesPath && !shouldIgnore;
        });
      
      core.info(`Found ${allFiles.length} total changed files`);
      
      return allFiles;
    } catch (error) {
      core.error(`❌ Error getting changed files: ${error.message}`);
      return [];
    }
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
    const summaries = [];
    const criticalIssues = [];
    const suggestions = [];
    const performanceIssues = [];
    const securityIssues = [];
    const maintainabilityIssues = [];
    const bestPracticeIssues = [];
    let mergeDecision = null;
    let confidenceScore = 0;
    
    responses.forEach((response, index) => {
      const lowerResponse = response.toLowerCase();
      
      // Extract summary with chunk context
      summaries.push(`**Chunk ${index + 1}/${totalChunks}:**\n${response}\n`);
      
      // Categorize issues by type
      this.categorizeIssues(lowerResponse, index + 1, {
        criticalIssues,
        performanceIssues,
        securityIssues,
        maintainabilityIssues,
        bestPracticeIssues
      });
      
      // Look for merge decisions with confidence scoring
      const decision = this.extractMergeDecision(lowerResponse);
      if (decision) {
        if (!mergeDecision) {
          mergeDecision = decision;
          confidenceScore = this.calculateConfidenceScore(lowerResponse);
        } else if (decision !== mergeDecision) {
          // Conflicting decisions - lower confidence
          confidenceScore = Math.min(confidenceScore, 0.5);
        }
      }
    });
    
    // Create intelligent combined response
    let combinedResponse = this.createCombinedResponseHeader(responses.length, totalChunks);
    
    // Add decision with confidence
    combinedResponse += this.createDecisionSection(mergeDecision, confidenceScore);
    
    // Add categorized issues
    // combinedResponse += this.createIssuesSummary({
    //   criticalIssues,
    //   performanceIssues,
    //   securityIssues,
    //   maintainabilityIssues,
    //   bestPracticeIssues
    // });
    
    // Add detailed reviews
    combinedResponse += `### 📋 **Detailed Reviews by Chunk:**\n\n`;
    combinedResponse += summaries.join('\n---\n\n');
    
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
            issue.severity === 'critical' && issue.confidence >= 0.6
          );
          
          const highConfidenceCritical = criticalIssues.length;
          
          if (highConfidenceCritical > 0) {
            core.info(`🚨 Found ${highConfidenceCritical} critical issues with confidence ≥ 0.6 across all chunks`);
            core.info(`   Issues: ${criticalIssues.map(i => `${i.originalId} (${i.category}, Chunk ${i.chunk})`).join(', ')}`);
            return true; // Block merge
          }
          
          // Log all issues for transparency
          const allIssuesSummary = allIssues.map(issue => 
            `${issue.severity.toUpperCase()} ${issue.originalId}: ${issue.category} (Chunk ${issue.chunk}, confidence: ${issue.confidence})`
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
          const criticalIssues = allIssues.filter(i => i.severity === 'critical');
          const suggestions = allIssues.filter(i => i.severity === 'suggestion');
          
          issueDetails = `## 🔍 **Issues Found**\n\n`;
          
          if (criticalIssues.length > 0) {
            issueDetails += `### 🚨 **Critical Issues (${criticalIssues.length})**\n`;
            criticalIssues.forEach(issue => {
              issueDetails += `**${issue.originalId}** - ${issue.category.toUpperCase()} (Chunk ${issue.chunk})\n`;
              issueDetails += `- **File**: \`${issue.file}\` (lines ${issue.lines.join('-')})\n`;
              issueDetails += `- **Confidence**: ${Math.round(issue.confidence * 100)}%\n`;
              issueDetails += `- **Impact**: ${issue.why_it_matters}\n`;
              if (issue.fix) {
                issueDetails += `- **Fix**: ${issue.fix}\n`;
              }
              if (issue.tests) {
                issueDetails += `- **Test**: ${issue.tests}\n`;
              }
              issueDetails += `\n`;
            });
          }
          
          if (suggestions.length > 0) {
            issueDetails += `### 💡 **Suggestions (${suggestions.length})**\n`;
            suggestions.forEach(issue => {
              issueDetails += `**${issue.originalId}** - ${issue.category.toUpperCase()} (Chunk ${issue.chunk})\n`;
              issueDetails += `- **File**: \`${issue.file}\` (lines ${issue.lines.join('-')})\n`;
              issueDetails += `- **Confidence**: ${Math.round(issue.confidence * 100)}%\n`;
              issueDetails += `- **Impact**: ${issue.why_it_matters}\n`;
              if (issue.fix) {
                issueDetails += `- **Fix**: ${issue.fix}\n`;
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

    return `## 🤖 LLM Code Review

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

## 📋 **Complete LLM Review**

${llmResponse}

---

**What to do next:**
${shouldBlockMerge 
  ? '1. 🔍 Review the critical issues above\n2. 🛠️ Fix the issues mentioned in the review\n3. 🔄 Push changes and re-run the review\n4. ✅ Merge only after all critical issues are resolved'
  : '1. ✅ Review the suggestions above\n2. 🚀 Safe to merge when ready\n3. 💡 Consider any optimization suggestions as future improvements'
}

---
*This review was automatically generated by @tajawal/web-code-review*`;
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
          const criticalIssues = allIssues.filter(i => i.severity === 'critical');
          const highConfidenceCritical = criticalIssues.filter(i => i.confidence >= 0.6);
          
          core.setFailed(`🚨 MERGE BLOCKED: LLM review found ${criticalIssues.length} critical issues (${highConfidenceCritical.length} with high confidence ≥ 0.6) across ${jsonMatches.length} chunks`);
          
          if (highConfidenceCritical.length > 0) {
            core.info('   High-confidence critical issues:');
            highConfidenceCritical.forEach(issue => {
              core.info(`   - ${issue.originalId}: ${issue.category} (Chunk ${issue.chunk}, ${Math.round(issue.confidence * 100)}% confidence)`);
              core.info(`     File: ${issue.file}, Lines: ${issue.lines.join('-')}`);
              core.info(`     Impact: ${issue.why_it_matters}`);
            });
          }
          
          core.info('   Please fix the critical issues mentioned above and run the review again.');
        } else {
          const suggestions = allIssues.filter(i => i.severity === 'suggestion');
          core.info(`✅ MERGE APPROVED: No critical issues found across ${jsonMatches.length} chunks. ${suggestions.length} suggestions available for consideration.`);
          
          if (suggestions.length > 0) {
            core.info('   Suggestions for improvement:');
            suggestions.slice(0, 3).forEach(issue => { // Show first 3 suggestions
              core.info(`   - ${issue.originalId}: ${issue.category} (Chunk ${issue.chunk}, ${Math.round(issue.confidence * 100)}% confidence)`);
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
   * Categorize issues by type from response text
   */
  categorizeIssues(responseText, chunkIndex, categories) {
    // Critical issues
    for (const issue of CONFIG.CRITICAL_ISSUES) {
      if (responseText.includes(issue)) {
        categories.criticalIssues.push(`- ${issue} (chunk ${chunkIndex})`);
      }
    }
    
    // Performance issues
    const performanceKeywords = ['performance', 'slow', 'inefficient', 'memory leak', 're-render', 'optimization'];
    for (const keyword of performanceKeywords) {
      if (responseText.includes(keyword)) {
        categories.performanceIssues.push(`- Performance concern: ${keyword} (chunk ${chunkIndex})`);
      }
    }
    
    // Security issues
    const securityKeywords = ['security', 'vulnerability', 'xss', 'csrf', 'injection', 'authentication', 'authorization'];
    for (const keyword of securityKeywords) {
      if (responseText.includes(keyword)) {
        categories.securityIssues.push(`- Security concern: ${keyword} (chunk ${chunkIndex})`);
      }
    }
    
    // Maintainability issues
    const maintainabilityKeywords = ['maintainability', 'complexity', 'readability', 'refactor', 'clean code'];
    for (const keyword of maintainabilityKeywords) {
      if (responseText.includes(keyword)) {
        categories.maintainabilityIssues.push(`- Maintainability concern: ${keyword} (chunk ${chunkIndex})`);
      }
    }
    
    // Best practices issues
    const bestPracticeKeywords = ['best practice', 'anti-pattern', 'code smell', 'standard', 'convention'];
    for (const keyword of bestPracticeKeywords) {
      if (responseText.includes(keyword)) {
        categories.bestPracticeIssues.push(`- Best practice concern: ${keyword} (chunk ${chunkIndex})`);
      }
    }
  }

  /**
   * Extract merge decision from response text
   */
  extractMergeDecision(responseText) {
    // Check for blocking phrases first
    for (const phrase of CONFIG.BLOCKING_PHRASES) {
      if (responseText.includes(phrase)) {
        return 'BLOCK';
      }
    }
    
    // Check for approval phrases
    for (const phrase of CONFIG.APPROVAL_PHRASES) {
      if (responseText.includes(phrase)) {
        return 'APPROVE';
      }
    }
    
    return null;
  }

  /**
   * Calculate confidence score for merge decision
   */
  calculateConfidenceScore(responseText) {
    let score = 0.5; // Base score
    
    // Higher confidence for explicit decisions
    if (responseText.includes('safe to merge') || responseText.includes('do not merge')) {
      score += 0.3;
    }
    
    // Higher confidence for detailed reasoning
    if (responseText.includes('because') || responseText.includes('reason')) {
      score += 0.2;
    }
    
    // Lower confidence for uncertain language
    if (responseText.includes('maybe') || responseText.includes('possibly') || responseText.includes('consider')) {
      score -= 0.2;
    }
    
    return Math.max(0.1, Math.min(1.0, score));
  }

  /**
   * Create combined response header
   */
  createCombinedResponseHeader(processedChunks, totalChunks) {
    let header = `\n\n*This review was generated from ${processedChunks}/${totalChunks} chunks of the diff*\n\n`;
    
    
    if (processedChunks < totalChunks) {
      header += `⚠️ **Note**: ${totalChunks - processedChunks} chunks failed to process and were excluded from this review.\n\n`;
    }
    
    return header;
  }

  /**
   * Create decision section with confidence
   */
  createDecisionSection(decision, confidence) {
    let section = '';
    
    if (decision === 'BLOCK') {
      section += `### ❌ **OVERALL DECISION: DO NOT MERGE**\n\n`;
      if (confidence < 0.7) {
        section += `*Confidence: ${Math.round(confidence * 100)}% - Manual review strongly recommended*\n\n`;
      }
    } else if (decision === 'APPROVE') {
      section += `### ✅ **OVERALL DECISION: SAFE TO MERGE**\n\n`;
      if (confidence < 0.8) {
        section += `*Confidence: ${Math.round(confidence * 100)}% - Consider additional review*\n\n`;
      }
    } else {
      section += `### ⚠️ **OVERALL DECISION: MANUAL REVIEW RECOMMENDED**\n\n`;
      section += `*No clear decision from automated review - human review required*\n\n`;
    }
    
    return section;
  }

  /**
   * Create issues summary section
   */
  createIssuesSummary(issues) {
    let summary = '';
    
    // Critical issues (always shown first)
    if (issues.criticalIssues.length > 0) {
      summary += `### 🚨 **Critical Issues Found:**\n`;
      summary += [...new Set(issues.criticalIssues)].join('\n');
      summary += `\n\n`;
    }
    
    // Security issues
    if (issues.securityIssues.length > 0) {
      summary += `### 🔒 **Security Concerns:**\n`;
      summary += [...new Set(issues.securityIssues)].join('\n');
      summary += `\n\n`;
    }
    
    // Performance issues
    if (issues.performanceIssues.length > 0) {
      summary += `### ⚡ **Performance Concerns:**\n`;
      summary += [...new Set(issues.performanceIssues)].join('\n');
      summary += `\n\n`;
    }
    
    // Maintainability issues
    if (issues.maintainabilityIssues.length > 0) {
      summary += `### 🛠️ **Maintainability Concerns:**\n`;
      summary += [...new Set(issues.maintainabilityIssues)].join('\n');
      summary += `\n\n`;
    }
    
    // Best practices issues
    if (issues.bestPracticeIssues.length > 0) {
      summary += `### 📚 **Best Practice Concerns:**\n`;
      summary += [...new Set(issues.bestPracticeIssues)].join('\n');
      summary += `\n\n`;
    }
    
    return summary;
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
      
    const fullDiff = this.getFullDiff();
    const llmResponse = await this.callLLM(REVIEW_PROMPT, fullDiff);
    
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