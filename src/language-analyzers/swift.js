function getImports(fileContent) {
  const relationships = [];
  const lines = fileContent.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const match = trimmed.match(/^import\s+([A-Za-z0-9_.]+)/);
    if (match) {
      relationships.push(`Import: ${match[1]}`);
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
    if (!trimmed) {
      continue;
    }

    let match = trimmed.match(
      /^(?:public|internal|fileprivate|private|open)?\s*(class|struct|enum|protocol|actor)\s+(\w+)/
    );
    if (match) {
      results.push(`Type: ${match[1]} ${match[2]}`);
      continue;
    }

    match = trimmed.match(/^(?:public|internal|fileprivate|private|open)?\s*func\s+(\w+)/);
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
