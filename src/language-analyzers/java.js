function getImports(fileContent) {
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

function getExports(fileContent) {
  return extractTypesAndMethods(fileContent).slice(0, 6);
}

function getDefinitions(fileContent) {
  return extractTypesAndMethods(fileContent).slice(0, 8);
}

function extractTypesAndMethods(fileContent) {
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
