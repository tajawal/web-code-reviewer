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
  DEFAULT_PATH_TO_FILES: 'src/',
  IGNORE_PATTERNS: ['.json', '.md', '.lock', '.test.js', '.spec.js'],
  MAX_TOKENS: 2000,
  TEMPERATURE: 0.3,
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
    model: 'claude-opus-4-20250514',
    headers: (apiKey) => ({
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    }),
    body: (prompt, diff) => ({
      model: 'claude-opus-4-20250514',
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
const REVIEW_PROMPT = `You are a senior frontend engineer with 10+ years of experience in code reviews for enterprise-level applications.
Your task is to analyze the following code changes and provide a detailed, multi-dimensional review across the following four categories:

Review Dimensions:
1. Performance:
   - Will this change degrade or improve runtime or render performance?
   - Are there any unnecessary re-renders, memory-heavy operations, or inefficient loops?
   - Is lazy loading, caching, memoization, or virtualization being missed where needed?

2. Security:
   - Are there any injection vulnerabilities (XSS, CSRF)?
   - Is untrusted user input handled securely?
   - Are sensitive data and access controls managed properly?

3. Maintainability:
   - Is the code clean, modular, and well-structured?
   - Are abstraction levels, and logic separation appropriate?
   - Will another engineer be able to understand and modify it without confusion?

4. Best Practices:
   - Are modern frontend standards and patterns (e.g., React hooks, component splitting, TypeScript safety, accessibility) followed?
   - Are there code smells, anti-patterns, or obsolete techniques used?

Feedback Guidelines:
- Highlight only critical issues (e.g., security flaws, memory leaks, unsafe patterns, architectural violations) as blockers.
- All other observations should be flagged as non-blocking suggestions.
- Provide code examples where possible.
- Be constructive and educational. Avoid vague comments.

Final Output Format:
- Summary of key issues grouped by category
- Each issue should be marked: 🔴 Critical (Blocker) or 🟡 Suggestion (Non-blocking)
- Final Recommendation: ✅ Safe to merge or ❌ Do NOT merge

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
   * Get full diff for all changed files
   */
  getFullDiff() {
    try {
      const changedFiles = this.getChangedFiles();

      if (changedFiles.length === 0) {
        return '';
      }

      // Join the file paths into a space-separated string
      const fileArgs = changedFiles.map(f => `"${f}"`).join(' ');
      core.info(`Generating diff for files: ${fileArgs}`);
      
      const diffCommand = `git diff origin/${this.baseBranch}...HEAD --unified=3 --no-prefix --ignore-blank-lines --ignore-space-at-eol --no-color ${fileArgs}`;      
      const diff = execSync(diffCommand, { encoding: 'utf8' });
      core.info(`Generated diff of length: ${diff.length}`);
      return diff;
    } catch (error) {
      core.error(`❌ Error getting diff: ${error.message}`);
      return '';
    }
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
   * Call LLM API with the specified provider
   */
  async callLLM(prompt, diff) {
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

      core.info(`🤖 Calling ${this.provider.toUpperCase()} LLM...`);
      
      const response = await fetch(providerConfig.url, {
        method: 'POST',
        headers: providerConfig.headers(apiKey),
        body: JSON.stringify(providerConfig.body(prompt, diff))
      });

      if (!response.ok) {
        throw new Error(`${this.provider.toUpperCase()} API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return providerConfig.extractResponse(data);
    } catch (error) {
      if (error.message.includes('Cannot find module') || error.message.includes('node-fetch')) {
        core.error('❌ node-fetch not found. Please install it with: npm install node-fetch');
        return null;
      }
      core.error(`❌ LLM review failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Check if LLM response indicates merge should be blocked
   */
  checkMergeDecision(llmResponse) {
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
   * Generate PR comment content
   */
  generatePRComment(shouldBlockMerge, changedFiles, llmResponse) {
    const status = shouldBlockMerge ? '❌ **DO NOT MERGE**' : '✅ **SAFE TO MERGE**';
    const statusDescription = shouldBlockMerge 
      ? 'Issues found that must be addressed before merging' 
      : 'All changes are safe and well-implemented';

    return `## 🤖 LLM Code Review

**Overall Assessment**: ${status} - ${statusDescription}

**Review Details:**
- **Provider**: ${this.provider.toUpperCase()}
- **Files Reviewed**: ${changedFiles.length} files
- **Review Date**: ${new Date().toLocaleString()}
- **Base Branch**: ${this.baseBranch}
- **Head Branch**: ${(this.context.payload.pull_request && this.context.payload.pull_request.head && this.context.payload.pull_request.head.ref) || 'HEAD'}
- **Path Filter**: ${this.pathToFiles.join(', ')}

**Files Reviewed:**
${changedFiles.map(file => `- \`${file}\``).join('\n')}

---

## 📋 **Complete LLM Review**

${llmResponse}

---

**What to do next:**
${shouldBlockMerge 
  ? '1. 🔍 Review the detailed analysis above\n2. 🛠️ Fix the issues mentioned in the review\n3. 🔄 Push changes and re-run the review\n4. ✅ Merge only after all issues are resolved'
  : '1. ✅ Review the detailed analysis above\n2. 🚀 Safe to merge when ready\n3. 💡 Consider any optimization suggestions as future improvements'
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
    core.info(`  - PR Number: ${(this.context.issue && this.context.issue.number) || 'Not available'}\n`);
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
   * Log final decision
   */
  logFinalDecision(shouldBlockMerge) {
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
      
    const fullDiff = this.getFullDiff();
    const llmResponse = await this.callLLM(REVIEW_PROMPT, fullDiff);
    
    if (this.logLLMResponse(llmResponse)) {
      // Check if LLM recommends blocking the merge
      const shouldBlockMerge = this.checkMergeDecision(llmResponse);
      
      // Generate and post PR comment
      const prComment = this.generatePRComment(shouldBlockMerge, changedFiles, llmResponse);
      await this.addPRComment(prComment);
      
      this.logFinalDecision(shouldBlockMerge);
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