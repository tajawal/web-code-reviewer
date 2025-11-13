/**
 * Java AST-based analyzer
 * Uses java-ast for robust code analysis (CommonJS-compatible)
 */

let parser = null;

// Lazy load java-ast to avoid startup cost
function getParser() {
  if (!parser) {
    try {
      parser = require('java-ast');
    } catch {
      // java-ast not available, will use regex fallback
      return null;
    }
  }
  return parser;
}

/**
 * Parse Java code using java-ast
 */
function parseJavaAST(fileContent) {
  const parserLib = getParser();
  if (!parserLib) {
    return null;
  }

  try {
    return parserLib.parse(fileContent);
  } catch {
    // Parsing failed, fall back to regex
    return null;
  }
}

/**
 * Traverse AST and extract information using java-ast visitor pattern
 */
function traverseJavaAST(ast) {
  const result = {
    package: null,
    imports: [],
    classes: [],
    interfaces: []
  };

  if (!ast) {
    return result;
  }

  const { createVisitor } = getParser();

  // Create visitor to extract information
  const visitor = createVisitor({
    // Extract package declaration
    visitPackageDeclaration(ctx) {
      if (ctx.qualifiedName && ctx.qualifiedName()) {
        result.package = ctx.qualifiedName().text;
      }
      return this.visitChildren(ctx);
    },

    // Extract import declarations
    visitImportDeclaration(ctx) {
      if (ctx.qualifiedName && ctx.qualifiedName()) {
        const importPath = ctx.qualifiedName().text;
        const isStatic = ctx.STATIC && ctx.STATIC() ? true : false;
        result.imports.push({
          path: importPath,
          isStatic: isStatic
        });
      }
      return this.visitChildren(ctx);
    },

    // Extract class declarations
    visitClassDeclaration(ctx) {
      const className = ctx.identifier && ctx.identifier() ? ctx.identifier().text : 'Anonymous';

      let extendsClass = null;
      if (ctx.EXTENDS && ctx.EXTENDS() && ctx.typeType && ctx.typeType()) {
        extendsClass = ctx.typeType().text;
      }

      const methods = [];

      // Extract methods from class body
      if (ctx.classBody && ctx.classBody()) {
        const classBody = ctx.classBody();
        extractMethodsFromClass(classBody, methods);
      }

      result.classes.push({
        name: className,
        extends: extendsClass,
        methods: methods.slice(0, 5),
        line: ctx.start ? ctx.start.line : null
      });

      return this.visitChildren(ctx);
    },

    // Extract interface declarations
    visitInterfaceDeclaration(ctx) {
      const interfaceName =
        ctx.identifier && ctx.identifier() ? ctx.identifier().text : 'Anonymous';

      result.interfaces.push({
        name: interfaceName,
        line: ctx.start ? ctx.start.line : null
      });

      return this.visitChildren(ctx);
    }
  });

  visitor.visit(ast);

  return result;
}

/**
 * Extract methods from a class body
 */
function extractMethodsFromClass(classBody, methods) {
  if (!classBody.classBodyDeclaration) {
    return;
  }

  const declarations = classBody.classBodyDeclaration();
  if (!Array.isArray(declarations)) {
    return;
  }

  declarations.forEach(decl => {
    if (!decl.memberDeclaration || !decl.memberDeclaration()) {
      return;
    }

    const memberDecl = decl.memberDeclaration();
    if (!memberDecl.methodDeclaration || !memberDecl.methodDeclaration()) {
      return;
    }

    const methodDecl = memberDecl.methodDeclaration();
    const methodName =
      methodDecl.identifier && methodDecl.identifier() ? methodDecl.identifier().text : 'unknown';

    // Determine visibility from modifiers
    let visibility = 'package';
    let isStatic = false;

    if (decl.modifier) {
      const modifiers = decl.modifier();
      if (Array.isArray(modifiers)) {
        modifiers.forEach(modifier => {
          const modText = modifier.text ? modifier.text.toLowerCase() : '';
          if (modText === 'public') visibility = 'public';
          else if (modText === 'private') visibility = 'private';
          else if (modText === 'protected') visibility = 'protected';
          if (modText === 'static') isStatic = true;
        });
      }
    }

    methods.push({
      name: methodName,
      visibility: visibility,
      isStatic: isStatic
    });
  });
}

/**
 * Extract import statements using AST
 */
function getImports(fileContent) {
  const ast = parseJavaAST(fileContent);
  if (!ast) {
    return getImportsRegex(fileContent);
  }

  const data = traverseJavaAST(ast);
  const relationships = [];

  if (data.package) {
    relationships.push(`Package: ${data.package}`);
  }

  data.imports.forEach(imp => {
    const staticStr = imp.isStatic ? ' (static)' : '';
    relationships.push(`Import: ${imp.path}${staticStr}`);
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
    if (!trimmed) {
      continue;
    }

    const packageMatch = trimmed.match(/^package\s+([\w.]+);/);
    if (packageMatch) {
      relationships.push(`Package: ${packageMatch[1]}`);
      continue;
    }

    const importMatch = trimmed.match(/^import\s+([\w.*]+);/);
    if (importMatch) {
      relationships.push(`Import: ${importMatch[1]}`);
    }
  }

  return relationships.slice(0, 8);
}

/**
 * Extract export statements using AST
 */
function getExports(fileContent) {
  const ast = parseJavaAST(fileContent);
  if (!ast) {
    return getExportsRegex(fileContent);
  }

  const data = traverseJavaAST(ast);
  const relationships = [];

  data.classes.forEach(cls => {
    relationships.push(`Class: ${cls.name}`);
  });

  data.interfaces.forEach(iface => {
    relationships.push(`Interface: ${iface.name}`);
  });

  return relationships.slice(0, 6);
}

/**
 * Fallback regex-based export extraction
 */
function getExportsRegex(fileContent) {
  return extractTypesAndMethodsRegex(fileContent).slice(0, 6);
}

/**
 * Extract definitions using AST
 */
function getDefinitions(fileContent) {
  const ast = parseJavaAST(fileContent);
  if (!ast) {
    return getDefinitionsRegex(fileContent);
  }

  const data = traverseJavaAST(ast);
  const definitions = [];

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
              return `  ${visibility} ${staticStr}${m.name}()`;
            })
            .join('\n')
        : '';

    definitions.push(`class ${cls.name}${extendsStr} [line ${cls.line || '?'}]${methodsSummary}`);
  });

  // Add interface definitions
  data.interfaces.forEach(iface => {
    definitions.push(`interface ${iface.name} [line ${iface.line || '?'}]`);
  });

  return definitions.slice(0, 15);
}

/**
 * Fallback regex-based definition extraction
 */
function getDefinitionsRegex(fileContent) {
  return extractTypesAndMethodsRegex(fileContent).slice(0, 8);
}

function extractTypesAndMethodsRegex(fileContent) {
  const results = [];
  const lines = fileContent.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    let match = trimmed.match(
      /^(?:public|protected|private)?\s*(?:abstract\s+|final\s+)?(class|interface|enum|record)\s+(\w+)/
    );
    if (match) {
      results.push(`Type: ${match[1]} ${match[2]}`);
      continue;
    }

    match = trimmed.match(
      /^(?:public|protected|private|static|final|abstract|synchronized|default)\s+[\w<>[\]]+\s+(\w+)\s*\([^;]*\)/
    );
    if (match) {
      results.push(`Method: ${match[1]}(...)`);
    }
  }

  return results;
}

module.exports = {
  getImports,
  getExports,
  getDefinitions
};
