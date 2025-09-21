/**
 * QA Automation specific checks
 */
const QA_SPECIFIC_CHECKS = {
  qa_web: `Cypress Web Automation Checks (only if visible in diff; do not assume unseen code)

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

  qa_android: `Appium Android Automation Checks (only if visible in diff; do not assume unseen code)

Suggestions (internal qa-android architectural best practices):
- Manual gesture implementation when utility exists → Anchor: custom swipe/scroll code when MobileGesturesUtil is available. Fix: use MobileGesturesUtil.swipeLeftOnElement(), scrollToElement() methods.
- Manual wait implementation when utility exists → Anchor: Thread.sleep() or custom WebDriverWait in screen classes when WebDriverWaitUtils exists. Fix: use WebDriverWaitUtils.waitUntilVisibilityOfElement().
- Hardcoded test data when constants available → Anchor: literal strings when corresponding [Module]CV constants exist in project. Fix: use existing Constants classes for consistent test data.

Suggestions (general appium/android automation best practices):
- Large test methods (>150 lines) → Anchor: test method exceeding 150 lines with complex logic. Fix: break into smaller, focused test cases or extract helper methods.
- Suboptimal locator strategies → Anchor: className or complex XPath locators when accessibility-id or resource-id are available. Fix: prefer accessibility-id for better reliability and maintenance.

Note: Use post-patch line numbers for precise anchoring.`,

  qa_backend: `RestAssured API Testing Checks (only if visible in diff; do not assume unseen code)

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

  python: `Python-Specific Checks (apply only if visible in the diff; do not assume unseen code). 

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

  java: `Java Language-Specific Checks (apply only if visible in the diff; do not assume unseen code). 
  
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

  php: `PHP Language-Specific Checks

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

  swift: `Swift Checks (only if visible in the diff; do not assume unseen code)

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
