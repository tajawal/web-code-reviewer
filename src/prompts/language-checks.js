/**
 * Context Reference Instruction - How to use imported files context
 */
const CONTEXT_REFERENCE_INSTRUCTION = `
📋 **How to Use Imported Files Context**:

When you see a section like:
"""
📄 validators.js (imported, not changed):
  Referenced by: user-controller.js
  📝 Exports/Definitions:
    Function: validateUser(data) [line 5]
"""

Before flagging issues in user-controller.js that call validateUser():
1. Read the function signature from imported context
2. Verify your concern isn't already addressed in the definition
3. Adjust severity accordingly

**Example**:
❌ DON'T: "validateUser() called without error handling → CRITICAL"
✅ DO: Check if validateUser definition shows: function validateUser(data) { try { ... } }
       → If yes: Omit or mark SUGGESTION
       → If no: Mark CRITICAL with confidence
`;

/**
 * Severity Validation Framework - Applied to ALL languages
 * This framework helps prevent false positives by leveraging imported files context
 */
const SEVERITY_VALIDATION_FRAMEWORK = `
${CONTEXT_REFERENCE_INSTRUCTION}

📋 **CRITICAL: Using Imported Files Context to Prevent False Positives**

Before marking any issue as CRITICAL, you MUST verify against the "Imported Files Context (Dependencies)" section provided in the prompt.

**Decision Tree for Severity Assignment**:
1. Check if the imported files context shows the concern is already handled → Mark as SUGGESTION or omit entirely
2. If imported context is ambiguous or incomplete → Mark as MEDIUM (never CRITICAL)
3. Only mark CRITICAL if imported context confirms the issue definitively exists

**What to Check in Imported Files Context**:

1. **Function Signature Issues**:
   - Check imported file "Exports/Definitions" for:
     • Optional parameters (?, default values, nullable types)
     • Overloaded signatures
     • Actual parameter names and types
   - Example: If function shows "validateUser(data, options = {})", the options param is optional → Don't flag missing argument as CRITICAL

2. **Missing Error Handling**:
   - Check imported function definitions for:
     • Internal try-catch blocks
     • Error return types (Result<T, E>, Option<T>, throws declarations)
     • Documented error handling behavior
   - Example: If function definition shows internal try-catch → Don't flag caller as missing error handling

3. **Type/Null Safety**:
   - Check imported definitions for:
     • Return type annotations (string | null, Optional<T>, nullable types)
     • Null-safety patterns (optional chaining, null coalescing)
     • Type guards and narrowing
   - Example: If return type is "string | null" → Don't flag null checks as unnecessary

4. **Validation/Sanitization**:
   - Check imported functions for:
     • Internal validation logic
     • Auto-sanitization (ORM escaping, template auto-escaping)
     • Security library usage
   - Example: If ORM method uses prepared statements → Don't flag SQL injection as CRITICAL

5. **API Contract Violations**:
   - Check imported interfaces/classes/components for:
     • Actual property/method/prop definitions
     • Required vs optional fields
     • Component prop types and destructuring patterns
   - Example: If React component definition shows "({ open, onClose }: Props)" and caller passes extra prop "setVisible" → This is NOT CRITICAL (React ignores extra props silently)

**Common False Positive Patterns to Avoid**:

- **React Props**: Passing extra props that aren't in component signature → SUGGESTION (not CRITICAL), React ignores extra props
- **Optional Parameters**: Not passing optional params shown with ? or default values → Not an issue
- **Internal Validation**: Calling function that internally validates/sanitizes → Don't flag missing validation at call site
- **Null Returns**: Not checking for null when return type shows non-nullable → Only flag if return type is actually nullable
- **Error Handling**: Not wrapping calls in try-catch when imported function handles errors internally → Don't flag as CRITICAL

**Confidence Adjustment**:
- If imported context clearly resolves the concern → confidence = 0.9, severity = suggestion or omit
- If imported context is present but ambiguous → confidence ≤ 0.6, severity ≤ medium
- If no imported context available → confidence ≤ 0.5, be conservative with CRITICAL severity

**Issue Deduplication**:
- Before creating a new issue, check if you already reported the same root cause in a different file
- If the same problem affects multiple files, create ONE issue with multiple occurrences
- Example: Prop removed from interface (FileA) but still used in call (FileB) → ONE issue with TWO occurrences
- Use the "occurrences" array to list all affected locations:
  [{file: "FileA.tsx", lines: [10]}, {file: "FileB.tsx", lines: [20]}]
- Common patterns requiring deduplication:
  • Prop/parameter removed from signature but still passed/used elsewhere
  • Function renamed in definition but old name still used in callers
  • Type changed in interface but incompatible usage in implementations
  • Import path changed but old path still referenced

**Breaking Change Detection (Parameter/Field Removal)**:
When you see parameters, fields, or arguments REMOVED in the diff (lines starting with -), apply this decision tree:

1. **Parameter removed from function call but downstream may still need it**:
   - OLD: \`store.fetch({ phone, captchaToken })\` → NEW: \`store.fetch({})\`
   - Check: Does the downstream function/API still expect \`captchaToken\`?
   - If downstream contract is unchanged or unknown → Flag as CRITICAL: "Parameter 'captchaToken' removed but downstream may still require it"
   - If downstream contract also changed to not need it → No issue

2. **Interface field removed but implementations may still use it**:
   - OLD: \`interface VerifyParams { email: string; token: string; }\` → NEW: \`interface VerifyParams { token: string; }\`
   - Check: Are there callers still passing \`email\`? Are there implementations still expecting \`email\`?
   - If yes → Flag as CRITICAL: "Interface field 'email' removed but still referenced elsewhere"

3. **API request payload field removed**:
   - OLD: \`$http.post(url, { token, captcha })\` → NEW: \`$http.post(url, {})\`
   - Check: Does the API endpoint still require these fields?
   - If API contract is unknown → Flag as SUGGESTION: "Verify API endpoint no longer requires 'token' and 'captcha' fields"
   - If API clearly doesn't need them (e.g., migration docs) → No issue

4. **Header/Auth token removed from API call**:
   - OLD: \`headers: { 'x-captcha-token': captchaToken }\` → NEW: \`headers: {}\`
   - Flag as CRITICAL unless migration explicitly documents the header is no longer needed

5. **Parameter accepted but not forwarded (silently dropped)**:
   - Pattern: Function accepts a parameter but doesn't use it or pass it to the downstream call
   - Example:
     \`\`\`
     // Store accepts captchaToken but doesn't pass it to client
     store.fetch({ phone, captchaToken }) {
       return client.reSendVerifyPhone(); // captchaToken dropped here!
     }

     // Client sends empty request
     reSendVerifyPhone() {
       return $http.post(url, {}); // No headers, no body
     }
     \`\`\`
   - Check: If a function parameter is not used in the function body AND not passed to downstream calls → Flag as CRITICAL
   - Message: "Parameter 'captchaToken' is accepted but not forwarded to downstream API - verify if API requires it"

6. **API request missing required headers after refactor**:
   - OLD: \`$http.post(url, {}, { headers: { 'x-captcha-token': token } })\`
   - NEW: \`$http.post(url, {})\` or \`$http.post(url)\`
   - If the API endpoint historically required a header → Flag as CRITICAL: "Header 'x-captcha-token' removed from API call - verify endpoint no longer requires it"

`;

/**
 * QA Automation specific checks
 */
const QA_SPECIFIC_CHECKS = {
  qa_web: `
${SEVERITY_VALIDATION_FRAMEWORK}

QA Web Automation-Specific Validation Rules:
- **Missing Helper Functions**: Check imported customHelpers files for existing utilities → Don't flag as missing if helper exists.
- **Localized Strings**: Check imported localizedStrings fixtures → Don't flag hardcoded strings if localized version exists.
- **Action Methods**: If imported CC (Custom Commands) file has the action method → Don't flag as missing abstraction.
- **Wait Strategies**: If imported helper uses cy.intercept() or proper wait patterns → Don't flag as improper wait.

Cypress Web Automation Checks (only if visible in diff; do not assume unseen code)

Suggestions (internal qa-frontend-cypress architectural best practices):
- Action/utility methods in spec.js files → Anchor: action methods, utility functions, or reusable logic blocks in spec.js. Fix: consider moving to CC files and importing, keep spec.js for test scenarios only.
- Inline test data instead of using helpers → Anchor: hardcoded test data in spec files when reusable helpers exist. Fix: use customHelpers/[module] functions for data generation when appropriate.
- Not using localizedStrings → Anchor: hardcoded text strings in tests/CC. Fix: import from fixtures/localizedStrings/[module]/.
- Reimplementing existing helper logic → Anchor: duplicated logic that exists in customHelpers. Fix: import and use existing helper functions.
- Not using environment configuration helpers → Anchor: hardcoded environment-specific values. Fix: use posConfiguration or environment helpers.

Suggestions (general cypress/web automation best practices):
- Missing cy.session() for authentication → Anchor: repeated login without session caching. Fix: use cy.session() for authentication flows.
- Long hardcoded waits (≥ 5000ms) → Anchor: cy.wait(number) call where number ≥ 5000. Fix: consider using cy.intercept() or conditional waits with cy.should().
- Excessive test methods (>150 lines) → Anchor: test function exceeding 150 lines with complex logic. Fix: break into smaller, focused test cases or extract helper methods.

Note: Use post-patch line numbers for precise anchoring.`,

  qa_android: `
${SEVERITY_VALIDATION_FRAMEWORK}

QA Android Automation-Specific Validation Rules:
- **Utility Classes**: Check imported utility classes (MobileGesturesUtil, WebDriverWaitUtils) for existing methods → Don't flag as missing if utility exists.
- **Constants**: Check imported CV (Constants) classes for test data → Don't flag hardcoded values if constant exists.
- **Locator Strategy**: If imported screen/page class uses optimal locators → Don't flag suboptimal locators in new code that follows same pattern.

Appium Android Automation Checks (only if visible in diff; do not assume unseen code)

Suggestions (internal qa-android architectural best practices):
- Manual gesture implementation when utility exists → Anchor: custom swipe/scroll code when MobileGesturesUtil is available. Fix: use MobileGesturesUtil.swipeLeftOnElement(), scrollToElement() methods.
- Manual wait implementation when utility exists → Anchor: Thread.sleep() or custom WebDriverWait in screen classes when WebDriverWaitUtils exists. Fix: use WebDriverWaitUtils.waitUntilVisibilityOfElement().
- Hardcoded test data when constants available → Anchor: literal strings when corresponding [Module]CV constants exist in project. Fix: use existing Constants classes for consistent test data.

Suggestions (general appium/android automation best practices):
- Large test methods (>150 lines) → Anchor: test method exceeding 150 lines with complex logic. Fix: break into smaller, focused test cases or extract helper methods.
- Suboptimal locator strategies → Anchor: className or complex XPath locators when accessibility-id or resource-id are available. Fix: prefer accessibility-id for better reliability and maintenance.

Note: Use post-patch line numbers for precise anchoring.`,

  qa_backend: `
${SEVERITY_VALIDATION_FRAMEWORK}

QA Backend Automation-Specific Validation Rules:
- **Activator/Service Pattern**: Check imported activators or services packages → Don't flag direct RestAssured calls if proper abstraction exists.
- **Test Data Patterns**: Check imported TestDataProviders, validDataFaker, or Constants → Don't flag hardcoded data if data generation pattern exists.
- **Database Abstraction**: Check imported connector/repository classes → Don't flag missing abstraction if proper database layer exists.
- **Helper Methods**: If imported helper/utility class has complex scenario logic → Don't flag as missing if proper abstraction exists.

RestAssured API Testing Checks (only if visible in diff; do not assume unseen code)

Suggestions (internal qa-backend architectural best practices):
- Not using Activator/Service pattern → Anchor: direct RestAssured calls in test methods or repeated API logic. Fix: extract to Activator/Service classes in activators or services package.
- Not using existing test data patterns → Anchor: hardcoded test data when project has TestDataProviders, validDataFaker, or Constants available. Fix: use existing data generation patterns (validDataFaker.fillObject(), TestDataProviders, or Constants).
- Missing proper database abstraction → Anchor: direct database queries or connections in tests. Fix: use database connector classes, repositories, or connection utilities.
- Missing helper/utility pattern for complex scenarios → Anchor: complex test logic directly in @Test methods. Fix: extract to helper classes, service classes, or utility methods for better maintainability.

Suggestions (general API automation best practices):
- Long hardcoded waits (5000-9999ms) → Anchor: Thread.sleep() call where 5000 ≤ duration < 10000. Fix: consider using await() with proper retry logic or polling mechanisms, or document if needed for async operations.
- Large test methods (>100 lines) → Anchor: test method exceeding 100 lines. Fix: break into smaller, focused test cases or use helper methods.
- Missing timeout configurations → Anchor: HTTP requests without timeout settings. Fix: add appropriate timeout configurations for network calls.
- Not reusing authentication tokens efficiently → Anchor: repeated authentication calls. Fix: cache and reuse authentication tokens across test sessions.
- Missing proper test data cleanup strategies → Anchor: test data creation without cleanup mechanisms. Fix: implement @AfterEach or @AfterAll cleanup for test data.

Note: Use post-patch line numbers for precise anchoring.`
};

/**
 * Language-specific code review checks
 */

const LANGUAGE_SPECIFIC_CHECKS = {
  js: `
${SEVERITY_VALIDATION_FRAMEWORK}

**Data Flow & Type Tracing (CRITICAL - apply to ALL code)**:
When reviewing code, you MUST trace data flow and verify type compatibility:

1. **Identify data sources and their types**:
   - \`router.query\` / \`useRouter().query\` → \`string | string[] | undefined\` (NEVER just \`string\`)
   - \`context.query\` in getServerSideProps/getStaticProps → same type
   - API responses → check response type, may be \`null\` or have optional fields
   - User input (forms, URL params) → always \`string\`, may be \`undefined\`
   - Environment variables → \`string | undefined\`

2. **Trace where data flows**:
   - From source (router.query, API response, user input)
   - Through intermediate functions (stores, services, utils)
   - To destination (API calls, state updates, rendering)

3. **At each boundary, verify type compatibility**:
   - If source type is \`string | string[] | undefined\` but destination expects \`string\` → CRITICAL type mismatch
   - If data flows through a function that doesn't pass it downstream → CRITICAL (parameter dropped)
   - If API expects a field but caller doesn't send it → CRITICAL

4. **Flag mismatches immediately**:
   - Don't assume type assertions (\`as string\`) are safe without validation
   - Don't assume optional chaining handles arrays (\`value?.length\` doesn't normalize arrays)

JavaScript/TypeScript-Specific Validation Rules:
- **Unused React Props**: If imported component definition shows prop NOT in destructuring pattern or PropTypes → Mark as SUGGESTION (not CRITICAL). React ignores extra props silently - this is NOT a runtime error.
- **Missing PropTypes/Types**: If imported context shows TypeScript interface or JSDoc types → Not an issue.
- **Optional Callback Props**: If imported component signature shows prop with ?: or default value → Don't flag missing as error.
- **Hook Dependencies**: If imported hook definition shows it's stable (useCallback/useMemo) → Don't flag as unstable.
- **Error Handling**: If imported function shows internal try-catch or error boundaries → Don't require caller to wrap in try-catch.

JavaScript/TypeScript Checks (only if visible in diff; do not assume unseen code)
React:
- Unstable hook deps (useEffect/useMemo/useCallback) when deps omit referenced vars or include unstable inline values. Anchor hook + deps. Default: evidence_strength=3, confidence=0.7.
- Heavy work in render (expensive ops in component/JSX). Anchor call chain. Default: 3, 0.7 (cap to 2, 0.5 if data size unknown).
- Missing cleanup in useEffect for subscriptions/timers/sockets. Anchor effect body; Default: 4, 0.8.
- dangerouslySetInnerHTML: user-controlled → auto-critical (security); static → suggestion.
- Index-as-key in dynamic lists. Anchor JSX key; Default: 2, 0.5.
- Un-memoized context values/expensive props passed deep; consider useMemo/useCallback. Default: 2–3, 0.5–0.7.
- Consider React.lazy/Suspense for clearly large modules.

TypeScript:
- any/unknown leakage across module boundaries (exports). Anchor export signature. Default: 3, 0.7.
- Unsafe narrowing/non-null (!) where undefined is possible. Default: 3, 0.7.
- Ambient/global type mutations widening types. Default: 3, 0.6.

Package.json / Dependencies:
- **Canary/pre-release versions before merge**: Versions containing \`-canary\`, \`-alpha\`, \`-beta\`, \`-rc\`, \`-next\`, \`-dev\`, \`-snapshot\`, or \`-experimental\` in package.json (either in "version" field or dependencies). Anchor: version string with pre-release tag. Default: 4, 0.9 → CRITICAL. Fix: Set proper release version (e.g., \`0.0.198\` instead of \`0.0.197-canary-migrate-v4\`) before merging to main/develop.
- **Mismatched dependency versions across workspaces**: In monorepos, different packages depending on different versions of the same internal package. Anchor: version mismatch in multiple package.json files. Default: 3, 0.7.
- **Git/file/link dependencies in production**: Dependencies like \`"package": "git+https://..."\` or \`"file:../local"\` that won't resolve in production. Anchor: non-registry dependency. Default: 4, 0.8 → CRITICAL.
- **Missing peer dependencies**: Package requires peer deps that aren't installed. Default: 2, 0.6 (suggestion).
- **Wildcard versions (\`*\` or \`latest\`)**: Non-deterministic builds. Anchor: \`"*"\` or \`"latest"\` in dependencies. Default: 3, 0.7.

Next.js Type Awareness (CRITICAL - apply to all Next.js code):
Next.js has specific type contracts that differ from plain React. When reviewing Next.js code, apply these type rules:

- **router.query / context.query type**: ALL query values from \`useRouter().query\`, \`router.query\`, or \`context.query\` (in getServerSideProps/getStaticProps) are typed as \`string | string[] | undefined\` - NEVER just \`string\`. When these values are passed to functions/APIs expecting \`string\`, flag as CRITICAL type mismatch. The code must normalize with \`Array.isArray()\` check or type guard before use. Default: 4, 0.8.

- **Dynamic route params hydration**: \`router.query\` params are \`undefined\` on first render before hydration completes. Code must check \`router.isReady\` or handle \`undefined\`. Default: 3, 0.7.

- **getStaticProps serialization**: All data returned is serialized to JSON and exposed to clients. Flag if sensitive data (API keys, internal IDs, secrets) is returned. Default: 4, 0.8.
- **Missing error handling in getServerSideProps/getStaticProps**: Unhandled errors cause 500 pages. Anchor: async data fetching without try-catch. Default: 3, 0.7.
- **Exposing sensitive data in getStaticProps**: Data returned is serialized to HTML/JSON and visible to clients. Anchor: returning API keys, internal IDs, or sensitive fields. Default: 4, 0.8 → CRITICAL if sensitive.
- **Missing revalidate in getStaticProps for dynamic data**: Stale data served indefinitely. Anchor: fetching dynamic data without ISR. Default: 2, 0.6 (suggestion).
- **Client-side data fetching without SWR/React Query in components**: Missing loading/error states, no caching. Anchor: raw fetch/axios in useEffect. Default: 2, 0.5 (suggestion).
- **Using next/link without prefetch={false} for rarely visited pages**: Unnecessary prefetching wastes bandwidth. Default: 2, 0.5 (suggestion only).

Fetch/IO:
- Missing AbortController/timeout on fetch/axios; no cancellation for long-lived calls. Default: 3, 0.7.
- No retry/backoff for critical idempotent calls. Default: 2, 0.5.
- Leaking subscriptions/websockets or unbounded setInterval. Default: 4, 0.8 if no cleanup.
- URL.createObjectURL without revokeObjectURL. Default: 3, 0.7.

Performance:
- N+1 renders/effects (loop-triggered state/effects). Default: impact=2, exploitability=2, likelihood=2, blast_radius=1, evidence_strength=2, confidence=0.5–0.7.
- O(n^2) work in render over props/state. Default: impact=3, exploitability=2, likelihood=2, blast_radius=2, evidence_strength=3, confidence=0.7.
- Large lists without virtualization when clearly large. Default: impact=2, exploitability=2, likelihood=2, blast_radius=1, evidence_strength=2, confidence=0.5.
- Event burst control (debounce/throttle in high-frequency handlers: onChange, scroll, resize, keypress):
  • Mitigation present but effectiveness unknown (definition/cleanup not shown):
    impact=1, exploitability=1, likelihood=1, blast_radius=1, evidence_strength=2, confidence=0.5
    ⇒ severity_proposed="suggestion", cap severity_score ≤ 2.00
  • Mitigation proven ineffective (IneffectiveProof satisfied) with heavy work observed:
    impact=3–4, exploitability=3, likelihood=3, blast_radius=2, evidence_strength=3–4, confidence=0.7–0.8
    ⇒ may be "critical" only if severity_score ≥ 3.60
  • Effective mitigation clearly shown (stable memo/ref and reasonable wait ≥ ~100–200ms for text input; optional .cancel() cleanup):
    impact=0, exploitability=0, likelihood=0, blast_radius=0, evidence_strength=2, confidence=0.5
    ⇒ "suggestion" (e.g., consider .cancel() or adjust wait) or no issue
  • To propose "critical", include a ≤12-line snippet showing BOTH the high-frequency handler path AND at least one IneffectiveProof condition.
  • If IneffectiveProof is not anchored, you MUST NOT propose "critical".

Security (additional):
- User-controlled URLs in navigation APIs without validation. Default: 3, 0.6 (critical only if taint is clear).
- Tokens stored in localStorage/sessionStorage → auto-critical unless strong mitigations. Anchor storage write. Default: 4–5, 0.8.
- URL.createObjectURL used with untrusted blobs without checks. Default: 3, 0.6.

Accessibility:
- Only mark critical if core flows are blocked; otherwise suggestion with evidence_strength ≤ 2.

Note: Use post-patch line numbers. If only diff hunk is known or source is uncertain, set evidence_strength ≤ 2 and confidence ≤ 0.5, and prefix fix_code_patch with "// approximate".
`,

  python: `
${SEVERITY_VALIDATION_FRAMEWORK}

**Data Flow & Type Tracing (CRITICAL - apply to ALL code)**:
When reviewing code, you MUST trace data flow and verify type compatibility:

1. **Identify data sources and their types**:
   - \`request.args.get()\` / \`request.form.get()\` (Flask) → \`str | None\`
   - \`request.GET.get()\` / \`request.POST.get()\` (Django) → \`str | None\`
   - \`request.query_params\` (FastAPI) → depends on type hints, may be \`None\`
   - API responses → check response type, may be \`None\` or have optional fields
   - Environment variables \`os.environ.get()\` → \`str | None\`
   - Database query results → may return \`None\` or empty list

2. **Trace where data flows**:
   - From source (request params, API response, env vars, DB)
   - Through intermediate functions (services, utils, validators)
   - To destination (database queries, API calls, templates)

3. **At each boundary, verify type compatibility**:
   - If source may be \`None\` but destination expects \`str\` → CRITICAL type mismatch
   - If data flows through a function that doesn't pass it downstream → CRITICAL (parameter dropped)
   - If SQL/API expects a field but caller doesn't send it → CRITICAL

4. **Flag mismatches immediately**:
   - Don't assume \`or ""\` default handles all cases
   - Watch for \`Optional[T]\` passed to functions expecting \`T\`

Python-Specific Validation Rules:
- **Missing try-except**: Check imported function for @safe decorator, internal error handling, documented exceptions, or context managers → Don't flag as CRITICAL if handled internally.
- **Type Hints & None**: If imported stub (.pyi) or function signature shows Optional[T] or Union[T, None] → Don't flag None checks as missing.
- **Context Managers**: If imported class has __enter__/__exit__ or is used with contextlib → Don't flag resource cleanup.
- **Validation**: If imported function performs internal validation (raises ValueError, uses pydantic) → Don't require validation at call site.

Python-Specific Checks (apply only if visible in the diff; do not assume unseen code).

Performance:
- Whole-dataset loads: pandas/json/db result sets fully materialized where streaming/chunking is feasible. Default evidence=3, confidence=0.7.
- Blocking I/O in async: requests/file/db sync calls inside async def. Default 4, 0.8.
- Unbounded recursion on large inputs. Default 3, 0.7.
- Global caches without eviction (LRU maxsize=None, custom caches). Default 3, 0.7.

Maintainability:
- Circular imports / tight coupling across changed modules. Default 3, 0.6.
- Monolithic scripts accumulating unrelated concerns. Default 2, 0.5.
- Bare except / broad except without re-raise or logging. Default 3, 0.7.
- Mutable default arguments (def f(x=[], y={})). Default 4, 0.8.

Best practices:
- Missing context managers (with open/socket/lock). Default 4, 0.8 if leaks likely.
- requests without timeout / no retry/backoff for critical idempotent calls. Default 3, 0.7.
- Weak logging / no redaction of secrets/PII. Default 4, 0.8.
- Globals shared in concurrency without locks/async primitives. Default 3, 0.7.

Concurrency & Async:
- Thread/task leaks (no join/cancel), unbounded executors. Default 4, 0.8.
- Blocking calls (time.sleep/CPU loops) inside async def without executor. Default 4, 0.8.
- asyncio.create_task() without exception handling or cancellation cleanup. Default 4, 0.8.

Web (Django/Flask/FastAPI):
- CSRF disabled/missing on state-changing routes → auto-critical.
- debug=True in production paths/config → auto-critical if unguarded.
- Open CORS (*) with credentials → 4, 0.8 (critical if prod).
- Template autoescape disabled → auto-critical.
- Unsanitized input passed to render_template/context → critical if taint is clear.

Note: Use post-patch line numbers. If only diff hunk is known or source is uncertain, set evidence_strength ≤ 2 and confidence ≤ 0.5, and prefix fix_code_patch with "// approximate".
`,

  java: `
${SEVERITY_VALIDATION_FRAMEWORK}

**Data Flow & Type Tracing (CRITICAL - apply to ALL code)**:
When reviewing code, you MUST trace data flow and verify type compatibility:

1. **Identify data sources and their types**:
   - \`@RequestParam\` → \`String\`, may be \`null\` unless \`required=true\`
   - \`@PathVariable\` → \`String\`, typically non-null but verify
   - \`HttpServletRequest.getParameter()\` → \`String | null\`
   - \`@RequestBody\` → deserialized object, fields may be \`null\`
   - Environment variables \`System.getenv()\` → \`String | null\`
   - Database query results → may return \`null\` or \`Optional.empty()\`

2. **Trace where data flows**:
   - From source (controller params, request body, env vars, DB)
   - Through intermediate layers (services, repositories, mappers)
   - To destination (database queries, external APIs, responses)

3. **At each boundary, verify type compatibility**:
   - If source may be \`null\` but destination expects non-null → CRITICAL (NPE risk)
   - If data flows through a method that doesn't pass it downstream → CRITICAL (parameter dropped)
   - If JPA entity field removed but still referenced → CRITICAL

4. **Flag mismatches immediately**:
   - Watch for \`Optional.get()\` without \`isPresent()\` check
   - Watch for missing \`@NotNull\` validation on nullable inputs

Java-Specific Validation Rules:
- **Null Safety**: Check imported method signature for @Nullable/@NonNull/@NotNull annotations → Only flag if annotation confirms nullable.
- **Exception Handling**: If imported method signature declares checked exceptions (throws) → Verify handling; if NOT declared → Don't require try-catch.
- **Resource Management**: If imported class implements AutoCloseable or Closeable → Expect try-with-resources; otherwise don't flag.
- **Validation**: If imported method has Bean Validation annotations (@Valid, @NotNull, @Size) → Don't require additional validation at call site.
- **Optional Returns**: If imported method returns Optional<T> → Don't flag .get() as unsafe if .isPresent() check exists.

Java Language-Specific Checks (apply only if visible in the diff; do not assume unseen code).

Performance:
- N+1 queries / queries in loops. Anchor loop + query. Default 4,0.8.
- Reflection/annotation scanning in hot paths. Anchor: getClass().getMethod()/reflection calls. Default 4,0.8.
- Large object creation in tight loops (StringBuilder, collections). Anchor: new in loop. Default 3,0.7.
- O(n^2) hot paths in request/critical code. Anchor nested loops. Default 3,0.7.
- Blocking I/O without timeouts/retries. Anchor client call. Default 3,0.7.
- Inefficient collections/boxing; String concat in loops. Anchor site. Default 2–3,0.6–0.7.
- Whole-object loads vs streaming. Anchor repo/service call. Default 3,0.6.

Maintainability:
- Bare catch(Exception)/swallow. Anchor try/catch. Default 3,0.7.
- Missing try-with-resources (leaks). Anchor resource acquisition. Default 4,0.8.
- Cyclic deps/god classes. Anchor imports/large class. Default 2,0.5.
- Ignoring InterruptedException. Anchor catch block. Default 3,0.7.
- equals/hashCode contract issues. Anchor methods. Default 3,0.7.

Best practices:
- Missing Bean Validation on DTO/controller params. Anchor annotations/sigs. Default 3,0.7.
- Resource leaks: missing AutoCloseable.close() or try-with-resources. Anchor: resource creation without proper cleanup. Default 4,0.8.
- JPA N+1 from lazy loading without fetch joins/graphs. Anchor: entity access in loop. Default 4,0.8.
- Null handling/Optional misuse. Anchor method sigs. Default 2,0.6.
- Concurrency misuse (unsafe publish, non-threadsafe collections). Anchor shared field + access. Default 4,0.8.
- Streams misuse in hot paths. Anchor pipeline. Default 2–3,0.6–0.7.

Web (Spring/Jakarta):
- Open CORS (* with credentials). Anchor CORS config. Default 3,0.7.
- Missing @Transactional around multi-step DB ops. Anchor service method. Default 3,0.7.
- Exception leakage (no ControllerAdvice). Anchor config. Default 3,0.7.
- HTTP clients without timeouts/backoff. Anchor builder. Default 3,0.7.

Note: Use post-patch line numbers. If only diff hunk is known or source is uncertain, set evidence_strength ≤ 2 and confidence ≤ 0.5, and prefix fix_code_patch with "// approximate".
`,

  php: `
${SEVERITY_VALIDATION_FRAMEWORK}

**Data Flow & Type Tracing (CRITICAL - apply to ALL code)**:
When reviewing code, you MUST trace data flow and verify type compatibility:

1. **Identify data sources and their types**:
   - \`$_GET\`, \`$_POST\`, \`$_REQUEST\` → \`string | array | null\`
   - \`$request->input()\` / \`$request->get()\` (Laravel) → \`mixed\`, may be \`null\`
   - \`$request->query->get()\` (Symfony) → \`string | null\`
   - Environment variables \`getenv()\` / \`$_ENV\` → \`string | false\`
   - Database query results → may return \`null\` or empty array

2. **Trace where data flows**:
   - From source (request params, env vars, DB)
   - Through intermediate functions (services, repositories, validators)
   - To destination (database queries, API calls, templates)

3. **At each boundary, verify type compatibility**:
   - If source may be \`null\` but destination expects \`string\` → CRITICAL type mismatch
   - If data flows through a function that doesn't pass it downstream → CRITICAL (parameter dropped)
   - If SQL expects a field but caller doesn't send it → CRITICAL

4. **Flag mismatches immediately**:
   - Watch for missing null coalescing (\`??\`) on nullable inputs
   - Watch for \`mixed\` type passed to functions expecting specific types

PHP-Specific Validation Rules:
- **SQL Injection**: If imported ORM/query builder method uses prepared statements or parameter binding → Don't flag as CRITICAL.
- **Type Declarations**: If imported function has strict_types=1 and typed parameters/returns → Use those for validation, don't flag missing types.
- **Null Coalescing**: If imported function return type is nullable (?Type or Type|null) → null checks are expected, not missing.
- **Validation**: If imported function uses Laravel Validator, FormRequest, or manual validation → Don't require validation at call site.
- **XSS**: If imported template engine has auto-escaping (Blade {{ }}, Twig {{ }}) → Don't flag as XSS unless using raw output.

PHP Language-Specific Checks

Performance:
- N+1: queries in loops. Anchor loop + query. Default 4,0.8.
- Memory exhaustion from unbounded user input (file uploads, POST data). Anchor: processing without limits. Default 4,0.8.
- Inefficient regex with backtracking (ReDoS). Anchor: preg_* with complex patterns. Default 3,0.7.
- Expensive ops in request path (large arrays, heavy regex, repeated json_encode). Anchor site. Default 3,0.7.
- Unbounded output buffering. Anchor buffering usage. Default 2,0.6.

Maintainability:
- Mixed concerns/monolithic scripts. Anchor sections. Default 2,0.5.
- Broad catch/silent errors; error suppression with "@". Anchor site. Default 3,0.7.
- Global state across modules/superglobals. Anchor usage. Default 3,0.7.
- Missing param/return types in modern PHP. Anchor function sigs. Default 2–3,0.6–0.7.

Best practices:
- Missing declare(strict_types=1) where standard applies. Anchor header. Default 2,0.6.
- Loose comparisons (==) in sensitive contexts. Anchor comparison. Default 3,0.7.
- include/require without checks vs Composer autoload. Anchor include. Default 2,0.5.
- HTTP clients without timeouts/backoff. Anchor options. Default 3,0.7.
- Logging PII/secrets without redaction. Anchor logger. Default 4,0.8.

Web (Laravel/Symfony/Vanilla):
- Missing validation for user input (FormRequest/Validator). Anchor controller. Default 3,0.7.
- Mass assignment via Model::create($request->all()) without $fillable. Anchor model usage. Default 3,0.7.
- display_errors/Debug enabled in prod. Anchor config. Default 3,0.7.
- Session/cookie flags (secure/httponly/samesite) missing. Anchor config. Default 3,0.7.
- File uploads missing validation or stored under webroot. Anchor handler. Default 3,0.7.
- XML external entity (XXE) in XML parsing without libxml_disable_entity_loader(). Anchor: SimpleXML/DOMDocument. Default 4,0.8.
- Server-Side Template Injection (SSTI) in Twig/Smarty with user-controlled templates. Anchor: template rendering. Default 4,0.8.

Modern PHP Security:
- Composer packages with known vulnerabilities (check composer.lock changes). Anchor: new dependencies. Default 3,0.7.
- Missing Content Security Policy headers on HTML responses. Anchor: response headers. Default 3,0.7.

Note: Use post-patch line numbers. If only diff hunk is known or source is uncertain, set evidence_strength ≤ 2 and confidence ≤ 0.5, and prefix fix_code_patch with "// approximate".`,

  swift: `
${SEVERITY_VALIDATION_FRAMEWORK}

**Data Flow & Type Tracing (CRITICAL - apply to ALL code)**:
When reviewing code, you MUST trace data flow and verify type compatibility:

1. **Identify data sources and their types**:
   - URL query parameters → \`String?\`
   - \`URLComponents.queryItems\` → \`[URLQueryItem]?\`, values are \`String?\`
   - API responses (Codable) → fields may be \`Optional\` or have default values
   - \`UserDefaults\` → \`Any?\`, requires casting
   - \`ProcessInfo.processInfo.environment\` → \`[String: String]\`, key may not exist

2. **Trace where data flows**:
   - From source (URL params, API response, UserDefaults, env)
   - Through intermediate layers (ViewModels, Services, Managers)
   - To destination (API calls, CoreData, UI updates)

3. **At each boundary, verify type compatibility**:
   - If source is \`Optional\` but destination expects non-optional → CRITICAL (force unwrap risk)
   - If data flows through a function that doesn't pass it downstream → CRITICAL (parameter dropped)
   - If API expects a field but caller doesn't send it → CRITICAL

4. **Flag mismatches immediately**:
   - Watch for force unwrap (\`!\`) on data from external sources
   - Watch for \`as!\` casting without validation

Swift-Specific Validation Rules:
- **Force Unwraps**: If imported property/method signature shows non-optional type (no ?) → Force unwrap may be safe; if shows optional (?) → Flag force unwrap as risky.
- **Optional Returns**: If imported function returns Optional<T> or T? → Require nil checks or optional chaining; if returns non-optional T → Don't flag.
- **Error Handling**: If imported function signature shows 'throws' → Require try/catch; if doesn't throw → Don't require error handling.
- **MainActor**: If imported class/method has @MainActor annotation → UI updates are safe; otherwise verify dispatch to main.
- **Memory Management**: If imported closure or Task properly uses [weak self] or @MainActor → Don't flag retain cycles.

Swift Checks (only if visible in the diff; do not assume unseen code)

Performance:
- Heavy synchronous work on the main actor (e.g., Data(contentsOf:), JSONDecoder.decode, CoreData fetch) triggered from view/body lifecycle. Anchor call + surrounding context. Default 4,0.8.
- O(n^2) or nested loops over large collections inside UI updates or hot paths. Anchor nested loop. Default 3,0.7.
- Recreating expensive formatters/decoders in SwiftUI body/computed property executed each render. Anchor property/closure. Default 3,0.7.
- Long-running operations in .task/onAppear without cancellation/backpressure. Anchor async block. Default 3,0.7.

Safety & Stability:
- Risky force unwrap (!) / try! / as! on data derived from external or unvalidated sources (API payloads, dictionary lookup, URL init) outside guaranteed invariants (e.g., IBOutlets, test fixtures, private init wiring). Anchor the line and note why the input may be nil. Default 4,0.8.
- fatalError/preconditionFailure/assertionFailure reachable in production flow without #if DEBUG guard. Anchor call. Default 4,0.8.
- Array subscripts or casting without validation when input may change. Anchor subscript/as? usage. Default 3,0.7.

Concurrency:
- UI/state mutations on background queues (DispatchQueue.global/Task.detached) without hopping to MainActor. Anchor mutation and queue. Default 4,0.8.
- Long-lived Task/async sequences capturing self strongly from classes/ObservableObject causing leaks. Anchor Task + capture list. Default 3,0.7.
- Shared mutable state accessed from multiple queues without actors/@MainActor synchronization. Anchor property + access sites. Default 4,0.8.
- Using Task.detached for UI work where Task { @MainActor in … } is required. Anchor Task.detached usage. Default 3,0.7.

SwiftUI Specific:
- Using @State with reference types or passing @State via Binding (should use @StateObject/@ObservedObject). Anchor property wrapper. Default 3,0.7.
- Creating ObservableObject/StateObject in body/computed property (recreated every render). Anchor initialization. Default 3,0.7.
- Using @ObservedObject for view-owned instances that must persist (should be @StateObject). Anchor property. Default 3,0.7.
- ForEach over mutable collections without stable ids (id: .self on non-Hashable or non-unique data). Anchor ForEach declaration. Default 2,0.6.
- Putting heavy synchronous work directly inside View.body/building modifiers without Task/Dispatch. Anchor body section. Default 3,0.7.

UIKit Specific:
- Touching UIKit/AppKit UI from background queues (UIView/UIViewController property mutations) without dispatching to the main queue. Anchor mutation + queue. Default 4,0.8.
- Missing [weak self] (or equivalent) in escaping closures that capture self-owned controllers/managers, risking retain cycles. Anchor closure. Default 3,0.7.
- Not calling super in lifecycle overrides where required (viewDidLoad, viewWillAppear, viewDidDisappear). Anchor override. Default 3,0.7.
- Layout or rendering work inside viewDidLayoutSubviews without guarding repeated execution, causing performance regressions. Anchor logic. Default 3,0.7.
- Performing heavy synchronous work inside UI event handlers without throttling/backpressure (e.g., blocking main thread during scroll). Anchor handler. Default 3,0.7.

Maintainability & Architecture:
- View structs >400 lines or body/closure >200 lines becoming "mega views". Anchor struct/body. Default 2,0.5.
- Functions exceeding ~120 lines or deeply nested control flow. Anchor function signature. Default 2,0.5.
- Mixing networking/persistence directly inside SwiftUI View instead of delegating to ViewModel/service. Anchor offending code. Default 2,0.5 (warn only).
- Singleton/data-store mutations from multiple places without abstraction or dependency injection. Anchor access. Default 2,0.5 (warn).

Testing & Tooling:
- Critical business logic (payments, bookings, pricing, auth) introduced without accompanying XCTest/Combine test scaffolding if the project has tests. Anchor target function(s). Default 2,0.5.
- New concurrency utilities without unit tests covering cancellation/error paths. Anchor utility. Default 2,0.5.

Style & Naming:
- Non-conventional Swift naming (camelCase for methods/properties, PascalCase for types) in public APIs. Anchor declaration. Default 2,0.5.
- Missing access control on new public types/functions when internal should suffice. Anchor decl. Default 2,0.5.

Note: Use post-patch line numbers. If only diff hunk is known or source is uncertain, set evidence_strength ≤ 2 and confidence ≤ 0.5, and prefix fix_code_patch with "// approximate".
`,

  qa_web: QA_SPECIFIC_CHECKS.qa_web,
  qa_android: QA_SPECIFIC_CHECKS.qa_android,
  qa_backend: QA_SPECIFIC_CHECKS.qa_backend
};

module.exports = LANGUAGE_SPECIFIC_CHECKS;
