/**
 * Python AST-based analyzer
 * Uses Python's built-in ast module via child_process for best results
 */

const { execSync } = require('child_process');

/**
 * Parse Python code using Python's ast module
 * Falls back to regex if Python is not available
 */
function parsePythonAST(fileContent) {
  try {
    // Create a Python script that parses and returns AST as JSON
    const pythonScript = `
import ast
import json
import sys

try:
    code = sys.stdin.read()
    tree = ast.parse(code)

    result = {
        'functions': [],
        'classes': [],
        'imports': [],
        'issues': []
    }

    # Track variable names for shadowing detection (simplified)
    scopes = [set()]

    def check_unreachable(node_list):
        """Check for unreachable code after return/raise"""
        for i, node in enumerate(node_list[:-1]):
            if isinstance(node, (ast.Return, ast.Raise, ast.Break, ast.Continue)):
                if i + 1 < len(node_list):
                    next_node = node_list[i + 1]
                    return {
                        'type': 'unreachable',
                        'line': next_node.lineno,
                        'after': type(node).__name__
                    }
        return None

    for node in ast.walk(tree):
        # Extract function definitions
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            params = [arg.arg for arg in node.args.args]
            result['functions'].append({
                'name': node.name,
                'params': params,
                'lineno': node.lineno,
                'is_async': isinstance(node, ast.AsyncFunctionDef)
            })

            # Check for unreachable code in function body
            unreachable = check_unreachable(node.body)
            if unreachable:
                result['issues'].append({
                    'type': 'unreachable',
                    'line': unreachable['line'],
                    'message': f"Unreachable code after {unreachable['after']}"
                })

        # Extract class definitions
        elif isinstance(node, ast.ClassDef):
            methods = []
            for item in node.body:
                if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    methods.append({
                        'name': item.name,
                        'is_async': isinstance(item, ast.AsyncFunctionDef)
                    })

            result['classes'].append({
                'name': node.name,
                'lineno': node.lineno,
                'methods': methods[:5]  # Limit to 5 methods
            })

        # Extract imports
        elif isinstance(node, ast.Import):
            for alias in node.names:
                import_str = alias.name
                if alias.asname:
                    import_str += f" as {alias.asname}"
                result['imports'].append({
                    'type': 'import',
                    'module': alias.name,
                    'name': import_str
                })

        elif isinstance(node, ast.ImportFrom):
            module = node.module or ''
            for alias in node.names:
                import_str = alias.name
                if alias.asname:
                    import_str += f" as {alias.asname}"
                result['imports'].append({
                    'type': 'from',
                    'module': module,
                    'name': import_str
                })

    print(json.dumps(result))

except SyntaxError as e:
    print(json.dumps({'error': 'syntax', 'message': str(e)}))
except Exception as e:
    print(json.dumps({'error': 'unknown', 'message': str(e)}))
`;

    const result = execSync('python3', {
      input: pythonScript + '\n' + fileContent,
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const parsed = JSON.parse(result);
    if (parsed.error) {
      return null; // Fallback to regex
    }

    return parsed;
  } catch {
    // Python not available or parsing failed, fall back to regex
    return null;
  }
}

/**
 * Extract import statements using AST
 */
function getImports(fileContent) {
  const ast = parsePythonAST(fileContent);
  if (!ast || !ast.imports) {
    // Fallback to regex
    return getImportsRegex(fileContent);
  }

  const relationships = [];
  ast.imports.forEach(imp => {
    if (imp.type === 'import') {
      relationships.push(`Import: ${imp.name}`);
    } else if (imp.type === 'from') {
      relationships.push(`From ${imp.module} import ${imp.name}`);
    }
  });

  return relationships.slice(0, 8);
}

/**
 * Fallback regex-based import extraction
 */
function getImportsRegex(fileContent) {
  const relationships = [];
  const lines = fileContent.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    let match = trimmed.match(/^import\s+([\w.]+)(\s+as\s+\w+)?/);
    if (match) {
      relationships.push(`Import: ${match[1]}`);
      continue;
    }

    match = trimmed.match(/^from\s+([\w.]+)\s+import\s+(.+)/);
    if (match) {
      relationships.push(`From ${match[1]} import ${match[2]}`);
    }
  }

  return relationships.slice(0, 8);
}

/**
 * Extract export statements (classes and functions) using AST
 */
function getExports(fileContent) {
  const ast = parsePythonAST(fileContent);
  if (!ast) {
    // Fallback to regex
    return getExportsRegex(fileContent);
  }

  const relationships = [];

  // In Python, "exports" are typically top-level classes and functions
  ast.classes.forEach(cls => {
    relationships.push(`Class: ${cls.name}`);
  });

  ast.functions.forEach(func => {
    relationships.push(`Function: ${func.name}()`);
  });

  return relationships.slice(0, 6);
}

/**
 * Fallback regex-based export extraction
 */
function getExportsRegex(fileContent) {
  const relationships = [];
  const lines = fileContent.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    if (trimmed.match(/^class\s+(\w+)/)) {
      const match = trimmed.match(/^class\s+(\w+)/);
      if (match) {
        relationships.push(`Class: ${match[1]}`);
      }
    } else if (trimmed.match(/^(?:async\s+)?def\s+(\w+)/)) {
      const match = trimmed.match(/^(?:async\s+)?def\s+(\w+)/);
      if (match) {
        relationships.push(`Function: ${match[1]}()`);
      }
    }
  }

  return relationships.slice(0, 6);
}

/**
 * Extract function and class definitions with AST
 * Also detects code smells like unreachable code
 */
function getDefinitions(fileContent) {
  const ast = parsePythonAST(fileContent);
  if (!ast) {
    // Fallback to regex
    return getDefinitionsRegex(fileContent);
  }

  const definitions = [];
  const issues = [];

  // Add function definitions
  ast.functions.forEach(func => {
    const async = func.is_async ? 'async ' : '';
    const params = func.params.join(', ');
    definitions.push(`${async}def ${func.name}(${params}) [line ${func.lineno}]`);
  });

  // Add class definitions
  ast.classes.forEach(cls => {
    const methodsSummary =
      cls.methods.length > 0
        ? '\n' +
          cls.methods
            .map(m => {
              const async = m.is_async ? 'async ' : '';
              return `  ${async}def ${m.name}()`;
            })
            .join('\n')
        : '';

    definitions.push(`class ${cls.name} [line ${cls.lineno}]${methodsSummary}`);
  });

  // Add issues if found
  if (ast.issues && ast.issues.length > 0) {
    issues.push(...ast.issues.map(issue => `⚠️  ${issue.message} at line ${issue.line}`));
  }

  // Add issues to definitions
  if (issues.length > 0) {
    definitions.push('\n🔍 Code Quality Issues Detected:');
    issues.forEach(issue => definitions.push(issue));
  }

  return definitions.slice(0, 15);
}

/**
 * Fallback regex-based definition extraction
 */
function getDefinitionsRegex(fileContent) {
  const definitions = [];
  const lines = fileContent.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    if (trimmed.match(/^(async\s+)?def\s+\w+/)) {
      const body = extractPythonBody(lines, i);
      definitions.push(body ? `Function: ${trimmed}\n${body}` : `Function: ${trimmed}`);
    } else if (trimmed.match(/^class\s+\w+/)) {
      const body = extractPythonBody(lines, i);
      definitions.push(body ? `Class: ${trimmed}\n${body}` : `Class: ${trimmed}`);
    }
  }

  return definitions.slice(0, 8);
}

function extractPythonBody(lines, definitionIndex, maxLines = 6) {
  const baseIndent = getIndentationWidth(lines[definitionIndex]);
  const sample = [];

  for (let i = definitionIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) {
      continue;
    }

    const indent = getIndentationWidth(line);
    if (indent <= baseIndent) {
      break;
    }

    sample.push(line);

    if (sample.length >= maxLines) {
      sample.push('  # ... (truncated)');
      break;
    }
  }

  return sample.join('\n');
}

function getIndentationWidth(line) {
  if (!line) {
    return 0;
  }
  const match = line.match(/^\s*/);
  return match ? match[0].length : 0;
}

module.exports = {
  getImports,
  getExports,
  getDefinitions
};
