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
  // Logging configuration
  ENABLE_REVIEW_LOGGING: true, // Enable logging to external endpoint
  LOGGING_ENDPOINT: 'https://www.almosafer.com/deep-review/log', // External logging endpoint
  LOGGING_TIMEOUT: 10000, // Timeout for logging requests (10 seconds)
  // PR Label configuration
  POST_REVIEW_LABEL: 'deep review completed', // Label to add after code review
  POST_REVIEW_LABEL_COLOR: '0366d6', // GitHub blue color
  POST_REVIEW_LABEL_DESCRIPTION: 'Pull request has been reviewed by AI code reviewer',
  // Consistency configuration
  ENABLE_CONSISTENCY_MEASURES: true, // Enable deterministic hashing and consistency checks
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
 * Shared prompt components
 */
const SHARED_PROMPT_COMPONENTS = {
  // Common role and goal template
  roleAndGoal: (language, role) => `Role & Goal
You are a senior ${role} (10+ years) reviewing only the provided diff/files for enterprise ${language} apps. Produce a single summary comment (no inline clutter) that highlights critical, hard-to-spot issues across Performance, Security, Maintainability, and Best Practices.`,

  detrminismAndOutputContract:`
Determinism & Output Contract
- Return EXACTLY two parts, in this order, with no extra prose:
  1) <JSON>…valid single JSON object…</JSON>
  2) <SUMMARY>…a brief human summary (≤6 bullets)…</SUMMARY>
- Do NOT wrap JSON in markdown/code fences. No commentary outside these tags.
- If the JSON would be invalid, immediately re-emit a corrected JSON object (no explanations).
- Maximum 10 issues. Sort by severity_score (desc). Use 1-based, inclusive line numbers. Round severity_score to 2 decimals.
- CRITICAL: Be deterministic. For identical code inputs, produce identical outputs.
- Use consistent issue IDs: SEC-01, SEC-02, PERF-01, PERF-02, MAINT-01, MAINT-02, BEST-01, BEST-02.
- Apply the same severity scoring algorithm consistently across all issues.
- If no issues found, return empty issues array with summary indicating "No issues detected".
`,
  // Common scope and exclusions
  scopeAndExclusions: `Scope & Exclusions (very important)
- Focus ONLY on critical risks: exploitable security flaws, meaningful performance regressions, memory/resource leaks, unsafe patterns, architectural violations.
- Ignore style/formatting/naming/import order/linters/auto-formatters and non-material preferences.
- Do NOT assume unseen code. If context is missing, lower evidence_strength and confidence; mark as "suggestion".`,

  // Common severity scoring
  severityScoring: `Severity Scoring (mandatory)
For EACH issue, assign 0–5 scores using these EXACT criteria:
- impact: 0=none, 1=low, 2=medium, 3=high, 4=severe, 5=critical
- exploitability: 0=impossible, 1=very hard, 2=hard, 3=moderate, 4=easy, 5=trivial
- likelihood: 0=never, 1=rare, 2=unlikely, 3=possible, 4=likely, 5=certain
- blast_radius: 0=none, 1=local, 2=component, 3=module, 4=system, 5=entire app
- evidence_strength: 0=none, 1=weak, 2=moderate, 3=strong, 4=very strong, 5=conclusive

Compute EXACTLY:
severity_score = 0.35*impact + 0.30*exploitability + 0.20*likelihood + 0.10*blast_radius + 0.05*evidence_strength

Set severity_proposed using EXACT thresholds:
- "critical" if severity_score ≥ 3.60 AND evidence_strength ≥ 3
- otherwise "suggestion"

Add "risk_factors_notes": one short line per factor explaining the anchor (e.g., "exploitability=5: unescaped input flows to innerHTML").

CRITICAL: Apply these exact same criteria and thresholds to identical code patterns.`,

  // Common evidence requirements
  evidenceRequirements: `Evidence Requirements (for EACH issue)
- Provide: file (relative path), lines [start,end], snippet (≤12 lines, must include the risky call/sink), why_it_matters (1 sentence), fix_summary (1–2 sentences), fix_code_patch (specific code changes), tests (brief regression test), confidence ∈ [0,1].
- Deduplicate repeated patterns via "occurrences": array of {file, lines}.
- If you cannot anchor an exact edit, prefix fix_code_patch with "// approximate", set evidence_strength ≤ 2 and confidence ≤ 0.5.`,

  // Common final policy
  finalPolicy: `Final Policy
- final_recommendation = "do_not_merge" if any issue is "critical" with confidence ≥ 0.6; else "safe_to_merge".`,

  // Common output format
  outputFormat: (testExample, fileExample) => `Output Format
Emit EXACTLY this JSON schema inside <JSON> … </JSON>, then a short human summary inside <SUMMARY> … </SUMMARY>:

<JSON>
{
  "summary": "1–3 sentences overall assessment.",
  "issues": [
    {
      "id": "SEC-01",
      "category": "security|performance|maintainability|best_practices",
      "severity_proposed": "critical|suggestion",
      "severity_score": 0.00,
      "risk_factors": { "impact": 0, "exploitability": 0, "likelihood": 0, "blast_radius": 0, "evidence_strength": 0 },
      "risk_factors_notes": {
        "impact": "short anchor text",
        "exploitability": "short anchor text",
        "likelihood": "short anchor text",
        "blast_radius": "short anchor text",
        "evidence_strength": "short anchor text"
      },
      "confidence": 0.0,
      "file": "${fileExample}",
      "lines": [120,134],
      "snippet": "<12-line minimal excerpt including the risky sink/call>",
      "why_it_matters": "Concrete impact in 1 sentence.",
      "fix_summary": "Brief description of the fix approach (1–2 sentences).",
      "fix_code_patch": "// concrete or approximate minimal patch anchored to the snippet/lines",
      "tests": "Brief test to prevent regression${testExample}",
      "occurrences": [
        {"file": "${fileExample}", "lines": [88,95]}
      ]
    }
  ],
  "metrics": {
    "critical_count": 0,
    "suggestion_count": 0,
    "by_category": { "security": 0, "performance": 0, "maintainability": 0, "best_practices": 0 },
    "auto_critical_hits": 0
  },
  "final_recommendation": "safe_to_merge|do_not_merge"
}
</JSON>

<SUMMARY>
• 🔒 Security issues — short note
• ⚡ Performance issues — short note
• 🛠️ Maintainability issues — short note
• 📚 Best Practices issues — short note
</SUMMARY>`,

  // Common context
  context: (diffHash) => `Context: Here are the code changes (diff or full files):
Deterministic Seed: ${diffHash || 'no-hash'}`
};

/**
 * Language-specific auto-critical overrides
 */
const LANGUAGE_CRITICAL_OVERRIDES = {
  js: `Auto-critical overrides (regardless of score)
- Unsanitized HTML sinks: innerHTML/dangerouslySetInnerHTML with untrusted input.
- User-influenced navigation/DOM injection without validation/escaping (location.href/assign/open, element.innerHTML, insertAdjacentHTML).
- window.postMessage with "*" targetOrigin or without strict origin checks.
- <a target="_blank"> to user-influenced URL without rel="noopener noreferrer".
- Dynamic code execution with untrusted input (eval, new Function, VM).
- Secrets/credentials/API tokens embedded in client code or shipped to browser.
- Token/session persistence in localStorage/sessionStorage when any XSS sink exists.
- Unbounded listeners/intervals/timeouts or render-time loops causing growth/leak.
- URL.createObjectURL used with untrusted blobs without revocation/validation.
- Missing CSRF protection on same-origin state-changing fetch/XHR.
- XSS via unescaped user input rendered into the DOM/HTML.`,

  python: `Auto-critical overrides (regardless of score)
- eval/exec on user input.
- pickle.load or yaml.load (unsafe Loader) on untrusted data.
- subprocess/os.system with shell=True and untrusted input (command injection).
- SQL composed with f-strings/%/.format (no parameterization).
- requests/urllib with SSL verification disabled (verify=False).
- DEBUG=True or template autoescape disabled in production.
- Jinja2/Django template injection via unescaped user input.
- CSRF disabled/missing for state-changing endpoints (web apps).
- Path traversal in file I/O without canonicalization/validation.
- Weak crypto (MD5/SHA1 for passwords; DES/ECB; hardcoded keys/seeds).
- Secrets/credentials embedded in code or .py files.
- Unbounded threads/async tasks/loops causing memory/CPU leak or DoS.`,

  java: `Auto-critical overrides (regardless of score)
- Runtime.getRuntime().exec / ProcessBuilder with unvalidated input.
- Raw SQL via java.sql.Statement or string concatenation (use PreparedStatement).
- Insecure deserialization: ObjectInputStream on untrusted data; unsafe Java serialization.
- TLS/cert validation disabled (TrustAllCerts / always-true HostnameVerifier / InsecureSkipVerify equivalents).
- Logging sensitive data (passwords/tokens/PII) in plaintext or at INFO/DEBUG.
- Path traversal in file I/O without canonicalization/checks.
- Command injection via shell calls / native processes from user input.
- XSS/HTML injection in server-side rendered responses due to missing escaping.
- CSRF disabled for state-changing endpoints without compensating controls.
- Weak crypto (MD5/SHA1 for passwords, DES/ECB, hardcoded keys/seeds).
- Unbounded threads/executors/schedulers causing memory/CPU leak or DoS.`,

  php: `Auto-critical overrides (regardless of score)
- eval/assert/create_function on user input.
- File inclusion from user-controlled input (include/require with tainted path).
- unserialize on untrusted data; unsafe __wakeup/__destruct gadget chains.
- SQL injection via interpolated strings; missing PDO prepared statements/bindings.
- Passwords hashed with md5/sha1 (use password_hash/password_verify).
- Exposing phpinfo or debug toolbars in production.
- Command injection via shell_exec/system/passthru with untrusted input.
- XSS via unescaped user input in templates (echo/print) or legacy engines.
- CSRF middleware disabled or missing on state-changing routes.
- Weak session config (missing HttpOnly/Secure/SameSite; session fixation).
- Path traversal in file operations without sanitization.
- Secrets/credentials in code or committed configs.`
};

/**
 * Language-specific checks
 */
const LANGUAGE_SPECIFIC_CHECKS = {
  js: `JavaScript/TypeScript checks (only if visible in diff)
- React: unstable hook deps; heavy work in render; missing cleanup in useEffect; dangerouslySetInnerHTML; index-as-key on dynamic lists; un-memoized context values; consider lazy()/Suspense for large modules.
- TypeScript: any/unknown leakage across module boundaries; unsafe narrowing; non-null assertions (!); ambient type mutations.
- Fetch/IO: missing AbortController/timeout; no retry/backoff for critical calls; leaking subscriptions/websockets; unbounded intervals.
- Performance: N+1 renders; O(n²) loops over props/state; large lists without virtualization; expensive JSON.stringify in deps.
- Security: user-controlled URLs passed to location.assign/href/open; URL.createObjectURL on untrusted blobs; storage of tokens in localStorage/sessionStorage (flag high risk).
- Accessibility: only flag as "critical" if it blocks core flows.`,

  python: `Python-specific checks (only if visible in diff)
- Performance: loading large datasets wholly into memory instead of streaming; blocking I/O in async functions; unbounded recursion; excessive global caches without eviction.
- Maintainability: circular imports; giant monolithic scripts; bare except clauses; mutable default arguments; tight coupling between modules.
- Best practices: missing context managers (with open); requests without timeouts; weak logging/redaction of secrets; misuse of globals in concurrency.
- Web specifics (Django/Flask/FastAPI): CSRF disabled; debug=True in production; open CORS; Jinja2 autoescape disabled; unsanitized input passed to render_template.`,

  java: `Java-specific checks (only if visible in diff)
- Performance: opening/closing DB connections inside loops; unbounded thread creation; missing close on I/O streams/sockets; synchronized hot paths causing contention.
- Maintainability: god-classes (>1k LOC); methods >200 LOC; excessive static state/singletons; cyclic dependencies.
- Best practices: missing try-with-resources; swallowed exceptions; misuse of Optional; unchecked futures; blocking calls on reactive threads.
- Web/Spring specifics: disabled CSRF without compensating controls; permissive CORS ("*"); @Controller returning unescaped user content; missing @Valid on request DTOs.`,

  php: `PHP-specific checks (only if visible in diff)
- Performance: N+1 queries in loops; lack of query caching; output buffering absent for large responses.
- Maintainability: global state; mixing presentation and business logic; lack of namespaces/autoloading; sprawling includes.
- Best practices: missing input validation/sanitization (filter_input/htmlspecialchars); deprecated APIs (mysql_* / ereg); weak session settings (no HttpOnly/SameSite).
- Framework specifics (Laravel/Symfony): mass-assignment without guarded/fillable; CSRF middleware disabled; debug mode enabled in prod.`
};

/**
 * Language-specific configurations
 */
const LANGUAGE_CONFIGS = {
  js: {
    role: 'frontend engineer',
    language: 'JavaScript/TypeScript',
    testExample: ' (e.g., RTL/jest/vitest).',
    fileExample: 'src/components/Table.tsx'
  },
  python: {
    role: 'Python engineer',
    language: 'Python',
    testExample: ' (e.g., pytest)',
    fileExample: 'app/services/user_service.py'
  },
  java: {
    role: 'Java engineer',
    language: 'Java',
    testExample: ' (e.g., JUnit + MockMvc)',
    fileExample: 'src/main/java/com/example/user/UserService.java'
  },
  php: {
    role: 'PHP engineer',
    language: 'PHP',
    testExample: ' (e.g., Pest/PHPUnit feature test)',
    fileExample: 'app/Http/Controllers/UserController.php'
  }
};

/**
 * Build complete prompt for a specific language
 */
function buildLanguagePrompt(language, diffHash = null) {
  const config = LANGUAGE_CONFIGS[language];
  if (!config) {
    throw new Error(`Unsupported language: ${language}`);
  }

  return `${SHARED_PROMPT_COMPONENTS.roleAndGoal(config.language, config.role)}

${SHARED_PROMPT_COMPONENTS.detrminismAndOutputContract}

${SHARED_PROMPT_COMPONENTS.scopeAndExclusions}

${SHARED_PROMPT_COMPONENTS.severityScoring}

${LANGUAGE_CRITICAL_OVERRIDES[language]}

${LANGUAGE_SPECIFIC_CHECKS[language]}

${SHARED_PROMPT_COMPONENTS.evidenceRequirements}

${SHARED_PROMPT_COMPONENTS.finalPolicy}

${SHARED_PROMPT_COMPONENTS.outputFormat(config.testExample, config.fileExample)}

${SHARED_PROMPT_COMPONENTS.context(diffHash)}`;
}

/**
 * Language-specific review prompts (now built dynamically)
 */
const LANGUAGE_PROMPTS = {
  js: buildLanguagePrompt('js'),
  python: buildLanguagePrompt('python'),
  java: buildLanguagePrompt('java'),
  php: buildLanguagePrompt('php')
};

/**
 * Get review prompt for specific language
 */
function getReviewPrompt(language, diffHash = null) {
  return buildLanguagePrompt(language, diffHash) || buildLanguagePrompt('js', diffHash); // Default to JS if language not found
}

 /**
   * Get language identifier for syntax highlighting based on file extension
   */
 function getLanguageForFile(filePath) {
  if (!filePath) return '';
  
  const extension = filePath.split('.').pop().toLowerCase();
  const languageMap = {
    'js': 'javascript',
    'jsx': 'javascript',
    'ts': 'typescript',
    'tsx': 'typescript',
    'py': 'python',
    'pyw': 'python',
    'pyx': 'python',
    'pyi': 'python',
    'java': 'java',
    'php': 'php',
    'html': 'html',
    'css': 'css',
    'scss': 'scss',
    'less': 'less',
    'json': 'json',
    'xml': 'xml',
    'yaml': 'yaml',
    'yml': 'yaml',
    'md': 'markdown',
    'sql': 'sql',
    'sh': 'bash',
    'bash': 'bash',
    'dockerfile': 'dockerfile',
    'docker': 'dockerfile'
  };
  
  return languageMap[extension] || '';
}

module.exports = {
  CONFIG,
  LLM_PROVIDERS,
  LANGUAGE_PROMPTS,
  SHARED_PROMPT_COMPONENTS,
  LANGUAGE_CRITICAL_OVERRIDES,
  LANGUAGE_SPECIFIC_CHECKS,
  LANGUAGE_CONFIGS,
  getReviewPrompt,
  getLanguageForFile
};