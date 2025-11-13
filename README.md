# 🤖 DeepReview - AI-Powered Multi-Language Code Reviewer

A GitHub Action that performs automated code reviews using Large Language Models (Claude or OpenAI) for pull requests. This action analyzes code changes across multiple programming languages and provides detailed feedback on performance, security, maintainability, and best practices with structured JSON output.

## ✨ Features

- **🌍 Multi-Language Support**: Specialized review prompts for JavaScript/TypeScript, Python, Java, PHP, Swift, and QA Automation (Cypress, Appium, RestAssured)
- **🧠 AST-Powered Analysis**: Deep semantic code understanding using Abstract Syntax Trees for JavaScript, Python, PHP, and Java
- **📊 Structured JSON Output**: Detailed analysis with severity scoring, risk factors, and confidence levels
- **🔍 Smart File Filtering**: Language-specific file detection and filtering
- **🤖 LLM Integration**: Supports both Claude Sonnet 4.5 and OpenAI GPT-4o with unified system prompts
- **🎯 Intelligent Merge Decisions**: Automatic merge blocking based on critical issues with confidence scoring
- **📝 Enhanced PR Comments**: Rich, categorized review results with severity indicators
- **⚡ Optimized Processing**: Intelligent chunking and rate limiting for large codebases (sub-second context generation)
- **🔧 Configurable**: Customizable paths, tokens, temperature, and language settings
- **📈 External Logging**: Non-blocking analytics logging to external endpoints for monitoring and insights
- **🏗️ Modular Architecture**: Centralized JSON parsing and reusable components for maintainability
- **✅ World-Class Determinism**: Consistent, repeatable results across multiple review runs

## 🎯 Deterministic Review Guarantee

DeepReview is engineered for **world-class determinism** - identical code produces identical reviews every time. This is achieved through:

### Context & Token Management

- **Fixed Context Size**: Always uses 100KB of context (no variance)
- **Precise Token Estimation**: Conservative 3.5 chars/token + 10% safety buffer
- **Sorted File Processing**: Deterministic ordering of files and dependencies
- **Unified System Prompts**: Identical instructions for Claude and OpenAI

### Review Logic & Scoring

- **Explicit Decision Trees**: Clear, case-by-case logic (no ambiguous rules)
- **Stricter Thresholds**: Evidence strength ≥ 4 required for critical (not ≥ 3)
- **Category-Specific Floors**: Security/Performance/Maintainability each have appropriate bars
- **Average-Based Deduplication**: Stable merging across chunks (prevents flips)

### Quality Assurance

- **Consistency Validation**: Detects and logs violations of severity rules
- **Chunk Agreement Monitoring**: Tracks variance in critical counts across chunks
- **Evidence Alignment Checks**: Ensures evidence strength matches severity proposed

**Result**: 95%+ consistency across multiple review runs with same code.

See [DETERMINISM_IMPROVEMENTS.md](./DETERMINISM_IMPROVEMENTS.md) for technical details.

## 🧠 LLM Context - AST-Powered Intelligence

DeepReview provides comprehensive, **semantically-rich** context to the LLM using Abstract Syntax Tree (AST) analysis:

### Context Components

- **📝 Changed Files**: Full diff content with deletion markers
- **🔍 Semantic Code** (AST-powered):
  - Function/class definitions with **precise line numbers**
  - Method signatures and visibility modifiers
  - Class hierarchies and inheritance patterns
  - Extracted via language-specific parsers (not regex!)
- **📦 Dependencies**: Package.json, composer.json across monorepos
- **🏗️ File Relationships** (AST-powered):
  - Import/export statements and dependencies
  - Module structure and patterns
  - Security-sensitive imports flagged (e.g., `child_process`, `eval`)
- **📄 Imported Files Context** (NEW):
  - AST analysis of imported files (not just changed files)
  - Function signatures and exports from dependencies
  - Understands what imported functions do without opening them
  - Resolves relative imports (./validators, ../models/user)
  - Works across JS/TS, Python, PHP, Java
- **📊 Recent Commits**: Recent commit history for change context

### AST Analysis by Language

| Language | Parser | Capabilities |
|----------|--------|--------------|
| **JavaScript/TypeScript** | `@babel/parser` + `@babel/traverse` | Functions, classes, imports, exports, unreachable code detection |
| **Python** | Native `ast` module (via child_process) | Functions, classes, imports, async patterns, unreachable code |
| **PHP** | `php-parser` | Classes, methods, inheritance, use statements, unreachable code |
| **Java** | `java-ast` (antlr4ts) | Packages, classes, interfaces, methods, visibility, inheritance |
| **Swift** | Regex-based | Basic patterns (AST planned) |

### Why AST Matters

**Before (Regex-only)**:

- ❌ Surface-level pattern matching
- ❌ Limited semantic understanding
- ❌ Approximate line numbers
- ❌ Missed architectural issues

**After (AST-powered)**:

- ✅ Deep semantic analysis
- ✅ Precise line number references
- ✅ Detects architectural patterns (e.g., redundant parsing across files)
- ✅ Identifies security issues by understanding code flow
- ✅ Context-aware recommendations

**Example 1 - Cross-file Analysis**: The LLM can now detect that `getImports()`, `getExports()`, and `getDefinitions()` all call `parseAST()` independently by analyzing the semantic structure - enabling performance optimization suggestions.

**Example 2 - Imported Files Context**:

When you change a file that imports from other modules:

```javascript
// Changed file: user-controller.js
import { validateUser } from './validators';

function createUser(data) {
  validateUser(data); // What does this do? What parameters?
}
```

The LLM automatically receives the AST of `validators.js`:

```text
📄 validators.js (imported, not changed):
  📝 Function: validateUser(data) [line 5]
      - Throws: ValidationError
      - Checks: email, password strength
```

Now the LLM knows exactly what `validateUser()` does, enabling it to:

- Validate correct parameter usage
- Detect missing error handling
- Suggest improvements based on the actual implementation

### Smart Management

- **Context Size**: Typically 4-5KB (compact yet powerful)
- **Performance**: Sub-second generation (313ms average)
- **Relevance Filtering**: Focuses on most important patterns
- **Deterministic Ordering**: Files and imports sorted for consistency
- **Token Optimization**: Precise estimation prevents overflow
- **Graceful Fallback**: Falls back to regex if AST parsing fails

## 🚀 Quick Start

### Required Environment Variables

⚠️ **Important**: The following environment variables are **mandatory** for the action to work:

- **`GITHUB_TOKEN`**: Automatically provided by GitHub Actions (no setup required)
- **`CLAUDE_API_KEY`** or **`OPENAI_API_KEY`**: Your LLM provider API key

### Basic Usage

```yaml
name: DeepReview

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      
      - name: DeepReview
        uses: tajawal/web-code-reviewer@latest
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}  # Required: GitHub token for API access
        with:
          claude_api_key: ${{ secrets.CLAUDE_API_KEY }}
          language: 'js'  # JavaScript/TypeScript
          path_to_files: 'src/'
          team: 'frontend-team'  # Required: Your team name
          department: 'web'      # Optional: Department name (defaults to 'web')
```

### Multi-Language Examples

```yaml
# JavaScript/TypeScript Review
- name: Review JavaScript Code
  uses: tajawal/web-code-reviewer@latest
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}  # Required: GitHub token for API access
  with:
    language: 'js'
    claude_api_key: ${{ secrets.CLAUDE_API_KEY }}
    path_to_files: 'src/,components/'
    team: 'frontend-team'
    department: 'web'

# Python Review
- name: Review Python Code
  uses: tajawal/web-code-reviewer@latest
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}  # Required: GitHub token for API access
  with:
    language: 'python'
    claude_api_key: ${{ secrets.CLAUDE_API_KEY }}
    path_to_files: 'backend/,api/'
    team: 'backend-team'
    department: 'engineering'

# Java Review
- name: Review Java Code
  uses: tajawal/web-code-reviewer@latest
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}  # Required: GitHub token for API access
  with:
    language: 'java'
    claude_api_key: ${{ secrets.CLAUDE_API_KEY }}
    path_to_files: 'src/main/java/'
    team: 'mobile-team'
    department: 'mobile'

# PHP Review
- name: Review PHP Code
  uses: tajawal/web-code-reviewer@latest
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}  # Required: GitHub token for API access
  with:
    language: 'php'
    claude_api_key: ${{ secrets.CLAUDE_API_KEY }}
    path_to_files: 'app/,resources/'
    team: 'fullstack-team'
    department: 'web'

# Swift Review
- name: Review Swift Code
  uses: tajawal/web-code-reviewer@latest
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}  # Required: GitHub token for API access
  with:
    language: 'swift'
    claude_api_key: ${{ secrets.CLAUDE_API_KEY }}
    path_to_files: 'Sources/,App/'
    team: 'ios-team'
    department: 'mobile'

# QA Web - Cypress Test Review
- name: Review Cypress Tests
  uses: tajawal/web-code-reviewer@latest
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}  # Required: GitHub token for API access
  with:
    language: 'qa_web'
    claude_api_key: ${{ secrets.CLAUDE_API_KEY }}
    path_to_files: 'cypress/,src/test/,test/'
    ignore_patterns: '.json,.md,.lock'  # Allow .spec.js, .test.js, .cy.js
    team: 'qa-web'
    department: 'quality-assurance'

# QA Android - Appium Test Review  
- name: Review Appium Tests
  uses: tajawal/web-code-reviewer@latest
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}  # Required: GitHub token for API access
  with:
    language: 'qa_android'
    claude_api_key: ${{ secrets.CLAUDE_API_KEY }}
    path_to_files: 'src/test/,app/src/test/'
    ignore_patterns: '.json,.md,.lock'  # Allow Test.java files
    team: 'qa-android'
    department: 'quality-assurance'

# QA Backend - API Test Review
- name: Review API Tests
  uses: tajawal/web-code-reviewer@latest
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}  # Required: GitHub token for API access
  with:
    language: 'qa_backend'
    claude_api_key: ${{ secrets.CLAUDE_API_KEY }}
    path_to_files: 'src/test/,api-tests/'
    ignore_patterns: '.json,.md,.lock'  # Allow Test.java files
    team: 'qa-backend'
    department: 'quality-assurance'
```

### Advanced Configuration

```yaml
name: DeepReview

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      
      - name: DeepReview
        uses: tajawal/web-code-reviewer@latest
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}  # Required: GitHub token for API access
        with:
          llm_provider: 'claude'  # 'claude' for Claude Sonnet 4.5 or 'openai' for GPT-4o
          language: 'js'          # js, python, java, php, swift, qa_web, qa_android, qa_backend
          claude_api_key: ${{ secrets.CLAUDE_API_KEY }}
          # openai_api_key: ${{ secrets.OPENAI_API_KEY }}  # if using OpenAI GPT-4o
          path_to_files: 'packages/,src/'
          base_branch: 'develop'
          max_tokens: '8000'      # Recommended: 8000+ for comprehensive reviews
          temperature: '0'        # MUST be 0 for deterministic, consistent reviews
          team: 'development-team'  # Required: Your team name
          department: 'engineering' # Optional: Department name
          ignore_patterns: '.json,.md,.lock,.test.js,.spec.js,.min.js'  # Optional: Custom ignore patterns
```

## 📋 Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `llm_provider` | LLM provider to use (`claude` or `openai`) | No | `claude` |
| `language` | Programming language for code review (`js`, `python`, `java`, `php`, `swift`, `qa_web`, `qa_android`, `qa_backend`) | No | `js` |
| `path_to_files` | Comma-separated paths to files to review (e.g., `packages/`, `src/`, `components/`) | No | `packages/` |
| `base_branch` | Base branch to compare against (auto-detected from PR if not specified) | No | `develop` |
| `max_tokens` | Maximum tokens for LLM response (recommended: 8000+ for comprehensive reviews) | No | `8000` |
| `temperature` | Temperature for LLM response (0.0-1.0, must be 0 for deterministic reviews) | No | `0` |
| `department` | Department name for logging purposes | No | `web` |
| `team` | Team name for logging purposes | **Yes** | - |
| `ignore_patterns` | Comma-separated file suffixes to ignore during review (e.g., `.json,.md,.test.ts`) | No | `.json,.md,.lock,.test.js,.spec.js,.mock.ts,.mock.js,.test.ts` |
| `openai_api_key` | OpenAI API key (required if provider is `openai`) | No | - |
| `claude_api_key` | Claude API key (required if provider is `claude`) | No | - |

## 🌍 Supported Languages

### JavaScript/TypeScript (`js`)

- **File Extensions**: `.js`, `.jsx`, `.ts`, `.tsx`, `.mjs`
- **AST Parser**: `@babel/parser` + `@babel/traverse`
- **AST Capabilities**:
  - Function and class extraction with line numbers
  - Import/export analysis
  - Unreachable code detection (after return/throw)
  - Method signature analysis
- **Focus Areas**:
  - React hooks and component patterns (unstable deps, heavy render, missing cleanup)
  - TypeScript type safety (any/unknown leakage, unsafe narrowing)
  - Frontend performance and accessibility
  - Event handler debounce/throttle with deterministic CASE-based logic
  - Web security (XSS, CSRF, innerHTML injection, token storage)
  - Modern JavaScript best practices
- **Determinism**: Decision trees for debounce scenarios prevent false critical classifications
- **Evidence Requirements**: Evidence strength ≥ 4 and confidence ≥ 0.7 required for critical

### Python (`python`)

- **File Extensions**: `.py`, `.pyw`, `.pyx`, `.pyi`
- **AST Parser**: Native Python `ast` module (via Node.js child_process)
- **AST Capabilities**:
  - Function/class definitions with parameters and line numbers
  - Async function detection
  - Import analysis (import/from statements)
  - Unreachable code detection (after return/raise/break/continue)
  - Method extraction from classes
- **Focus Areas**:
  - SQL injection prevention (critical: direct taint in f-strings)
  - Command injection vulnerabilities (subprocess with shell=True)
  - Unsafe deserialization (pickle.load, yaml.load)
  - Performance optimization
  - PEP 8 compliance
- **Evidence Requirements**: Evidence strength ≥ 4 required for critical (direct observation needed)
- **Security First**: Category-specific thresholds ensure false positives are minimized

### Java (`java`)

- **File Extensions**: `.java`
- **AST Parser**: `java-ast` (ANTLR4-based, CommonJS-compatible)
- **AST Capabilities**:
  - Package and import declarations (including static imports)
  - Class and interface definitions with line numbers
  - Method extraction with visibility modifiers (public/private/protected)
  - Class inheritance and extension detection
  - Static method detection
- **Focus Areas**:
  - SQL injection (PreparedStatement vs string concatenation)
  - SOLID principles
  - Enterprise security patterns
  - Memory management and resource leaks
  - Exception handling and logging
  - N+1 query prevention
- **Evidence Requirements**: Evidence strength ≥ 4 required for critical
- **Determinism**: Explicit rules for SQL injection and resource management patterns

### PHP (`php`)

- **File Extensions**: `.php`
- **AST Parser**: `php-parser` (pure JavaScript PHP parser)
- **AST Capabilities**:
  - Class definitions with inheritance (extends)
  - Method extraction with visibility and static detection
  - Function definitions with line numbers
  - Use statement analysis (imports)
  - Include/require detection
  - Unreachable code detection (after return/throw)
- **Focus Areas**:
  - Web security vulnerabilities (SQL injection, XSS, file inclusion)
  - Database security (prepared statements)
  - Input validation and sanitization
  - Performance optimization
  - Modern PHP practices (7.4+)
- **Evidence Requirements**: Evidence strength ≥ 4 required for critical
- **Category-Specific**: Security issues held to highest standard

### Swift / SwiftUI (`swift`)

- **File Extensions**: `.swift`
- **Frameworks**: SwiftUI, UIKit, Combine
- **Focus Areas**:
  - Concurrency correctness (async/await, actors, GCD, Combine cancellation)
  - SwiftUI state management (`@State`, `@Binding`, `@ObservedObject`, `@StateObject`)
  - Performance on the main thread and rendering efficiency
  - Crash prevention (risky force unwraps/`try!` while respecting safe invariants like IBOutlets)
  - UIKit lifecycle and memory management (main-thread UI updates, retain cycles, calling super in overrides)
  - Architecture and testability of ViewModels/services
- **Evidence Requirements**: Evidence strength ≥ 4 required for critical (crash guarantee needed)
- **Determinism**: Force unwrap violations are crystal-clear evidence

### QA Web Automation (`qa_web`)

- **File Extensions**: `.js`, `.spec.js`, `.test.js`, `.cy.js`, `.feature`
- **Framework**: Cypress for web automation
- **Focus Areas**:
  - Test reliability and stability (deterministic vs non-deterministic logic)
  - Cypress best practices and patterns
  - Locator strategy optimization
  - Wait strategy improvements and cy.session() usage
  - Test organization and maintainability
  - Page Object and Component Class architecture
  - CI/CD pipeline compatibility
- **Determinism**: Detects non-deterministic conditional logic that always passes (A/B variant issues)
- **Evidence Requirements**: Architectural violations flagged as critical (auto-critical items)

### QA Android Automation (`qa_android`)

- **File Extensions**: `.java`, `Test.java`, `Spec.java`
- **Framework**: Appium + Java for Android native app automation
- **Focus Areas**:
  - Mobile test reliability patterns
  - Appium best practices
  - Device compatibility handling
  - Screen Object pattern adherence
  - Resource management optimization
  - Test isolation and cleanup
  - Android-specific automation patterns
- **Evidence Requirements**: Architecture violations held to critical standard
- **Determinism**: Clear structural rules prevent false positives

### QA Backend Automation (`qa_backend`)

- **File Extensions**: `.java`, `Test.java`, `ApiTest.java`
- **Framework**: RestAssured + Java for API automation
- **Focus Areas**:
  - API testing best practices
  - Response validation patterns
  - Test data management and generation
  - Error scenario coverage
  - Performance and timeout considerations
  - Environment configuration handling
  - RestAssured API caller pattern adherence
- **Evidence Requirements**: Production endpoint usage is critical (strict check)
- **Determinism**: Explicit rules for hardcoded values vs constants

## ➕ Adding a New Language

Extending DeepReview to a new language involves 6 key steps. This guide uses **Rust** as an example.

### Step 1: Add Language Configuration

Edit `src/config/languages.js`:

```javascript
const LANGUAGE_FILE_CONFIGS = {
  // ... existing languages ...
  rust: {
    extensions: ['.rs', '.rlib'],
    patterns: ['*.rs', '*.rlib'],
    name: 'Rust'
  }
};

const LANGUAGE_ROLE_CONFIGS = {
  // ... existing languages ...
  rust: {
    role: 'Rust systems engineer',
    language: 'Rust',
    testExample: ' (e.g., cargo test --lib)',
    fileExample: 'src/main.rs or src/lib.rs'
  }
};

// Optional: Add dependency manifest locations
const LANGUAGE_DEPENDENCY_CONFIGS = {
  // ... existing languages ...
  rust: [
    {
      file: 'Cargo.toml',
      parser: 'toml'  // or use a custom parser
    }
  ]
};
```

### Step 2: Create Language Analyzer

Create `src/language-analyzers/rust.js`:

```javascript
/**
 * Rust language analyzer for semantic code context
 */

module.exports = {
  // Extract use/mod statements (imports)
  getImports: (content) => {
    const imports = [];
    const lines = content.split('\n');

    lines.forEach((line) => {
      if (line.match(/^\s*use\s+/)) {
        imports.push(line.trim());
      }
    });

    return imports.slice(0, 10);  // Limit to 10
  },

  // Extract pub fn, pub struct, pub enum (exports)
  getExports: (content) => {
    const exports = [];
    const lines = content.split('\n');

    lines.forEach((line) => {
      if (line.match(/^\s*pub\s+(fn|struct|enum|trait|const)/)) {
        exports.push(line.trim().substring(0, 80));  // Limit length
      }
    });

    return exports.slice(0, 10);  // Limit to 10
  },

  // Extract function/struct definitions (key code patterns)
  getDefinitions: (content) => {
    const defs = [];
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      if (line.match(/^\s*(pub\s+)?(unsafe\s+)?(fn|struct|enum|impl|trait)\s+\w+/)) {
        defs.push(line.trim().substring(0, 100));
      }
    });

    return defs.slice(0, 5);  // Limit to 5 key definitions
  }
};
```

### Step 3: Register Analyzer

Edit `src/language-analyzers/index.js`:

```javascript
const rustAnalyzer = require('./rust');

const LANGUAGE_ANALYZERS = {
  // ... existing languages ...
  rust: rustAnalyzer
};

const LANGUAGE_ALIASES = {
  // ... existing aliases ...
  rs: 'rust'  // Allow 'rs' as shorthand
};

module.exports = {
  getLanguageAnalyzer,
  LANGUAGE_ANALYZERS,
  LANGUAGE_ALIASES
};
```

### Step 4: Add Review Prompts - Critical Overrides

Edit `src/prompts/critical-overrides.js`:

```javascript
const LANGUAGE_CRITICAL_OVERRIDES = {
  // ... existing languages ...
  rust: `Auto-critical Overrides (regardless of score)
- Unsafe blocks with untrusted input: unsafe { ... } on user-controlled data
- Unchecked unwrap() or expect() on Result from external input
- Raw pointer dereferencing without bounds checking
- FFI calls without proper validation
- Panic conditions that could be triggered by user input
- Memory leaks through Rc/Arc reference cycles
- Hardcoded API keys, secrets, or credentials in code
- Unbounded loops or recursion without safety checks`
};
```

### Step 5: Add Language-Specific Checks

Edit `src/prompts/language-checks.js`:

```javascript
const LANGUAGE_SPECIFIC_CHECKS = {
  // ... existing languages ...
  rust: `Rust-specific checks (only if visible in diff)
- Memory Safety: Ownership patterns, unnecessary cloning, move semantics
- Error Handling: Prefer Result<T,E> over panic!, propagate errors properly
- Performance: Expensive operations in hot paths, excessive allocations, O(n²) work
- Concurrency: Send/Sync bounds correct, no data races, proper synchronization
- Unsafe Code: Minimize unsafe blocks, document safety invariants, validate assumptions
- Testing: Comprehensive test coverage, especially for unsafe code and edge cases
- Resource Management: File handles, network connections properly closed, RAII patterns`
};
```

### Step 6: Update Language Export

Edit `src/constants.js`:

```javascript
const { buildLanguagePrompt } = require('./prompts/builder');

const LANGUAGE_PROMPTS = {
  // ... existing languages ...
  rust: buildLanguagePrompt('rust')  // Add this line
};
```

### Step 7: Add Language-Specific Rubrics (Optional but Recommended)

Edit `src/prompts/language-rubrics.js`:

```javascript
const LANGUAGE_RUBRICS = {
  // ... existing languages ...
  rust: {
    unsafe_unwrap: {
      description: 'unwrap() or expect() on Result from external input',
      scoring_levels: {
        network_unwrap: {
          description: 'unwrap() on network/file I/O result',
          impact: 5,
          exploitability: 3,
          likelihood: 4,
          evidence_strength: 5,
          confidence: 0.95,
          reasoning: 'Will crash on invalid input'
        }
      }
    }
  }
};
```

### Step 8: Test Your Language

```bash
# Run lint to ensure code quality
npm run lint

# Test with a sample Rust file
# Create test/fixtures/sample.rs with some code

# Run the action on a test PR with language: 'rust'
```

### Complete Integration Checklist

- [ ] Added language to `LANGUAGE_FILE_CONFIGS`
- [ ] Added language to `LANGUAGE_ROLE_CONFIGS`
- [ ] (Optional) Added language to `LANGUAGE_DEPENDENCY_CONFIGS`
- [ ] Created language analyzer in `src/language-analyzers/{lang}.js`
- [ ] Exported analyzer functions: `getImports`, `getExports`, `getDefinitions`
- [ ] Registered analyzer in `src/language-analyzers/index.js`
- [ ] Added critical overrides in `src/prompts/critical-overrides.js`
- [ ] Added language-specific checks in `src/prompts/language-checks.js`
- [ ] Added to `LANGUAGE_PROMPTS` export in `src/constants.js`
- [ ] (Optional) Added language rubrics in `src/prompts/language-rubrics.js`
- [ ] Added language alias (optional) in `LANGUAGE_ALIASES`
- [ ] Tested with sample files and verified output
- [ ] All lint checks pass (`npm run lint`)

### Key Design Principles

1. **Evidence Strength**: Set thresholds appropriate for your language
   - Security: Evidence ≥ 4 required for critical
   - Performance: Evidence ≥ 4 required for critical
   - Maintainability/Best Practices: Higher bar (≥ 4)

2. **Determinism**: Be explicit about what constitutes a violation
   - Use decision trees (not fuzzy rules)
   - Provide clear examples in rubrics
   - Document assumptions

3. **Context Generation**: Focus analyzer on what's relevant
   - Limit to top 10 imports, 10 exports, 5 definitions
   - Extract patterns the LLM needs for context
   - Keep response focused and concise

4. **Auto-Critical Items**: Only mark genuine security issues
   - Direct injection vulnerabilities
   - Crash/panic conditions
   - Memory safety violations
   - Authentication/authorization gaps

### Testing Your New Language

Create a workflow file to test:

```yaml
name: Test New Language

on: pull_request

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: DeepReview - Rust
        uses: tajawal/web-code-reviewer@latest
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          language: 'rust'
          claude_api_key: ${{ secrets.CLAUDE_API_KEY }}
          path_to_files: 'src/'
          team: 'rust-team'
```

### Documentation

After adding your language, please:

1. Update this README with language-specific focus areas
2. Add it to the "Supported Languages" section above
3. Document any special configuration needed
4. Provide examples of what the reviewer checks for

The pipeline will automatically pick up your new language through configuration and analyzer registration.

## 🧹 Ignore Patterns

- The defaults in `src/config/core.js` now exclude `.json`, `.md`, `.lock`, `.test.js`, `.spec.js`, `.mock.ts`, `.mock.js`, and `.test.ts` by suffix. Only files that end with those exact strings are skipped.
- Supplying `ignore_patterns` in the workflow overrides the defaults entirely, so include every suffix you want ignored (e.g. `.test.ts,.mock.ts,.spec.ts`).
- Patterns are interpreted as suffixes (`file.endsWith(pattern)`). For glob-style matching (e.g. directories or wildcards) you’ll need to expand the logic in `FileService`.

## 📊 Enhanced Review Output

The action now provides structured JSON analysis with detailed metrics:

### Severity Scoring System
Each issue is scored across 5 dimensions:
- **Impact** (0-5): How severe the issue is
- **Exploitability** (0-5): How easy it is to exploit
- **Likelihood** (0-5): How likely the issue is to occur
- **Blast Radius** (0-5): How many systems/users are affected
- **Evidence Strength** (0-5): How strong the evidence is

**Final Severity Score**: Weighted calculation using the formula:
```
severity_score = 0.35*impact + 0.30*exploitability + 0.20*likelihood + 0.10*blast_radius + 0.05*evidence_strength
```

### Issue Categories
- **🔒 Security**: Vulnerabilities, injection attacks, authentication issues
- **⚡ Performance**: Bottlenecks, memory leaks, inefficient algorithms
- **🛠️ Maintainability**: Code complexity, readability, architectural issues
- **📚 Best Practices**: Standards violations, anti-patterns, code smells

### Confidence Scoring
- **High Confidence** (≥0.8): Strong evidence, clear recommendations
- **Medium Confidence** (0.6-0.8): Good evidence, reasonable recommendations
- **Low Confidence** (<0.6): Limited evidence, suggestions for manual review

### Data Structure

The action now provides a comprehensive data structure for each review:

```javascript
{
  issues: [
    {
      id: "SEC-01",
      category: "security",
      severity_proposed: "critical",
      severity_score: 4.2,
      confidence: 0.85,
      file: "src/components/Login.jsx",
      lines: [45, 52],
      snippet: "vulnerable code...",
      why_it_matters: "SQL injection risk",
      fix_summary: "Use parameterized queries",
      fix_code_patch: "safe code...",
      tests: "Test with malicious input",
      chunk: 1,
      originalId: "SEC-01"
    }
  ],
  summaries: ["Chunk 1: Found 2 security issues"],
  totalCriticalCount: 2,
  totalSuggestionCount: 1,
  chunksProcessed: 1
}
```

This structure enables:
- **Better Analytics**: Comprehensive data for monitoring and insights
- **Improved Logging**: Detailed information for external systems
- **Enhanced Display**: Rich PR comments with categorized issues
- **Debugging Support**: Clear tracking of which chunk produced which issues

## 🎯 Merge Decision Logic

The action automatically determines merge safety based on strict, deterministic criteria:

### Critical Issues Detection

Issues are marked as **CRITICAL** only when ALL of these conditions are met:

- `severity_score ≥ 3.60`
- `evidence_strength ≥ 4` (strong evidence, not just moderate)
- `confidence ≥ 0.7` (high confidence)
- Not in dev-only context
- Not clearly mitigated

**Auto-block**: Merge is blocked if ANY critical issue is found

**Always Suggestion**: If `evidence_strength ≤ 2` OR `confidence ≤ 0.5`, automatically marked as suggestion (not critical), regardless of score

### Decision Factors

1. **JSON Analysis**: Primary decision based on structured LLM output with strict criteria
2. **Category-Specific Thresholds**: Different bars per issue type (security strictest)
3. **Confidence Thresholds**: Requires ≥ 0.7 for critical classifications
4. **Evidence Requirements**: Evidence strength ≥ 4 mandatory for critical
5. **Fallback Text Analysis**: Legacy support for non-JSON responses

### Safety Guarantees

- ✅ **Consistent**: Same code produces same merge decision every time
- ✅ **Evidence-Based**: Only strong evidence escalates to critical
- ✅ **Conservative**: Defaults to suggestion when uncertain
- ✅ **Category-Aware**: Security issues held to highest standard

## 📝 Enhanced PR Comments

### Rich Issue Display
```
🔴 SEC-01 - SECURITY (Chunk 1)
- **File**: `src/components/Login.jsx` (lines 45-52)
- **Severity Score**: 4.2/5.0
- **Confidence**: 85%
- **Risk Factors**: Impact: 4, Exploitability: 5, Likelihood: 3, Blast Radius: 4, Evidence: 4
- **Impact**: SQL injection vulnerability allows unauthorized database access
- **Fix**: Use parameterized queries with proper input validation
```

### Review Details Section
```
**Review Details:**
- **Department**: web
- **Team**: frontend-team
- **Provider**: CLAUDE
- **Files Reviewed**: 5 files
- **Review Date**: 12/19/2024, 2:30:45 PM
- **Base Branch**: develop
- **Head Branch**: feature/new-login
- **Path Filter**: src/,components/
- **Ignored Patterns**: .json, .md, .lock, .test.js, .spec.js
```

### Categorized Summary
- **🚨 Critical Issues**: High-priority security and performance problems
- **💡 Suggestions**: Improvements and best practice recommendations
- **📊 Review Metrics**: Total counts and processing statistics

## 🔧 Configuration

### Base Branch Detection

The action automatically detects the base branch from the pull request context:

- **In PR context**: Uses the PR's base branch automatically
- **Manual override**: You can specify `base_branch` input to override the auto-detection
- **Fallback**: Uses `develop` as default if neither PR context nor input is available

### Logging Parameters

The action includes department and team parameters for enhanced logging and tracking:

- **`team`** (Required): Your team name for identification and tracking
- **`department`** (Optional): Department name, defaults to `web`

These parameters are displayed in:
- Review logs and console output
- PR comments for transparency
- Can be used for analytics and reporting

### External Logging

The action automatically logs review data to an external endpoint for analytics and monitoring:

#### Logged Data Structure
```json
{
  "department": "web",
  "team": "frontend-team",
  "head_branch": "feature/new-login",
  "files_reviewed": 5,
  "issues": [
    {
      "id": "SEC-01",
      "category": "security",
      "severity": "critical",
      "severity_score": 4.2,
      "confidence": 0.85,
      "file": "src/components/Login.jsx",
      "lines": [45, 52],
      "chunk": 1
    }
  ],
  "review_timestamp": "2024-12-19T14:30:45.123Z",
  "repository": "owner/repo",
  "pr_number": 123,
  "merge_blocked": true,
  "language": "js",
  "provider": "claude"
}
```

#### Logging Features
- **Non-blocking**: Logging happens asynchronously and doesn't delay PR comment generation
- **Configurable**: Can be enabled/disabled via configuration
- **Error handling**: Failed logging attempts don't affect the review process
- **Comprehensive data**: Includes all review metadata, issues, and metrics

### Environment Variables

The action requires the following environment variables to function properly:

#### Required Environment Variables

1. **`GITHUB_TOKEN`** (Mandatory)
   - **Purpose**: Used for GitHub API access to read repository data and post PR comments
   - **Setup**: Automatically provided by GitHub Actions (no manual setup required)
   - **Usage**: Must be explicitly set in your workflow as shown in the examples above

2. **`CLAUDE_API_KEY`** or **`OPENAI_API_KEY`** (Mandatory)
   - **Purpose**: Authentication for your chosen LLM provider
   - **Setup**: Must be added to your repository secrets
   - **Usage**: Referenced in the workflow as `${{ secrets.CLAUDE_API_KEY }}`

### API Keys Setup

You'll need to set up API keys for your chosen LLM provider:

#### For Claude (Anthropic):
1. Get your API key from [Anthropic Console](https://console.anthropic.com/)
2. Add it to your repository secrets as `CLAUDE_API_KEY`

#### For OpenAI:
1. Get your API key from [OpenAI Platform](https://platform.openai.com/)
2. Add it to your repository secrets as `OPENAI_API_KEY`

### Repository Secrets Setup

1. Go to your repository settings
2. Navigate to "Secrets and variables" → "Actions"
3. Add your API key:
   - **Name**: `CLAUDE_API_KEY` (for Claude) or `OPENAI_API_KEY` (for OpenAI)
   - **Value**: Your API key

### Environment Variables in Workflow

Make sure to include the required environment variables in your workflow:

```yaml
- name: DeepReview
  uses: tajawal/web-code-reviewer@latest
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}  # Required: GitHub token for API access
  with:
    claude_api_key: ${{ secrets.CLAUDE_API_KEY }}  # Required: Your LLM API key
    team: 'your-team-name'  # Required: Your team name
    # ... other optional parameters
```

## 🔍 Smart File Filtering

The action automatically filters files based on language and path:

### Language-Specific Filtering
- **JavaScript/TypeScript**: Only processes `.js`, `.jsx`, `.ts`, `.tsx`, `.mjs` files
- **Python**: Only processes `.py`, `.pyw`, `.pyx`, `.pyi` files
- **Java**: Only processes `.java` files
- **PHP**: Only processes `.php` files

### Path Filtering
- **Included**: Files in any of the specified paths (default: `packages/`)
- **Multiple Paths**: You can specify multiple comma-separated paths

### Ignore Patterns
- **Default**: The action automatically ignores `.json`, `.md`, `.lock`, `.test.js`, `.spec.js` files
- **Customizable**: You can override default patterns using the `ignore_patterns` parameter
- **Format**: Comma-separated list of file extensions or patterns
- **Examples**:
  ```yaml
  # Use default ignore patterns
  ignore_patterns: '.json,.md,.lock,.test.js,.spec.js'
  
  # Custom ignore patterns
  ignore_patterns: '.json,.md,.lock,.test.js,.spec.js,.min.js,.bundle.js'
  
  # Ignore additional file types
  ignore_patterns: '.json,.md,.lock,.test.js,.spec.js,.log,.tmp,.cache'
  ```

### Path Examples:
```yaml
# Single path
path_to_files: 'src/'

# Multiple paths
path_to_files: 'packages/,src/,components/'

# Language-specific paths
path_to_files: 'src/,main/,java/'  # for Java
path_to_files: 'backend/,api/'   # for Python
path_to_files: 'app/,resources/' # for PHP

### Ignore Patterns Examples:
```yaml
# Ignore build artifacts and generated files
ignore_patterns: '.json,.md,.lock,.test.js,.spec.js,.min.js,.bundle.js,.map'

# Ignore configuration and documentation files
ignore_patterns: '.json,.md,.lock,.test.js,.spec.js,.yml,.yaml,.toml,.ini'

# Ignore temporary and cache files
ignore_patterns: '.json,.md,.lock,.test.js,.spec.js,.log,.tmp,.cache,.swp'

# Minimal ignore (only essential patterns)
ignore_patterns: '.json,.md,.lock'
```

## 🛠️ Development

1. Clone the repository
2. Install dependencies: `npm install`
3. Build the action: `npm run build`

### Local Testing

The action includes a comprehensive local testing setup:

```bash
# Setup environment variables (first time only)
npm run test:setup

# Run all tests
npm test

# Run specific test scenarios
npm run test:single    # Single path test
npm run test:multi     # Multiple paths test
npm run test:openai    # OpenAI provider test
npm run test:custom    # Custom configuration test

# Test with custom parameters
TEST_PATH_TO_FILES="src/,lib/" npm run test:custom
```

See [test/README.md](test/README.md) for detailed testing documentation.

### Manual Testing

```bash
# Install dependencies
npm install

# Build the action
npm run build

# Test locally (requires API keys)
node dist/index.js
```

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📞 Support

For issues and questions:
- Create an issue in this repository
- Check the [GitHub Actions documentation](https://docs.github.com/en/actions)

---

**Note**: This action requires appropriate API keys and may incur costs based on your LLM provider's pricing. The enhanced JSON output and multi-language support provide more detailed and accurate code reviews.
