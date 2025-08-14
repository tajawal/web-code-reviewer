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
  DEFAULT_LANGUAGE: 'js', // Default language for code review
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
  ],
  // Language-specific file extensions and patterns
  LANGUAGE_CONFIGS: {
    js: {
      extensions: ['.js', '.jsx', '.ts', '.tsx', '.mjs'],
      patterns: ['*.js', '*.jsx', '*.ts', '*.tsx', '*.mjs'],
      name: 'JavaScript/TypeScript'
    },
    python: {
      extensions: ['.py', '.pyw', '.pyx', '.pyi'],
      patterns: ['*.py', '*.pyw', '*.pyx', '*.pyi'],
      name: 'Python'
    },
    java: {
      extensions: ['.java'],
      patterns: ['*.java'],
      name: 'Java'
    },
    php: {
      extensions: ['.php'],
      patterns: ['*.php'],
      name: 'PHP'
    }
  }
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
 * Language-specific review prompts
 */
const LANGUAGE_PROMPTS = {
  js: `Role & Goal
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
- Summary of key issues by category (bullets, ≤6 lines):
  • 🔒 Security issues
  • ⚡ Performance issues  
  • 🛠️ Maintainability issues
  • 📚 Best Practices issues

Frontend-specific checks (only if visible in diff)
- React: unstable hook deps; heavy work in render; missing cleanup in useEffect; dangerouslySetInnerHTML; index-as-key on dynamic lists; consider Suspense/lazy for large modules.
- TypeScript: any/unknown leakage; unsafe narrowing; non-null assertions (!).
- Fetch/IO: missing abort/timeout; lack of retry/backoff for critical calls; leaking subscriptions/websockets.
- Accessibility: critical only if it blocks core flows.

Context: Here are the code changes (diff or full files):`,

  python: `Role & Goal
  You are a senior Python engineer (10+ years) reviewing only the provided diff/files for enterprise Python apps (APIs/services/data jobs). Produce a single summary comment (no inline clutter) that highlights critical, hard-to-spot issues across Performance, Security, Maintainability, and Best Practices.

Scope & Exclusions (very important)
- Focus on critical risks: exploitable security flaws, meaningful performance regressions, memory/resource leaks, unsafe patterns, architectural violations.
- Ignore style/formatting/naming/import order/linters/auto-formatters, and any non-material preferences.
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

Auto-critical overrides (regardless of score)
- Unsafe code execution/deserialization on untrusted input (e.g., eval/exec, pickle.loads, yaml.load without SafeLoader).
- Hard-coded secrets/credentials/API keys/private keys embedded in code or configs.
- Unbounded loops/threads/timers or resource leaks (files/sockets/processes not closed; missing context managers) causing growth/leak.
- Direct system/DB calls from untrusted input without validation/parameterization (e.g., subprocess(..., shell=true) or string-formatted SQL).

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
      "file": "app/services/user_service.py",
      "lines": [120, 134],
      "snippet": "<10-line minimal excerpt>",
      "why_it_matters": "Concrete impact in 1 sentence.",
      "fix": "Specific steps or code patch.",
      "tests": "Brief test to prevent regression (e.g., pytest).",
      "occurrences": [
        {"file": "app/api/users.py", "lines": [88, 95]}
      ]
    }
  ],
  "metrics": { "critical_count": 0, "suggestion_count": 0 },
  "final_recommendation": "safe_to_merge|do_not_merge"
}
\`\`\`

Then add a short human summary:
- Summary of key issues by category (bullets, ≤6 lines):
  • 🔒 Security issues  
  • ⚡ Performance issues  
  • 🛠️ Maintainability issues  
  • 📚 Best Practices issues

Python-specific checks (only if visible in diff)
- Web frameworks (Django/Flask/FastAPI): DEBUG=true in prod; missing CSRF where required; missing authz checks; raw/unparameterized SQL; path traversal in file ops; open redirects; overly permissive CORS.
- I/O & Network: requests without timeouts/retries; verify=false on TLS; unbounded file/socket usage; missing context managers (with open(...)); large in-memory loads where streaming fits.
- Concurrency & Async: blocking calls in async handlers; missing await; unjoined threads/processes; race conditions without locks; misuse of shared mutables.
- Language & Stdlib: eval/exec; pickle/yaml.load (unsafe loader); subprocess(..., shell=true) with user input; broad except Exception swallowing errors; mutable default args; weak crypto for security (e.g., md5/sha1 for passwords, using random instead of secrets).

Context: Here are the code changes (diff or full files):`,

  java: `Role & Goal
You are a senior Java engineer (10+ years) reviewing only the provided diff/files for enterprise Java apps (Spring Boot/Jakarta EE/microservices). Produce a single summary comment (no inline clutter) that highlights critical, hard-to-spot issues across Performance, Security, Maintainability, and Best Practices.

Scope & Exclusions (very important)
- Focus on critical risks: exploitable security flaws, meaningful performance regressions, memory/resource leaks, unsafe patterns, architectural violations.
- Ignore style/formatting/naming/import order/checkstyle/spotless concerns, and any non-material preferences.
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

Auto-critical overrides (regardless of score)
- Unsafe deserialization / code execution on untrusted input (e.g., ObjectInputStream.readObject, Jackson default-typing enabling polymorphic deserialization, SnakeYAML load without safe config).
- Hard-coded secrets/credentials/API keys/private keys in source or configs.
- Command injection / shell execution using untrusted input (e.g., Runtime.getRuntime().exec, ProcessBuilder) without strict whitelisting.
- SQL/JPQL injection via string concatenation (no prepared statements/parameter binding).
- XXE / XML parser not hardened (no FEATURE_SECURE_PROCESSING, external entities enabled).
- Unbounded thread pools/schedulers/timers or resource leaks (unclosed Connection/ResultSet/InputStream; missing try-with-resources) causing growth/leak.

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
      "file": "src/main/java/com/example/user/UserService.java",
      "lines": [120, 134],
      "snippet": "<10-line minimal excerpt>",
      "why_it_matters": "Concrete impact in 1 sentence.",
      "fix": "Specific steps or code patch.",
      "tests": "Brief test to prevent regression (e.g., JUnit + MockMvc).",
      "occurrences": [
        {"file": "src/main/java/com/example/api/UserController.java", "lines": [88, 95]}
      ]
    }
  ],
  "metrics": { "critical_count": 0, "suggestion_count": 0 },
  "final_recommendation": "safe_to_merge|do_not_merge"
}
\`\`\`

Then add a short human summary:
- Summary of key issues by category (bullets, ≤6 lines):
  • 🔒 Security issues  
  • ⚡ Performance issues  
  • 🛠️ Maintainability issues  
  • 📚 Best Practices issues

Java-specific checks (only if visible in diff)
- Web & REST (Spring/Jakarta): Missing authn/authz on endpoints; permissive CORS; user input directly into queries; unvalidated redirects; exposing stack traces in prod; @ControllerAdvice/exception handlers swallowing errors.
- DB & ORM (JPA/Hibernate/MyBatis): N+1 queries; missing @Transactional where required; string-concatenated queries; lack of indices for hot lookups; incorrect fetch type (EAGER on large graphs).
- I/O & HTTP clients: No timeouts/retries/circuit breakers (e.g., HttpClient, RestTemplate, WebClient); SSLSocketFactory/TLS verification disabled; large payloads buffered in memory instead of streaming.
- Concurrency & Resources: Blocking calls on reactive/async threads; unbounded ExecutorService/Scheduler; not closing streams/sockets; missing try-with-resources; misuse of synchronized leading to contention; unsafe publication/races.
- Security & Crypto: MessageDigest with MD5/SHA-1 for passwords (use bcrypt/Argon2/PBKDF2); SecureRandom vs Random for secrets; JWT without signature/verification; weak CSRF handling where applicable.
- Serialization & XML/JSON: Jackson default typing enabling polymorphic gadget chains; SnakeYAML unsafe load; XML parsers without secure features (XXE).
- Logging & Errors: Logging sensitive data (tokens/PII); excessive logging in hot paths; broad catch (Exception) suppressing failures.

Context: Here are the code changes (diff or full files):`,

php: `Role & Goal
You are a senior PHP engineer (10+ years) reviewing only the provided diff/files for enterprise PHP apps (Laravel/Symfony/WordPress/custom frameworks). Produce a single summary comment (no inline clutter) that highlights critical, hard-to-spot issues across Performance, Security, Maintainability, and Best Practices.

Scope & Exclusions (very important)
- Focus on critical risks: exploitable security flaws, meaningful performance regressions, memory/resource leaks, unsafe patterns, architectural violations.
- Ignore style/formatting/naming/import order/linters/auto-formatters (phpcs/php-cs-fixer) concerns, and any non-material preferences.
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

Auto-critical overrides (regardless of score)
- Unsafe deserialization/code execution on untrusted input (e.g., \\unserialize, \\eval, dynamic \\include/\\require from user input).
- Hard-coded secrets/credentials/API keys/private keys in source or configs (e.g., committing .env values).
- SQL injection via string concatenation (no prepared statements/parameter binding), or raw queries with user input.
- Cross-site scripting (XSS): echoing unescaped user data in templates (Blade/Twig/Plain PHP) or building HTML with untrusted input.
- CSRF missing/disabled on state-changing routes where framework support exists.
- Insecure file upload/handling (no whitelist validation, storing in webroot, no size/MIME checks), path traversal in file operations.
- Remote call risks: SSRF via cURL/Guzzle with unvalidated URLs, disabling TLS verification.
- Long-running workers/daemons (queues/Swoole/RoadRunner) leaking memory/resources or unbounded retries.

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
      "file": "app/Http/Controllers/UserController.php",
      "lines": [120, 134],
      "snippet": "<10-line minimal excerpt>",
      "why_it_matters": "Concrete impact in 1 sentence.",
      "fix": "Specific steps or code patch.",
      "tests": "Brief test to prevent regression (e.g., Pest/PHPUnit feature test).",
      "occurrences": [
        {"file": "resources/views/users/index.blade.php", "lines": [88, 95]}
      ]
    }
  ],
  "metrics": { "critical_count": 0, "suggestion_count": 0 },
  "final_recommendation": "safe_to_merge|do_not_merge"
}
\`\`\`

Then add a short human summary:
- Summary of key issues by category (bullets, ≤6 lines):
  • 🔒 Security issues
  • ⚡ Performance issues
  • 🛠️ Maintainability issues
  • 📚 Best Practices issues

PHP-specific checks (only if visible in diff)
- Web & Routing (Laravel/Symfony): missing authn/authz middleware; overly permissive CORS; mass-assignment vulnerabilities (unguarded models/fillable misuse); missing validation/sanitization on request data; returning sensitive data in responses.
- Views/Templates: unescaped output in Blade/Twig/echo; building HTML via string concatenation with user input; unsafe raw tags (\\{!! !!}\\).
- Database/ORM: raw queries with concatenated input; N+1 queries (eager loading missing); transactions missing for multi-step writes; lack of indexes for hot lookups.
- I/O & HTTP clients: cURL/Guzzle without timeouts/retries; TLS verification disabled; large payloads buffered in memory instead of streamed; not closing file handles.
- Sessions & Cookies: weak cookie flags (no HttpOnly/Secure/SameSite); storing secrets/PII in session without encryption.
- Crypto & Passwords: using md5/sha1 or \\password_hash without appropriate algorithm options; using \\rand for tokens instead of \\random_bytes/\\bin2hex.
- Errors & Logging: exposing stack traces in production; logging sensitive data (tokens/PII); broad catch blocks hiding failures.
- Workers/Queues/Schedulers: memory leaks from static caches/large arrays, unbounded retries, missing backoff/dead-letter handling.

Context: Here are the code changes (diff or full files):`
};

/**
 * Get review prompt for specific language
 */
function getReviewPrompt(language) {
  return LANGUAGE_PROMPTS[language] || LANGUAGE_PROMPTS.js; // Default to JS if language not found
}

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