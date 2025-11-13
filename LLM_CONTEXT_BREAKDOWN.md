# LLM Context Breakdown - What Gets Sent to the AI

**Test Date**: 2025-11-13
**Files Reviewed**: 4 language analyzers (Java, JavaScript, PHP, Python)
**Context Size**: 4.10 KB
**Estimated Tokens**: ~1,049 tokens (context only, not including the diff)

---

## 📋 Complete Context Structure

The LLM receives context in **5 parts**:

1. **File List** - Which files are being reviewed
2. **Semantic Code** - Key functions/classes with line numbers (AST-extracted)
3. **File Relationships** - Imports and exports
4. **Dependencies** - package.json info
5. **Recent Commits** - Git commit history

---

## 1️⃣ FILE LIST (Simple enumeration)

```
📝 FILES BEING REVIEWED:
  1. src/language-analyzers/java.js
  2. src/language-analyzers/javascript.js
  3. src/language-analyzers/php.js
  4. src/language-analyzers/python.js
```

**Purpose**: Quick overview of what's changing

---

## 2️⃣ SEMANTIC CODE CONTEXT (AST-powered 🚀)

### src/language-analyzers/java.js
```
📝 Key Definitions:
  function getParser() [line 9]
  function parseJavaAST(fileContent) [line 24]
  function traverseJavaAST(ast) [line 41]
  function extractMethodsFromClass(classBody, methods) [line 127]
  function getImports(fileContent) [line 179]
```

### src/language-analyzers/javascript.js
```
📝 Key Definitions:
  function parseCode(fileContent) [line 12]
  function getImports(fileContent) [line 36]
  function getImportsRegex(fileContent) [line 97]
  function getExports(fileContent) [line 128]
  function getExportsRegex(fileContent) [line 191]
```

### src/language-analyzers/php.js
```
📝 Key Definitions:
  function getParser() [line 9]
  function parsePHPAST(fileContent) [line 24]
  function traversePHPAST(ast) [line 52]
  function traverse(node) [line 61]
  function checkUnreachable(statements) [line 132]
```

### src/language-analyzers/python.js
```
📝 Key Definitions:
  function parsePythonAST(fileContent) [line 12]
  function getImports(fileContent) [line 137]
  function getImportsRegex(fileContent) [line 159]
  function getExports(fileContent) [line 187]
  function getExportsRegex(fileContent) [line 211]
```

**Purpose**:
- Shows LLM the **structure** of each file
- Provides **precise line numbers** for referencing issues
- Extracted via **AST parsing** (not regex!)
- Helps LLM understand code organization

**Why This Matters**:
- LLM can reference specific functions in its analysis
- Line numbers enable precise issue reporting
- Shows patterns (e.g., all files have getParser, parse, traverse functions)

---

## 3️⃣ FILE RELATIONSHIPS CONTEXT (Dependency Analysis)

### src/language-analyzers/java.js
```
📥 Imports:
  Require: java-ast
📤 Exports:
  Module Export: module.exports
```

### src/language-analyzers/javascript.js
```
📥 Imports:
  Require: @babel/parser
  Require: @babel/traverse
📤 Exports:
  Module Export: module.exports
```

### src/language-analyzers/php.js
```
📥 Imports:
  Require: php-parser
📤 Exports:
  Module Export: module.exports
```

### src/language-analyzers/python.js
```
📥 Imports:
  Require: child_process  ⚠️ SECURITY FLAG
📤 Exports:
  Module Export: module.exports
```

**Purpose**:
- Shows what libraries each file depends on
- Highlights potential security concerns (like `child_process`)
- Shows module structure

**Why This Matters**:
- LLM identified `child_process` as security risk (execSync vulnerability)
- Shows consistency (all use module.exports)
- Helps LLM understand external dependencies

---

## 4️⃣ DEPENDENCIES CONTEXT (Project Environment)

```
🔤 Language preference: js

📦 package.json
  Name: web-code-reviewer
  Version: 1.14.38
  Project Type: CommonJS

  Dependencies (7):
    - @actions/core: ^1.10.0
    - @actions/github: ^6.0.0
    - @babel/parser: ^7.28.5
    - @babel/traverse: ^7.28.5
    - java-ast: ^0.4.1
    - node-fetch: ^3.3.2
    - php-parser: ^3.2.5

  Dev Dependencies (12):
    - @typescript-eslint/eslint-plugin: ^8.42.0
    - @typescript-eslint/parser: ^8.42.0
    - @vercel/ncc: ^0.38.0
    - dotenv: ^17.2.1
    - eslint: ^9.34.0
    - eslint-config-prettier: ^10.1.8
    - eslint-plugin-prettier: ^5.5.4
    - husky: ^9.1.7
    ... +4 more

📄 package-lock.json (first 40 lines):
{
  "name": "web-code-reviewer",
  "version": "1.14.38",
  "lockfileVersion": 3,
  ...
}
```

**Purpose**:
- Shows project setup and requirements
- Identifies Node.js version requirements
- Lists all available libraries

**Why This Matters**:
- LLM knows what libraries are available
- Can suggest appropriate fixes using existing dependencies
- Understands the runtime environment (Node 18+, CommonJS)

---

## 5️⃣ RECENT COMMITS CONTEXT (Change History)

```
📋 RECENT COMMITS:
feat: implement AST parsing for Python, PHP, and Java
```

**Purpose**:
- Shows the intent of the changes
- Provides context about what's being added

**Why This Matters**:
- LLM understands this is a new feature implementation
- Knows to look for AST-related issues
- Can tailor feedback to feature development

---

## 📊 Context Statistics

| Component            | Size      | Tokens | Purpose                          |
|----------------------|-----------|--------|----------------------------------|
| File List            | ~200 B    | 50     | Quick overview                   |
| Semantic Code        | ~1.2 KB   | 300    | Function/class structure         |
| File Relationships   | ~600 B    | 150    | Import/export dependencies       |
| Dependencies         | ~1.9 KB   | 475    | Project environment              |
| Recent Commits       | ~100 B    | 25     | Change intent                    |
| **TOTAL CONTEXT**    | **4.1 KB**| **1,049** | Background knowledge          |
| **Diff Content**     | ~47 KB    | ~19,568| Actual code changes            |
| **GRAND TOTAL**      | **51 KB** | **20,617** | Everything sent to LLM     |

---

## 🎯 How LLM Uses This Context

### Example 1: Security Issue Detection (SEC-01)

**Context Used**:
```
File Relationships:
  python.js imports: child_process

Semantic Code:
  function parsePythonAST(fileContent) [line 12]

Diff (line 115-120):
  execSync('python3', {
    input: pythonScript + '\n' + fileContent,
    ...
  });
```

**LLM's Reasoning**:
1. Sees `child_process` import → security sensitive
2. Sees `parsePythonAST` function → checks diff for implementation
3. Finds `execSync` with user input → **CRITICAL SECURITY ISSUE**
4. Reports: "Untrusted fileContent passed to execSync" at line 114-119

### Example 2: Architectural Issue Detection (PERF-01)

**Context Used**:
```
Semantic Code (java.js):
  function getImports(fileContent) [line 179]
  function getExports(fileContent) [line 232]
  function getDefinitions(fileContent) [line 261]

All three call: parseJavaAST(fileContent)
```

**LLM's Reasoning**:
1. Sees three separate functions
2. All take `fileContent` parameter
3. Checks diff → all call `parseJavaAST` independently
4. Realizes: **Redundant parsing** - O(n) waste
5. Reports: "Cache AST between calls" (performance optimization)

### Example 3: Contextual Judgment (MAINT-01)

**Context Used**:
```
Semantic Code:
  Multiple functions with fallback patterns

Diff:
  } catch {
    // Graceful fallback to regex
    return null;
  }
```

**LLM's Reasoning**:
1. Sees pattern across all files: AST → fallback to regex
2. Understands this is **intentional design** (graceful degradation)
3. Reports as "suggestion" not "critical"
4. Adjusts severity score down from 2.80 → 2.45
5. Recognizes: "Silent errors but purposeful"

---

## 🚀 Key Takeaways

### What Makes This Context Powerful:

1. **AST-Powered Precision**
   - Exact line numbers for every function
   - Structural understanding (not just text matching)
   - Enables the LLM to trace code flow

2. **Multi-Dimensional View**
   - Structure (semantic code)
   - Dependencies (relationships)
   - Environment (package.json)
   - Intent (commit history)

3. **Compact Yet Comprehensive**
   - Only 4KB context (vs 47KB diff)
   - ~1K tokens (efficient!)
   - But provides crucial background

4. **Enables Smart Analysis**
   - LLM can correlate patterns across files
   - Detect architectural issues (not just local bugs)
   - Apply contextual judgment to severity

---

## 📈 Before vs After (Context Quality)

### Before (Regex-Only)
```
❌ No semantic understanding
❌ No line number precision
❌ No architectural pattern detection
❌ Limited to surface-level issues
```

### After (AST-Powered)
```
✅ Semantic code structure
✅ Precise line number references
✅ Architectural pattern detection
✅ Deep security vulnerability analysis
✅ Contextual severity adjustments
```

---

## 🎓 What This Proves

The test results show the LLM is **not just pattern matching** - it's performing true semantic analysis:

1. **Detected `execSync` vulnerability** → Required understanding of child_process security implications
2. **Identified redundant parsing** → Required tracing function call patterns across codebase
3. **Applied contextual judgment** → Adjusted scores based on design intent (graceful fallbacks)
4. **Provided precise fixes** → Suggested specific mitigations with code patches

This level of analysis is **only possible** with rich AST-powered context!

---

**Full Test Results**: See `TEST_RESULTS_ANALYSIS.md`
