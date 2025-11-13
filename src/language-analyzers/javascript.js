/**
 * JavaScript/TypeScript AST-based analyzer
 * Uses @babel/parser for robust code analysis
 */

const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

/**
 * Parse code with Babel, handling both JS and TS
 */
function parseCode(fileContent) {
  try {
    return parser.parse(fileContent, {
      sourceType: 'unambiguous', // Auto-detect module vs script
      plugins: [
        'typescript',
        'jsx',
        'decorators-legacy',
        'classProperties',
        'optionalChaining',
        'nullishCoalescingOperator',
        'dynamicImport'
      ],
      errorRecovery: true // Continue parsing even with errors
    });
  } catch {
    // If AST parsing fails, return null and fall back to regex
    return null;
  }
}

/**
 * Extract import statements using AST
 */
function getImports(fileContent) {
  const ast = parseCode(fileContent);
  if (!ast) {
    // Fallback to regex if parsing fails
    return getImportsRegex(fileContent);
  }

  const relationships = [];

  traverse(ast, {
    // ES6 imports: import X from 'module'
    ImportDeclaration(path) {
      const source = path.node.source.value;
      const specifiers = path.node.specifiers.map(spec => {
        if (spec.type === 'ImportDefaultSpecifier') {
          return spec.local.name;
        } else if (spec.type === 'ImportNamespaceSpecifier') {
          return `* as ${spec.local.name}`;
        } else if (spec.type === 'ImportSpecifier') {
          return spec.imported.name !== spec.local.name
            ? `${spec.imported.name} as ${spec.local.name}`
            : spec.imported.name;
        }
        return spec.local.name;
      });

      if (specifiers.length > 0) {
        relationships.push(`Import: ${source} (${specifiers.join(', ')})`);
      } else {
        relationships.push(`Import: ${source}`);
      }
    },

    // CommonJS requires: const X = require('module')
    CallExpression(path) {
      if (
        path.node.callee.type === 'Identifier' &&
        path.node.callee.name === 'require' &&
        path.node.arguments.length > 0 &&
        path.node.arguments[0].type === 'StringLiteral'
      ) {
        const module = path.node.arguments[0].value;
        relationships.push(`Require: ${module}`);
      }

      // Dynamic imports: import('module')
      if (path.node.callee.type === 'Import' && path.node.arguments[0]) {
        const arg = path.node.arguments[0];
        if (arg.type === 'StringLiteral') {
          relationships.push(`Dynamic Import: ${arg.value}`);
        }
      }
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

    if (trimmed.match(/^import\s+.*\s+from\s+['"]([^'"]+)['"]/)) {
      const match = trimmed.match(/^import\s+.*\s+from\s+['"]([^'"]+)['"]/);
      if (match) {
        relationships.push(`Import: ${match[1]}`);
      }
    } else if (trimmed.match(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/)) {
      const match = trimmed.match(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/);
      if (match) {
        relationships.push(`Require: ${match[1]}`);
      }
    } else if (trimmed.match(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/)) {
      const match = trimmed.match(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/);
      if (match) {
        relationships.push(`Dynamic Import: ${match[1]}`);
      }
    }
  }

  return relationships.slice(0, 8);
}

/**
 * Extract export statements using AST
 */
function getExports(fileContent) {
  const ast = parseCode(fileContent);
  if (!ast) {
    // Fallback to regex if parsing fails
    return getExportsRegex(fileContent);
  }

  const relationships = [];

  traverse(ast, {
    // export default X
    ExportDefaultDeclaration(path) {
      const declaration = path.node.declaration;
      if (declaration.type === 'Identifier') {
        relationships.push(`Export default: ${declaration.name}`);
      } else if (declaration.type === 'FunctionDeclaration' && declaration.id) {
        relationships.push(`Export default function: ${declaration.id.name}()`);
      } else if (declaration.type === 'ClassDeclaration' && declaration.id) {
        relationships.push(`Export default class: ${declaration.id.name}`);
      } else {
        relationships.push('Export default: (anonymous)');
      }
    },

    // export { X, Y }
    ExportNamedDeclaration(path) {
      if (path.node.declaration) {
        const decl = path.node.declaration;
        if (decl.type === 'FunctionDeclaration') {
          relationships.push(`Export function: ${decl.id.name}()`);
        } else if (decl.type === 'ClassDeclaration') {
          relationships.push(`Export class: ${decl.id.name}`);
        } else if (decl.type === 'VariableDeclaration') {
          decl.declarations.forEach(declarator => {
            relationships.push(`Export: ${declarator.id.name}`);
          });
        }
      } else if (path.node.specifiers.length > 0) {
        const names = path.node.specifiers.map(spec => spec.exported.name);
        relationships.push(`Export: { ${names.join(', ')} }`);
      }
    },

    // module.exports = X
    AssignmentExpression(path) {
      if (
        path.node.left.type === 'MemberExpression' &&
        path.node.left.object.type === 'Identifier' &&
        path.node.left.object.name === 'module' &&
        path.node.left.property.type === 'Identifier' &&
        path.node.left.property.name === 'exports'
      ) {
        relationships.push('Module Export: module.exports');
      }
    }
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

    if (trimmed.match(/^export\s+(default\s+)?(function|class|const|let|var|interface|type)/)) {
      relationships.push(`Export: ${trimmed.substring(0, 60)}...`);
    } else if (trimmed.match(/module\.exports\s*=/)) {
      relationships.push('Module Export: module.exports');
    } else if (trimmed.match(/^export\s*{/)) {
      relationships.push(`Named Export: ${trimmed.substring(0, 60)}...`);
    }
  }

  return relationships.slice(0, 6);
}

/**
 * Extract function and class definitions with AST
 * Also detects code smells like unreachable code, variable shadowing
 */
function getDefinitions(fileContent) {
  const ast = parseCode(fileContent);
  if (!ast) {
    // Fallback to regex if parsing fails
    return getDefinitionsRegex(fileContent);
  }

  const definitions = [];
  const issues = [];

  // Track declared variables to detect shadowing
  const scopeVariables = new Map();

  traverse(ast, {
    // Function declarations
    FunctionDeclaration(path) {
      const func = path.node;
      const name = func.id ? func.id.name : 'anonymous';
      const params = func.params.map(p => getParamName(p)).join(', ');
      const async = func.async ? 'async ' : '';
      const line = func.loc ? func.loc.start.line : '?';

      definitions.push(`${async}function ${name}(${params}) [line ${line}]`);

      // Check for unreachable code after return
      const unreachable = detectUnreachableCode(path);
      if (unreachable) {
        issues.push(unreachable);
      }

      // Also check all nested blocks
      path.traverse({
        BlockStatement(blockPath) {
          const unreachableInBlock = detectUnreachableInBlock(blockPath.node);
          if (unreachableInBlock) {
            issues.push(unreachableInBlock);
          }
        }
      });
    },

    // Arrow functions and function expressions
    VariableDeclarator(path) {
      if (
        path.node.init &&
        (path.node.init.type === 'ArrowFunctionExpression' ||
          path.node.init.type === 'FunctionExpression')
      ) {
        const name = path.node.id.name;
        const func = path.node.init;
        const params = func.params.map(p => getParamName(p)).join(', ');
        const async = func.async ? 'async ' : '';
        const line = func.loc ? func.loc.start.line : '?';

        definitions.push(`${async}const ${name} = (${params}) => ... [line ${line}]`);

        // Check for unreachable code
        if (func.body.type === 'BlockStatement') {
          const unreachable = detectUnreachableInBlock(func.body);
          if (unreachable) {
            issues.push(unreachable);
          }

          // Also check nested blocks
          path.traverse({
            BlockStatement(blockPath) {
              const unreachableInBlock = detectUnreachableInBlock(blockPath.node);
              if (unreachableInBlock) {
                issues.push(unreachableInBlock);
              }
            }
          });
        }
      }
    },

    // Class declarations
    ClassDeclaration(path) {
      const cls = path.node;
      const name = cls.id ? cls.id.name : 'anonymous';
      const superClass = cls.superClass ? ` extends ${cls.superClass.name}` : '';
      const line = cls.loc ? cls.loc.start.line : '?';

      const methods = cls.body.body
        .filter(node => node.type === 'ClassMethod' || node.type === 'ClassProperty')
        .slice(0, 5)
        .map(node => {
          if (node.type === 'ClassMethod') {
            const methodName = node.key.name || node.key.value;
            const kind = node.kind === 'constructor' ? 'constructor' : node.kind;
            const async = node.async ? 'async ' : '';
            return `  ${async}${kind} ${methodName}()`;
          } else {
            return `  ${node.key.name}`;
          }
        });

      const methodsSummary = methods.length > 0 ? '\n' + methods.join('\n') : '';
      definitions.push(`class ${name}${superClass} [line ${line}]${methodsSummary}`);

      // Check for unreachable code in class methods
      path.traverse({
        ClassMethod(methodPath) {
          if (methodPath.node.body) {
            const unreachable = detectUnreachableInBlock(methodPath.node.body);
            if (unreachable) {
              issues.push(unreachable);
            }

            // Check nested blocks in methods
            methodPath.traverse({
              BlockStatement(blockPath) {
                const unreachableInBlock = detectUnreachableInBlock(blockPath.node);
                if (unreachableInBlock) {
                  issues.push(unreachableInBlock);
                }
              }
            });
          }
        }
      });
    },

    // Detect variable shadowing
    VariableDeclaration(path) {
      path.node.declarations.forEach(declarator => {
        if (declarator.id.type === 'Identifier') {
          const varName = declarator.id.name;
          const scopeId = getScopeId(path);

          // Check if variable already exists in parent scope
          for (const [scope, vars] of scopeVariables.entries()) {
            if (scope !== scopeId && vars.has(varName)) {
              const line = declarator.loc ? declarator.loc.start.line : '?';
              issues.push(`⚠️  Variable shadowing: '${varName}' at line ${line}`);
            }
          }

          // Track this variable
          if (!scopeVariables.has(scopeId)) {
            scopeVariables.set(scopeId, new Set());
          }
          scopeVariables.get(scopeId).add(varName);
        }
      });
    }
  });

  // Add issues to definitions if found (deduplicate first)
  if (issues.length > 0) {
    const uniqueIssues = [...new Set(issues)]; // Remove duplicates
    definitions.push('\n🔍 Code Quality Issues Detected:');
    uniqueIssues.forEach(issue => definitions.push(issue));
  }

  return definitions.slice(0, 15); // Increased limit to show issues
}

/**
 * Detect unreachable code after return/throw statements
 */
function detectUnreachableCode(path) {
  if (!path.node.body || path.node.body.type !== 'BlockStatement') {
    return null;
  }

  const statements = path.node.body.body;
  for (let i = 0; i < statements.length - 1; i++) {
    const stmt = statements[i];
    const nextStmt = statements[i + 1];

    // Check if current statement is a terminator
    if (
      stmt.type === 'ReturnStatement' ||
      stmt.type === 'ThrowStatement' ||
      stmt.type === 'BreakStatement' ||
      stmt.type === 'ContinueStatement'
    ) {
      // Skip if next statement is just a closing brace or comment
      if (nextStmt && nextStmt.type !== 'EmptyStatement') {
        const line = nextStmt.loc ? nextStmt.loc.start.line : '?';
        return `⚠️  Unreachable code after ${stmt.type} at line ${line}`;
      }
    }
  }

  return null;
}

/**
 * Detect unreachable code in a block statement
 */
function detectUnreachableInBlock(block) {
  if (!block.body || block.body.length === 0) return null;

  const statements = block.body;
  for (let i = 0; i < statements.length - 1; i++) {
    const stmt = statements[i];
    const nextStmt = statements[i + 1];

    if (
      stmt.type === 'ReturnStatement' ||
      stmt.type === 'ThrowStatement' ||
      stmt.type === 'BreakStatement' ||
      stmt.type === 'ContinueStatement'
    ) {
      if (nextStmt && nextStmt.type !== 'EmptyStatement') {
        const line = nextStmt.loc ? nextStmt.loc.start.line : '?';
        return `⚠️  Unreachable code after ${stmt.type} at line ${line}`;
      }
    }
  }

  return null;
}

/**
 * Get parameter name from different parameter types
 */
function getParamName(param) {
  if (param.type === 'Identifier') {
    return param.name;
  } else if (param.type === 'RestElement') {
    return '...' + getParamName(param.argument);
  } else if (param.type === 'AssignmentPattern') {
    return getParamName(param.left);
  } else if (param.type === 'ObjectPattern') {
    return '{ ... }';
  } else if (param.type === 'ArrayPattern') {
    return '[ ... ]';
  }
  return 'param';
}

/**
 * Get a unique scope identifier for variable tracking
 */
function getScopeId(path) {
  if (!path.node.loc) return 'unknown';
  return `${path.node.loc.start.line}:${path.node.loc.start.column}`;
}

/**
 * Fallback regex-based definition extraction
 */
function getDefinitionsRegex(fileContent) {
  const definitions = [];
  const lines = fileContent.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    if (trimmed.match(/^(export\s+)?(async\s+)?function\s+\w+/)) {
      definitions.push(`Function: ${trimmed.substring(0, 60)}...`);
    } else if (trimmed.match(/^(export\s+)?class\s+\w+/)) {
      definitions.push(`Class: ${trimmed.substring(0, 60)}...`);
    } else if (trimmed.match(/^(export\s+)?(const|let|var)\s+\w+\s*=\s*(async\s+)?\(/)) {
      definitions.push(`Function Expression: ${trimmed.substring(0, 60)}...`);
    }

    if (definitions.length >= 8) break;
  }

  return definitions;
}

module.exports = {
  getImports,
  getExports,
  getDefinitions
};
