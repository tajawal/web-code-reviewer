/**
 * QA Automation critical overrides
 */
const QA_CRITICAL_OVERRIDES = {
  qa_web: `Auto-Critical Overrides for Cypress Tests — deterministic and absolute
Policy:
- Test automation best practices violations = severity_proposed="critical".
- Minor maintainability or code quality issues = "suggestion".
- Always anchor ≤12-line snippet including the problematic test pattern. Use post-patch line numbers.

Auto-critical items (internal qa-frontend-cypress architectural violations):
- Actions/methods in PO files → Anchor: function definition or cy.get() call in PO file. Fix: move actions to corresponding CC file, keep only string selectors in PO.
- Direct selectors for test actions in test files → Anchor: cy.get().click(), cy.get().type(), or action-based selectors in spec.js files. Fix: use CC functions for test actions. Note: Conditional checks like $body.find().length are acceptable.
- Missing corresponding PO file for CC → Anchor: CC file without matching PO import. Fix: create corresponding PO file following [module][component]PO.js pattern.
- Hardcoded POS/currency/language values → Anchor: hardcoded strings 'sa', 'ae', 'SAR', 'AED', 'ar', 'en' without imports from customHelpers/configuration. Fix: use posConfiguration, currencyHelper, languageHelper imports.
- Hardcoded calendar/session/environment values → Anchor: hardcoded month names, session properties, environment strings without imports from customHelpers/configuration. Fix: use calendarConfiguration, sessionConfiguration helpers.
- API calls without handler pattern → Anchor: cy.request() in test/CC files. Fix: use apiHandlers from fixtures/api/[module]/apiHandlers/.
- Reusable configuration functions in spec.js files → Anchor: configuration functions that could be reused across multiple spec files, like const posConfig, const environmentSetup in spec.js. Fix: move to customHelpers/configuration/ directory and import. Note: Test-specific setup functions are acceptable.
- Wrong file directory structure → Anchor: file not in fixtures/pageClasses/[platform]/[module]/[component]/ pattern. Fix: move to correct directory structure.
- Naming convention violations → Anchor: file not following [module][component]PO.js or [module][component]CC.js pattern. Fix: rename following established naming convention.
- README.md files in subdirectories → Anchor: new README.md file in subdirectory. Fix: remove auto-generated README.md files, keep only project root README.md.

Auto-critical items (general cypress/web automation best practices):
- Missing test isolation (shared state, no cleanup) → Anchor: test without proper setup/teardown. Fix: add beforeEach/afterEach hooks.
- Non-deterministic selectors (brittle XPath, auto-generated classes) → Anchor: brittle selector. Fix: use data-testid or accessibility queries.
- Missing Page Object patterns causing code duplication → Anchor: repeated selectors/actions. Fix: extract to page objects or custom commands.
- Unbounded operations or infinite loops in tests → Anchor: loop without exit condition. Fix: add proper bounds and timeouts.
- Tests disabling browser security in production builds → Anchor: security config without environment guards. Fix: guard with test environment checks (if (Cypress.env('environment') === 'test')) or document justification.
- Focused/skipped tests (it.only, it.skip, xit) committed → Anchor: test modifier. Fix: remove modifier before merge.

Note: Test credentials and controlled security bypasses are acceptable in automation context.


Tests (≤2 lines examples):
Internal architectural violations:
- PO with action: export function click() → move to CC file, keep only selectors in PO.
- Direct selector for action: cy.get('[data-testid="btn"]').click() in spec.js → use CC function like clickButton().
- Reusable config in spec: const posConfig = {...} reused across specs → move to customHelpers/configuration/.
- Hardcoded config: const pos = 'sa' → import { posSa } from customHelpers/configuration/posConfiguration.
- Security bypass in prod: chromeWebSecurity: false → guard with environment check or document test-only usage.
- Wrong directory: desktop/flights/search.js → fixtures/pageClasses/desktop/flights/flightsSearch/.

General cypress best practices:
- Brittle selector: cy.get('.btn:nth-child(2)') → cy.get('[data-testid="submit-btn"]').
- Focused test: it.only('test') → it('test').
- Auto-generated README: cypress/e2e/README.md → remove file, keep only root README.md.`,

  qa_android: `Auto-Critical Overrides for Appium Android Tests — deterministic and absolute
Policy:
- Test automation best practices violations = severity_proposed="critical".
- Minor maintainability or code quality issues = "suggestion".
- Always anchor ≤12-line snippet including the problematic test pattern. Use post-patch line numbers.

Auto-critical items (internal qa-android architectural violations):
- Locators mixed with actions in UIElements classes → Anchor: action methods (click, getText, sendKeys) inside [Module]ScreenUIElements classes. Fix: move actions to corresponding [Module]ScreenActions class, keep only WebElement declarations in UIElements.
- Actions mixed with locators in Actions classes → Anchor: @AndroidFindBy annotations or WebElement declarations in [Module]ScreenActions classes. Fix: move locators to corresponding [Module]ScreenUIElements class.
- Direct locators in test files → Anchor: @AndroidFindBy, By.id(), or WebElement declarations in test classes. Fix: move locators to corresponding [Module]ScreenUIElements class.
- Direct WebDriver usage in tests → Anchor: driver.findElement() or direct WebDriver calls in @Test methods. Fix: use Screen object methods instead.
- Hardcoded test data when constants exist → Anchor: literal strings for test data when corresponding [Module]CV constants are available in project. Fix: use existing Constants classes.
- Manual wait implementation → Anchor: Thread.sleep() or new WebDriverWait() in test or screen classes when WebDriverWaitUtils exists. Fix: use WebDriverWaitUtils.waitUntilVisibilityOfElement().
- Manual gesture implementation → Anchor: custom swipe/scroll implementation when MobileGesturesUtil exists. Fix: use MobileGesturesUtil methods.

Auto-critical items (general appium/android automation best practices):
- Non-deterministic locators → Anchor: absolute XPath with indices like "//android.widget.Button[2]" or "//android.view.View[3]/android.widget.Text". Fix: use accessibility or resource-id locators.
- Missing test isolation (shared state, no cleanup) → Anchor: @Test without proper @BeforeMethod/@AfterMethod or shared app state. Fix: add proper setup/teardown and app state reset.
- Missing Screen Object patterns causing code duplication → Anchor: repeated locator/action patterns across test methods. Fix: extract to Screen Object classes following project architecture.
- Ignored tests (@Ignore, @Disabled) committed → Anchor: test annotation. Fix: remove ignore or fix underlying issue.
- Focused/skipped tests committed → Anchor: test methods with enabled=false or priority modifications for debugging. Fix: remove test focus before merge.

Note: Test credentials and controlled device security bypasses are acceptable in automation context.

Tests (≤2 lines examples):
Internal architectural violations:
- Actions in UIElements: ui.submitButton.click() in UIElements class → move to Actions class.
- Locators in Actions: @AndroidFindBy in Actions class → move to UIElements class.
- Direct locator in test: @AndroidFindBy in test class → move to [Module]ScreenUIElements.
- Direct WebDriver: driver.findElement() in test → use screen.actions.clickButton().
- Hardcoded data when constants exist: String city = "Dubai" → use ActivitiesCV.CITY_NAME (if available).
- Manual wait: Thread.sleep(3000) in screen class → WebDriverWaitUtils.waitUntilVisibilityOfElement().
- Manual gesture: custom swipe code → MobileGesturesUtil.swipeLeftOnElement().

General automation best practices:
- Brittle locator: "//android.widget.Button[2]" → accessibility = "submitButton".
- Missing isolation: @Test without cleanup → add @BeforeMethod/@AfterMethod.
- Code duplication: repeated screen interactions → extract to Screen Object classes.
- Ignored test: @Ignore @Test → @Test (fix or remove).
- Focused test: enabled=false → remove before merge.`,

  qa_backend: `Auto-Critical Overrides for RestAssured API Tests — deterministic and absolute
Policy:
- Test automation best practices violations = severity_proposed="critical".
- Minor maintainability or code quality issues = "suggestion".
- Always anchor ≤12-line snippet including the problematic test pattern. Use post-patch line numbers.

Auto-critical items (internal qa-backend architectural violations):
- Direct RestAssured calls in test files → Anchor: RestAssured given()/when()/then() chains directly in @Test methods without using project's API caller patterns. Fix: use existing API caller classes (e.g., ApiControllerApiCaller) or activator patterns from project.
- Hardcoded production URLs in test code → Anchor: production domain URLs (containing "prod", "production", "live") in test/activator files. Fix: use ConfigProperties.getProperty() methods for production URLs or use dedicated test environments.
- Hardcoded test data when alternatives exist → Anchor: literal values for IDs, codes, dates when TestDataProviders, validDataFaker, or Constants are available in project. Fix: use existing data generation patterns (TestDataProviders, validDataFaker.fillObject(), or Constants classes).
- Direct database connections in tests → Anchor: DriverManager.getConnection() or new MongoClient() in test files. Fix: use database connector classes or connection utilities.
- Missing reusable component pattern → Anchor: repeated API call sequences in multiple test methods. Fix: extract to helper classes, steps, or service classes.
- Complex test logic in @Test methods → Anchor: multi-step business logic directly in @Test methods (>50 lines). Fix: extract to flow/service classes or helper methods.
- Improper package structure → Anchor: test files not following logical organization (feature/domain/service grouping). Fix: organize tests by business domain, feature, or service.
- Missing test categorization when required → Anchor: @Test methods in integration/functional test suites without @Tag annotations when project uses tags for test organization. Fix: add appropriate @Tag annotations following project patterns (e.g., @Tag("hotels"), @Tag("flights")).
- Hardcoded business constants → Anchor: literal strings for business codes, IDs, or domain-specific values without constants. Fix: use Constants classes or configuration values.

Auto-critical items (general RestAssured/API automation best practices):
- Tests hitting production endpoints → Anchor: production domain URLs (containing "prod", "production", "api.company.com" without "test"/"staging"/"dev") in test configurations. Fix: use dedicated test environment endpoints instead of production.
- Excessive hardcoded waits (Thread.sleep ≥ 10000ms) → Anchor: Thread.sleep() call where duration ≥ 10000ms without clear justification. Fix: use polling with await(), proper retry logic, or document reason for long wait.
- Ignored tests (@Ignore, @Disabled) committed → Anchor: test annotation. Fix: remove ignore or fix underlying issue.
- Tests without proper data isolation → Anchor: @Test without cleanup or shared state. Fix: add @AfterEach cleanup or use test transactions.
- Tests disabling SSL verification → Anchor: relaxedHTTPSValidation() or similar calls. Fix: use proper certificates or environment-specific guards.
- Missing response validation → Anchor: API calls without any response validation (status code, response time, or content validation). Fix: add appropriate response validation using project's patterns (expectStatusCode, expectResponseTime, or schema validation).
- Unbounded loops or retry logic → Anchor: while loops without proper exit conditions. Fix: add timeout bounds and proper exit conditions.

Note: Test credentials, controlled SSL relaxation, and test environment URLs (staging/dev/test) are acceptable in automation context when properly isolated. Only flag production URLs in test code.

Tests (≤2 lines examples):
Internal architectural violations:
- Direct RestAssured call: given().when().get("/search") in @Test → use ApiControllerApiCaller or similar project pattern.
- Production URL in tests: baseURI("https://api-prod.com") → use dedicated test environments (staging/dev) or ConfigProperties for production URLs.
- Hardcoded data when alternatives exist: String hotelId = "12345" → use validDataFaker.fillObject() or existing Constants/TestDataProviders.
- Direct DB: new MongoClient() in test → DatabaseConnector.getConnection() or similar utility.
- Missing reusable: repeated API sequences → extract to helper/service classes.
- Wrong structure: src/test/java/RandomTest.java → src/test/java/domain/feature/FeatureTests.java.

General automation best practices:
- Production endpoint: tests hitting https://api-prod.com → use test environments (staging/dev).
- Excessive wait: Thread.sleep(10000) without justification → use polling, await(), or document async operation reason.
- Ignored test: @Ignore @Test → @Test (fix or remove).
- Missing validation: .get("/users") → .get("/users").then().body(matchesJsonSchema(schema)).`
};

/**
 * Language-specific auto-critical overrides for security issues
 */

const LANGUAGE_CRITICAL_OVERRIDES = {
  js: `Auto-Critical Overrides — deterministic and absolute

Instruction precedence (apply in this order):
1) Explicit Exceptions and Gates (this section)
2) Category-specific rules (e.g., Performance → Event burst control)
3) General scoring formula and tie-breakers

Performance Critical Gate (Debounce present) — ABSOLUTE:
If the same event path shows any debounce/throttle import OR call (e.g., lodash debounce/throttle, custom debounce):
- You MUST NOT mark a performance issue as "critical" unless you also anchor code that satisfies IneffectiveProof (see below).
- If IneffectiveProof is NOT satisfied, you MUST:
  - set severity_proposed = "suggestion"
  - set evidence_strength ≤ 2
  - set confidence ≤ 0.5
  - cap severity_score ≤ 2.00

IneffectiveProof (must anchor at least ONE of):
- Debounced wrapper is recreated each render (created in component body without useMemo/useRef and depends on unstable values), OR
- Debounce is created inside the handler (new instance per keystroke), OR
- wait < 32ms for text input (effectively no delay), OR
- Unstable deps cause identity churn of the debounced function, OR
- Async side-effect without unmount cleanup AND a directly observable stale update/race.

**CRITICAL CLARIFICATION for IneffectiveProof:**
- useMemo(() => debounce(callback, delay), [callback]) is CORRECT React pattern - callback dependency is required to prevent stale closures
- Only flag as ineffective if callback is unstable due to missing useCallback/useMemo in PARENT component
- Do not assume parent component issues from props alone - mark as "suggestion" with evidence_strength ≤ 2, confidence ≤ 0.5
- Debounce recreation when props change is NORMAL and NECESSARY React behavior, not a performance issue

Do not assume absence of a proper debounce just because its definition is outside the diff hunk. Missing definition ≠ proof of ineffectiveness.

Auto-critical items (other categories):
- Unescaped user input into dangerous DOM sinks: innerHTML, outerHTML, document.write, eval, Function, setTimeout/setInterval(string). Fix: safe DOM APIs, sanitization, templating.
- Direct database queries without parameterization. Fix: parameterized queries, prepared statements, ORM builders.
- Missing authentication/authorization checks in API routes or sensitive ops. Fix: explicit auth guard, RBAC/ABAC.
- Hardcoded secrets, API keys, or credentials in source. Fix: remove from code, load via env/secret manager, rotate keys.
- Unsafe deserialization of user data (JSON.parse untrusted, unsafe libs). Fix: schema validation, safe parser.
- Prototype pollution (user input merged into Object.prototype). Fix: allowlist clone, patched libs.
- Logging PII (names, emails, tokens, profiles) unless demonstrably stripped in production builds. Fix: remove/redact/gate logs.

Evidence defaults:
- Direct untrusted sink: evidence_strength=5, confidence=0.9.
- Risky sink but unclear taint: evidence_strength=3, confidence=0.6.
- Dev-only guarded: suggestion, evidence_strength=2, confidence=0.5.
- Debounce/Throttle evidence and score caps (Claude-specific):
  • Mitigation observed but definition/cleanup not visible → evidence_strength ≤ 2, confidence ≤ 0.5, cap severity_score ≤ 2.00, severity_proposed="suggestion".
  • IneffectiveProof satisfied with heavy work observed → impact=3–4, exploitability=3, likelihood=3, blast_radius=2, evidence_strength=3–4, confidence=0.7–0.8 (may reach "critical" if severity_score ≥ 3.60).
  • Do not infer ineffectiveness from absence of the definition in the hunk; lack of definition is not evidence.

Tests (≤2 lines examples):
- DOM injection: "<script>alert(1)</script>" is not executed.
- SQL injection: "' OR 1=1 --" does not alter query.
- Auth: unauthorized /admin returns 401/403.
- Secrets: no apiKey in build artifacts.
- Prototype pollution: "__proto__" input does not mutate Object prototype.
- Logging: prod build has no raw console.log(userData).
`,

  python: `Auto-critical Overrides — deterministic and absolute
Policy:
- If directly observed and reachable in production: severity_proposed="critical", evidence_strength=4–5, confidence≥0.8.
- If clearly dev/test-only or guarded and unreachable in prod: downgrade to "suggestion", set evidence_strength≤2 and confidence≤0.5, and prefix fix_code_patch with "// approximate" if anchoring is uncertain.
- Always anchor with a ≤12-line snippet including the risky call (and tainted source if applicable); use post-patch line numbers. If only a diff hunk is known, also cap evidence_strength≤2 and confidence≤0.5. Deduplicate via "occurrences".

Auto-critical items (with anchors & fixes):
- eval/exec on user input → Anchor: eval/exec call. Fix: remove dynamic eval; use safe parser/dispatch map.
- pickle.load or unsafe yaml.load on untrusted data → Anchor: call site. Fix: yaml.safe_load; avoid pickle for untrusted inputs.
- pandas.read_pickle/joblib.load/numpy.load(allow_pickle=True) on untrusted data → Anchor: call site. Fix: use safe formats (CSV/JSON/Parquet); numpy.load with allow_pickle=False.
- subprocess/os.system with shell=True + untrusted input → Anchor: call site. Fix: list args, shell=False, validate inputs.
- Raw SQL via f-strings/%/.format (no params) → Anchor: execute call. Fix: parameterized queries/placeholders.
- HTTP verify=False (requests/urllib) → Anchor: call site. Fix: verify TLS; pin cert/CA; guard dev-only.
- DEBUG=True or template autoescape disabled in prod → Anchor: settings/config. Fix: DEBUG=False; enable autoescape.
- Template injection (unescaped user input) → Anchor: render_template/context. Fix: rely on autoescape; sanitize/escape.
- CSRF disabled/missing on state-changing routes → Anchor: exempt/setting. Fix: enable CSRF tokens/policy.
- Path traversal in file I/O → Anchor: path build + open/remove. Fix: canonicalize/resolve + allow-list base dir.
- Weak crypto (MD5/SHA1 passwords, DES/ECB) or hardcoded keys → Anchor: hash/crypto call or literal key. Fix: modern KDF/algos; move secrets to env/secret store.
- Embedded API keys/secrets in code (api_key, access_token, client_secret, private_key, etc.) → Anchor: literal. Fix: remove/rotate; use secrets manager.
- Unbounded threads/async tasks/loops (leak/DoS) → Anchor: creation loop, infinite loop, unbounded queue. Fix: bounded pools/sem, joins/cancellation, backpressure.

Defaults:
- Direct & prod-reachable: evidence_strength=4 (5 if crystal-clear), confidence=0.8–0.9.
- Guarded or uncertain: evidence_strength≤2, confidence≤0.5.

Tests (≤2 lines examples):
- eval/exec: malicious string is rejected.
- SQL: "' OR 1=1 --" does not alter results (params used).
- TLS: MITM with untrusted CA fails (verify=True).
- Path traversal: "../../etc/passwd" rejected; path resolved inside base.`,

  java: `Auto-Critical Overrides — deterministic and absolute
Policy:
- Directly observed + prod-reachable => severity_proposed="critical", evidence_strength=4–5, confidence≥0.8.
- Dev/test-only or unreachable in prod => suggestion, evidence_strength≤2, confidence≤0.5, prefix patch with "// approximate" if anchoring uncertain.
- Always anchor ≤12-line snippet with risky sink and tainted input when possible. Use post-patch line numbers; if only diff hunk known, lower evidence/confidence.

Auto-critical items:
- SQL injection via string concatenation in Statement/native queries. Fix: PreparedStatement/ORM parameters.
- Command injection via Runtime.exec/ProcessBuilder with untrusted strings. Fix: arg lists, allowlists, no shell.
- Unsafe deserialization of untrusted data (ObjectInputStream, unsafe Jackson settings). Fix: avoid Java serialization; strict schema; ObjectInputFilter.
- Log4j/logback JNDI/expression injection in log statements. Anchor: logger call with user input. Fix: upgrade Log4j 2.17+; disable JNDI lookups.
- XXE in XML parsers without secure processing. Anchor: DocumentBuilder/SAXParser config. Fix: setFeature(DISALLOW_DOCTYPE_DECL, true); secure defaults.
- XSS: unescaped user input in JSP/Thymeleaf/FreeMarker/HTML. Fix: auto-escape/encoders.
- Missing authentication/authorization on sensitive endpoints. Fix: Spring Security guards (RBAC/ABAC).
- CSRF disabled/missing for state-changing endpoints. Fix: enable CSRF tokens.
- Insecure TLS/hostname verification (trust-all). Fix: proper trust store + hostname verification.
- Hardcoded secrets/API keys/credentials in code. Fix: externalize to secrets manager; rotate.
- Path traversal in file I/O without canonicalization/allowlist. Fix: canonicalize + enforce base dir.
- Insecure crypto (MD5/SHA1, AES/ECB, weak RNG). Fix: modern KDF; AES-GCM; secure RNG.
- Template injection by interpreting untrusted expressions. Fix: sandbox/disable expression eval.
- Unbounded thread pools/schedulers causing DoS. Fix: bounded pools, queue limits, backpressure, shutdown.

Evidence defaults:
- Direct & prod-reachable: evidence_strength=5, confidence=0.9 (or 4/0.8).
- Guarded/unclear: evidence_strength=2, confidence=0.5.

Tests (≤2 lines):
- SQLi: "' OR 1=1 --" inert with params.
- Command: untrusted arg not executed.
- XSS: "<script>" inert.
- Auth: unauthorized -> 401/403.
- TLS: MITM with untrusted CA fails.
- Path traversal: "../../etc/passwd" rejected.
`,

  php: `Auto-Critical Overrides — deterministic and absolute
Policy:
- Direct + prod-reachable => severity_proposed="critical", evidence_strength=4–5, confidence≥0.8.
- Dev/test-only or unreachable => suggestion with evidence_strength≤2, confidence≤0.5; prefix patch with "// approximate" if uncertain.
- Always anchor ≤12-line snippet with risky sink and tainted input. Use post-patch line numbers; if only diff hunk, lower evidence/confidence. Deduplicate via "occurrences".

Auto-critical items:
- SQL injection via string interpolation/concatenation (PDO/mysqli). Fix: prepared statements with bound params.
- Command injection (exec/shell_exec/passthru/backticks) using untrusted input. Fix: avoid shell; allowlists; native APIs.
- XSS: unescaped user data echoed into HTML/JS. Fix: htmlspecialchars/Twig auto-escape.
- File inclusion (RFI/LFI) from user input. Fix: strict allowlists; no dynamic includes.
- Path traversal in file I/O. Fix: realpath/canonicalize + base dir allowlist.
- Insecure deserialization via unserialize on untrusted input. Fix: avoid; use JSON + schema.
- Type confusion via unfiltered user input to sensitive functions (array_merge, extract, $$variable). Anchor: call site with user data. Fix: strict input validation; avoid variable variables.
- PHP object injection via phar:// wrapper with user-controlled paths. Anchor: file operation with phar://. Fix: disable phar in stream wrappers; validate file paths.
- CSRF missing on state-changing routes. Fix: CSRF tokens/middleware.
- Weak password hashing/crypto (md5/sha1, mcrypt ECB). Fix: password_hash (Bcrypt/Argon2), libsodium.
- Hardcoded secrets/API keys/credentials in code. Fix: env/secret manager; rotate keys.
- Open redirects using unvalidated user-controlled URLs. Fix: allowlist domains/paths.
- TLS verification disabled in cURL. Fix: enable verify; pin CA/certs if needed.
- Session fixation/misconfig (no regenerate on login; insecure cookie flags). Fix: regenerate ID; secure/httponly cookies.
- Unbounded processes/loops causing DoS. Fix: resource/time bounds, backpressure.

Evidence defaults:
- Direct & prod-reachable: evidence_strength=5, confidence=0.9 (or 4/0.8).
- Guarded/unclear: evidence_strength=2, confidence=0.5.

Tests (≤2 lines):
- SQLi: "' OR 1=1 --" inert with prepared statements.
- Command: untrusted input not executed.
- XSS: "<script>" inert in output.
- CSRF: missing token -> 403/validation error.
- TLS: cURL with untrusted CA fails when verification on.
- Path traversal: "../../etc/passwd" rejected.
`,

  swift: `Auto-Critical Overrides — deterministic and absolute
Policy:
- Crash/deadlock-causing issues or UI freezes observed in production paths => severity_proposed="critical", evidence_strength=4–5, confidence ≥0.8.
- Dev/test-only (#if DEBUG) or unreachable => downgrade to "suggestion" with evidence_strength ≤2, confidence ≤0.5. Prefix fix_code_patch with "// approximate" if anchoring is uncertain.
- Always anchor ≤12-line snippet including the risky call; use post-patch line numbers. Deduplicate occurrences array when the same pattern repeats.

Auto-critical items:
- Force unwrap (!) / try! / as! on data sourced from external or untrusted inputs (network payloads, dictionary lookup, URL init) without preceding validation. Safe invariants such as IBOutlets or test-only fixtures are exempt. Fix: guard let / if let / try? with graceful error handling.
- fatalError / preconditionFailure / assertionFailure in shipping execution paths without #if DEBUG guards. Fix: convert to thrown errors, logging, or debug-only assertions.
- Blocking synchronous I/O or networking on the main actor (Data(contentsOf:), FileManager contentsOfDirectory, JSONDecoder.decode on large payloads) executed during UI work. Fix: move to async/await or background queues with completion on MainActor.
- DispatchQueue.main.sync (or Task { @MainActor in … } invoking sync) from code that may already be on the main queue, risking deadlock. Fix: remove sync or guard against mainThread.
- Task.detached / background queue mutating @State/@Published/@MainActor state without hopping back to main, leading to runtime crashes. Fix: use Task { @MainActor in … } or DispatchQueue.main.async for UI-bound mutations.

Evidence defaults:
- Direct crash path observed: evidence_strength=5, confidence=0.9.
- Potential but unproven crash: evidence_strength=3, confidence=0.6 (downgrade severity if mitigation likely).

Tests (≤2 lines examples):
- Optional unwrap: guard payload["id"] != nil prevents crash.
- fatalError: production build handles invalid state gracefully without terminating.
- Main thread: instrumentation shows no blocking I/O on main actor.
- Concurrency: background task does not mutate UI state without MainActor hop.
`,

  qa_web: QA_CRITICAL_OVERRIDES.qa_web,
  qa_android: QA_CRITICAL_OVERRIDES.qa_android,
  qa_backend: QA_CRITICAL_OVERRIDES.qa_backend
};

module.exports = LANGUAGE_CRITICAL_OVERRIDES;
