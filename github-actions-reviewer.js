#!/usr/bin/env node

const { execSync } = require('child_process');

/**
 * Configuration constants
 */
const CONFIG = {
  DEFAULT_BASE_BRANCH: 'main',
  DEFAULT_PROVIDER: 'claude',
  DEFAULT_PATH_TO_FILES: 'packages/',
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
   - Are naming conventions, abstraction levels, and logic separation appropriate?
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
    this.baseBranch = process.env.GITHUB_BASE_REF || CONFIG.DEFAULT_BASE_BRANCH;
    this.headRef = process.env.GITHUB_HEAD_REF || 'HEAD';
    this.provider = process.env.LLM_PROVIDER || CONFIG.DEFAULT_PROVIDER;
    this.pathToFiles = process.env.PATH_TO_FILES || CONFIG.DEFAULT_PATH_TO_FILES;
    
    // GitHub context for PR comments
    this.githubToken = process.env.GITHUB_TOKEN || process.env.GITHUB_SECRET_TOKEN;
    this.owner = process.env.GITHUB_REPOSITORY_OWNER;
    this.repo = process.env.GITHUB_REPOSITORY?.split('/')[1];
    this.prNumber = this.extractPRNumber();
  }

  /**
   * Extract PR number from various sources
   */
  extractPRNumber() {
    // From GITHUB_EVENT_PATH
    if (process.env.GITHUB_EVENT_PATH) {
      try {
        const eventData = JSON.parse(require('fs').readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
        return eventData.pull_request?.number;
      } catch (error) {
        console.log(`⚠️  Error reading GITHUB_EVENT_PATH: ${error.message}`);
      }
    }
    
    // From environment variable
    if (process.env.PR_NUMBER) {
      return parseInt(process.env.PR_NUMBER);
    }
    
    return null;
  }

  /**
   * Get changed files from git diff
   */
  getChangedFiles() {
    try {
      console.log('🔍 Detecting changed files...');
      console.log(`Comparing ${this.headRef} against origin/${this.baseBranch}`);
      
      const rawOutput = execSync(`git diff --name-only origin/${this.baseBranch}...HEAD`, { encoding: 'utf8' });
      const allFiles = rawOutput
      .split('\n')
      .filter(Boolean) // Remove empty lines
      .filter(file =>
                file.startsWith(this.pathToFiles) &&                     // Specific directory
                !file.endsWith('.json') &&
                !file.endsWith('.md') &&
                !file.endsWith('.test.js') &&
                !file.endsWith('.spec.js')
              );
      
      console.log(`Found ${allFiles.length} total changed files`);
      
      return allFiles;
    } catch (error) {
      console.error('❌ Error getting changed files:', error.message);
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
      console.log(`Generating diff for files: ${fileArgs}`);
      
      const diffCommand = `git diff origin/${this.baseBranch}...HEAD --unified=3 --no-prefix --ignore-blank-lines --ignore-space-at-eol --no-color ${fileArgs}`;      
      const diff = execSync(diffCommand, { encoding: 'utf8' });
      console.log(`Generated diff of length: ${diff.length}`);
      return diff;
    } catch (error) {
      console.error('❌ Error getting diff:', error.message);
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
        console.log(`⚠️  No ${this.provider.toUpperCase()} API key found. Skipping LLM review.`);
        return null;
      }

      console.log(`🤖 Calling ${this.provider.toUpperCase()} LLM...`);
      
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
        console.error('❌ node-fetch not found. Please install it with: npm install node-fetch');
        return null;
      }
      console.error('❌ LLM review failed:', error.message);
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
        console.log(`✅ Found approval phrase: "${phrase}"`);
        return false; // Safe to merge
      }
    }

    // Check for explicit blocking phrases
    for (const phrase of CONFIG.BLOCKING_PHRASES) {
      if (response.includes(phrase)) {
        console.log(`🚨 Found blocking phrase: "${phrase}"`);
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
      console.log(`🚨 Found ${criticalIssueCount} critical issues without explicit approval`);
      return true;
    }
    
    console.log('⚠️  No explicit merge decision found, defaulting to allow merge');
    return false;
  }

  /**
   * Add PR comment to GitHub
   */
  async addPRComment(comment) {
    if (!this.githubToken || !this.owner || !this.repo || !this.prNumber) {
      console.log('⚠️  Missing GitHub context, skipping PR comment');
      console.log('   Required variables:');
      console.log(`     - GITHUB_TOKEN: ${this.githubToken ? 'Set' : 'Not set'}`);
      console.log(`     - GITHUB_REPOSITORY_OWNER: ${this.owner || 'Not set'}`);
      console.log(`     - GITHUB_REPOSITORY: ${this.repo || 'Not set'}`);
      console.log(`     - PR_NUMBER: ${this.prNumber || 'Not set'}`);
      console.log('   Check workflow permissions and repository settings.');
      return;
    }

    try {
      const { default: fetch } = await import('node-fetch');
      
      const response = await fetch(
        `https://api.github.com/repos/${this.owner}/${this.repo}/issues/${this.prNumber}/comments`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.githubToken}`,
            'Accept': 'application/vnd.github.v3+json'
          },
          body: JSON.stringify({ body: comment })
        }
      );
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error(`❌ Failed to add PR comment: ${response.status} ${response.statusText}`, errorData);
        return;
      }
      
      console.log('✅ Added PR comment successfully');
    } catch (error) {
      console.error('❌ Error adding PR comment:', error.message);
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
- **Head Branch**: ${this.headRef}
- **Path Filter**: ${this.pathToFiles}

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
*This review was automatically generated by @tajawal/llm-code-review*`;
  }

  /**
   * Log review details
   */
  logReviewDetails() {
    console.log(`🚀 Starting LLM Code Review (GitHub Actions)...\n`);
    console.log(`🤖 Using ${this.provider.toUpperCase()} LLM`);
    
    console.log(`📋 Review Details:`);
    console.log(`  - Base Branch: ${this.baseBranch}`);
    console.log(`  - Head Ref: ${this.headRef}`);
    console.log(`  - Review Date: ${new Date().toLocaleString()}`);
    console.log(`  - Reviewer: ${this.provider.toUpperCase()} LLM`);
    console.log(`  - Path to Files: ${this.pathToFiles}`);
    console.log(`  - PR Number: ${this.prNumber || 'Not available'}\n`);
  }

  /**
   * Log changed files
   */
  logChangedFiles(changedFiles) {
    if (changedFiles.length === 0) {
      console.log('✅ No changes detected - nothing to review');
      return false;
    }

    console.log(`📁 Found ${changedFiles.length} changed files in repository:\n`);
    changedFiles.forEach(filePath => {
      console.log(`  📄 ${filePath}`);
    });
    console.log('');
    return true;
  }

  /**
   * Log LLM response
   */
  logLLMResponse(llmResponse) {
    if (llmResponse) {
      console.log('🤖 LLM Review Results:');
      console.log('================================================================================');
      console.log(llmResponse);
      console.log('================================================================================\n');
      return true;
    }
    return false;
  }

  /**
   * Log final decision
   */
  logFinalDecision(shouldBlockMerge) {
    if (shouldBlockMerge) {
      console.log('🚨 MERGE BLOCKED: LLM review found critical issues that must be addressed before merging.');
      console.log('   Please fix the issues mentioned above and run the review again.');
      process.exit(1); // Exit with error code to block merge
    } else {
      console.log('✅ MERGE APPROVED: No critical issues found. Safe to merge.');
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
    console.log(`🤖 Running LLM Review of branch changes...\n`);
      
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
const reviewer = new GitHubActionsReviewer();
reviewer.runReview().catch(error => {
  console.error('❌ Review failed:', error.message);
  process.exit(1);
}); 