function getImports(fileContent) {
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

function getExports(fileContent) {
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

function getDefinitions(fileContent) {
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
