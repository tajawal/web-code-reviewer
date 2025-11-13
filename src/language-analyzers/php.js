/**
 * PHP AST-based analyzer
 * Uses php-parser for robust code analysis
 */

let parser = null;

// Lazy load php-parser to avoid startup cost
function getParser() {
  if (!parser) {
    try {
      parser = require('php-parser');
    } catch {
      // php-parser not available, will use regex fallback
      return null;
    }
  }
  return parser;
}

/**
 * Parse PHP code using php-parser
 */
function parsePHPAST(fileContent) {
  const parserLib = getParser();
  if (!parserLib) {
    return null;
  }

  try {
    const engine = parserLib.create({
      parser: {
        extractDoc: true,
        php7: true,
        suppressErrors: true
      },
      ast: {
        withPositions: true
      }
    });

    return engine.parseCode(fileContent);
  } catch {
    // Parsing failed, fall back to regex
    return null;
  }
}

/**
 * Traverse AST and extract information
 */
function traversePHPAST(ast) {
  const result = {
    classes: [],
    functions: [],
    uses: [],
    includes: [],
    issues: []
  };

  function traverse(node) {
    if (!node || typeof node !== 'object') return;

    // Extract classes
    if (node.kind === 'class') {
      const methods = [];
      if (node.body) {
        node.body.forEach(item => {
          if (item.kind === 'method') {
            methods.push({
              name: item.name.name || item.name,
              visibility: item.visibility || 'public',
              isStatic: item.isStatic || false
            });
          }
        });
      }

      result.classes.push({
        name: node.name.name || node.name,
        extends: node.extends ? node.extends.name || node.extends : null,
        methods: methods.slice(0, 5),
        line: node.loc ? node.loc.start.line : null
      });
    }

    // Extract functions
    if (node.kind === 'function') {
      result.functions.push({
        name: node.name.name || node.name,
        line: node.loc ? node.loc.start.line : null
      });

      // Check for unreachable code
      if (node.body && node.body.children) {
        const unreachable = checkUnreachable(node.body.children);
        if (unreachable) {
          result.issues.push(unreachable);
        }
      }
    }

    // Extract use statements
    if (node.kind === 'usegroup') {
      node.items.forEach(item => {
        const name = item.name ? (typeof item.name === 'string' ? item.name : item.name.name) : '';
        result.uses.push(name);
      });
    }

    // Extract includes/requires
    if (node.kind === 'include') {
      const target = node.target;
      const type = node.require ? 'require' : 'include';
      result.includes.push({
        type: type + (node.once ? '_once' : ''),
        target: target.value || 'dynamic'
      });
    }

    // Recursively traverse children
    for (const key in node) {
      const value = node[key];
      if (Array.isArray(value)) {
        value.forEach(child => traverse(child));
      } else if (value && typeof value === 'object') {
        traverse(value);
      }
    }
  }

  function checkUnreachable(statements) {
    for (let i = 0; i < statements.length - 1; i++) {
      const stmt = statements[i];
      const nextStmt = statements[i + 1];

      if (
        stmt.kind === 'return' ||
        stmt.kind === 'throw' ||
        stmt.kind === 'break' ||
        stmt.kind === 'continue'
      ) {
        if (nextStmt && nextStmt.kind !== 'noop') {
          return {
            type: 'unreachable',
            line: nextStmt.loc ? nextStmt.loc.start.line : '?',
            after: stmt.kind
          };
        }
      }
    }
    return null;
  }

  traverse(ast);
  return result;
}

/**
 * Extract import statements using AST
 */
function getImports(fileContent) {
  const ast = parsePHPAST(fileContent);
  if (!ast) {
    return getImportsRegex(fileContent);
  }

  const data = traversePHPAST(ast);
  const relationships = [];

  data.uses.forEach(use => {
    relationships.push(`Use: ${use}`);
  });

  data.includes.forEach(inc => {
    relationships.push(`Include: ${inc.target} (${inc.type})`);
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
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#')) {
      continue;
    }

    let match = trimmed.match(/^use\s+([^;]+);/i);
    if (match) {
      relationships.push(`Use: ${match[1]}`);
      continue;
    }

    match = trimmed.match(
      /^(require|require_once|include|include_once)\s*\(?['"]([^'"]+)['"]\)?\s*;/i
    );
    if (match) {
      relationships.push(`Include: ${match[2]} (${match[1]})`);
    }
  }

  return relationships.slice(0, 8);
}

/**
 * Extract export statements using AST
 */
function getExports(fileContent) {
  const ast = parsePHPAST(fileContent);
  if (!ast) {
    return getExportsRegex(fileContent);
  }

  const data = traversePHPAST(ast);
  const relationships = [];

  data.classes.forEach(cls => {
    relationships.push(`Class: ${cls.name}`);
  });

  data.functions.forEach(func => {
    relationships.push(`Function: ${func.name}()`);
  });

  return relationships.slice(0, 6);
}

/**
 * Fallback regex-based export extraction
 */
function getExportsRegex(fileContent) {
  return extractDeclarationsRegex(fileContent).slice(0, 6);
}

/**
 * Extract definitions using AST
 */
function getDefinitions(fileContent) {
  const ast = parsePHPAST(fileContent);
  if (!ast) {
    return getDefinitionsRegex(fileContent);
  }

  const data = traversePHPAST(ast);
  const definitions = [];

  // Add function definitions
  data.functions.forEach(func => {
    definitions.push(`function ${func.name}() [line ${func.line || '?'}]`);
  });

  // Add class definitions
  data.classes.forEach(cls => {
    const extendsStr = cls.extends ? ` extends ${cls.extends}` : '';
    const methodsSummary =
      cls.methods.length > 0
        ? '\n' +
          cls.methods
            .map(m => {
              const visibility = m.visibility;
              const staticStr = m.isStatic ? 'static ' : '';
              return `  ${visibility} ${staticStr}function ${m.name}()`;
            })
            .join('\n')
        : '';

    definitions.push(`class ${cls.name}${extendsStr} [line ${cls.line || '?'}]${methodsSummary}`);
  });

  // Add issues
  if (data.issues.length > 0) {
    definitions.push('\n🔍 Code Quality Issues Detected:');
    data.issues.forEach(issue => {
      definitions.push(`⚠️  Unreachable code after ${issue.after} at line ${issue.line}`);
    });
  }

  return definitions.slice(0, 15);
}

/**
 * Fallback regex-based definition extraction
 */
function getDefinitionsRegex(fileContent) {
  return extractDeclarationsRegex(fileContent).slice(0, 8);
}

function extractDeclarationsRegex(fileContent) {
  const results = [];
  const lines = fileContent.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#')) {
      continue;
    }

    let match = trimmed.match(/^(?:final\s+|abstract\s+)?class\s+(\w+)/i);
    if (match) {
      results.push(`Class: ${match[1]}`);
      continue;
    }

    match = trimmed.match(/^(?:interface|trait)\s+(\w+)/i);
    if (match) {
      results.push(`Type: ${match[1]}`);
      continue;
    }

    match = trimmed.match(
      /^(?:public|protected|private|static|final|abstract)?\s*function\s+(\w+)/i
    );
    if (match) {
      results.push(`Function: ${match[1]}()`);
    }
  }

  return results;
}

module.exports = {
  getImports,
  getExports,
  getDefinitions
};
