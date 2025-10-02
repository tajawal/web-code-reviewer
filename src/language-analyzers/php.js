function getImports(fileContent) {
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

function getExports(fileContent) {
  return extractDeclarations(fileContent).slice(0, 6);
}

function getDefinitions(fileContent) {
  return extractDeclarations(fileContent).slice(0, 8);
}

function extractDeclarations(fileContent) {
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
