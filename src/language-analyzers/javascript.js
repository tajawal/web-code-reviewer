function getImports(fileContent) {
  const relationships = [];
  const lines = fileContent.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.match(/^import\s+.*\s+from\s+['"]([^'"]+)['"]/)) {
      const match = trimmed.match(/^import\s+.*\s+from\s+['"]([^'"]+)['"]/);
      if (match) {
        relationships.push(`Import: ${match[1]} (${trimmed})`);
      }
    } else if (trimmed.match(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/)) {
      const match = trimmed.match(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/);
      if (match) {
        relationships.push(`Require: ${match[1]} (${trimmed})`);
      }
    } else if (trimmed.match(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/)) {
      const match = trimmed.match(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/);
      if (match) {
        relationships.push(`Dynamic Import: ${match[1]} (${trimmed})`);
      }
    }
  }

  return relationships.slice(0, 8);
}

function getExports(fileContent) {
  const relationships = [];
  const lines = fileContent.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.match(/^export\s+(default\s+)?(function|class|const|let|var|interface|type)/)) {
      relationships.push(`Export: ${trimmed}`);
    } else if (trimmed.match(/module\.exports\s*=/)) {
      relationships.push(`Module Export: ${trimmed}`);
    } else if (trimmed.match(/^export\s*{/)) {
      relationships.push(`Named Export: ${trimmed}`);
    }
  }

  return relationships.slice(0, 6);
}

function getDefinitions(fileContent) {
  const definitions = [];
  const lines = fileContent.split('\n');
  let currentFunction = null;
  let braceCount = 0;
  let functionLines = [];
  let inFunction = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.match(/^(export\s+)?(async\s+)?function\s+\w+/)) {
      if (currentFunction) {
        definitions.push(formatCodeDefinition('Function', currentFunction, functionLines));
      }
      currentFunction = trimmed;
      functionLines = [trimmed];
      inFunction = true;
      braceCount = 0;
    } else if (trimmed.match(/^(export\s+)?class\s+\w+/)) {
      if (currentFunction) {
        definitions.push(formatCodeDefinition('Function', currentFunction, functionLines));
        currentFunction = null;
        inFunction = false;
      }
      const classSample = extractClassSample(lines, i);
      definitions.push(`Class: ${trimmed}\n${classSample}`);
    } else if (trimmed.match(/^(export\s+)?(interface|type)\s+\w+/)) {
      if (currentFunction) {
        definitions.push(formatCodeDefinition('Function', currentFunction, functionLines));
        currentFunction = null;
        inFunction = false;
      }
      const typeSample = extractTypeSample(lines, i);
      definitions.push(`Type: ${trimmed}\n${typeSample}`);
    } else if (trimmed.match(/^(export\s+)?(const|let|var)\s+\w+\s*=\s*(async\s+)?\(/)) {
      if (currentFunction) {
        definitions.push(formatCodeDefinition('Function', currentFunction, functionLines));
        currentFunction = null;
        inFunction = false;
      }
      const arrowFunctionSample = extractArrowFunctionSample(lines, i);
      definitions.push(`Function Expression: ${trimmed}\n${arrowFunctionSample}`);
    } else if (inFunction && currentFunction) {
      functionLines.push(line);

      for (const char of line) {
        if (char === '{') braceCount++;
        if (char === '}') braceCount--;
      }

      if (functionLines.length > 20) {
        functionLines.push('  // ... (truncated for context)');
        definitions.push(formatCodeDefinition('Function', currentFunction, functionLines));
        currentFunction = null;
        inFunction = false;
        functionLines = [];
      } else if (braceCount === 0 && functionLines.length > 1) {
        definitions.push(formatCodeDefinition('Function', currentFunction, functionLines));
        currentFunction = null;
        inFunction = false;
        functionLines = [];
      }
    }
  }

  if (currentFunction && functionLines.length > 0) {
    definitions.push(formatCodeDefinition('Function', currentFunction, functionLines));
  }

  return definitions.slice(0, 8);
}

function formatCodeDefinition(type, signature, lines) {
  const body = lines.slice(1, 6).join('\n');
  const truncated = lines.length > 6 ? '\n  // ... (truncated)' : '';
  return `${type}: ${signature}\n${body}${truncated}`;
}

function extractClassSample(lines, startIndex) {
  const sample = [];
  let braceCount = 0;
  let methodCount = 0;

  for (let i = startIndex; i < lines.length && methodCount < 3; i++) {
    const line = lines[i];
    sample.push(line);

    for (const char of line) {
      if (char === '{') braceCount++;
      if (char === '}') braceCount--;
    }

    if (line.trim().match(/^\w+\s*\([^)]*\)\s*{/) && braceCount > 1) {
      methodCount++;
    }

    if (braceCount === 0 && i > startIndex) break;
  }

  return sample.join('\n');
}

function extractTypeSample(lines, startIndex) {
  const sample = [];
  let braceCount = 0;

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];
    sample.push(line);

    for (const char of line) {
      if (char === '{') braceCount++;
      if (char === '}') braceCount--;
    }

    if (braceCount === 0 && i > startIndex) break;

    if (sample.length > 10) {
      sample.push('  // ... (truncated)');
      break;
    }
  }

  return sample.join('\n');
}

function extractArrowFunctionSample(lines, startIndex) {
  const sample = [];
  let braceCount = 0;
  let parenCount = 0;
  let inParams = false;

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];
    sample.push(line);

    for (const char of line) {
      if (char === '(') {
        parenCount++;
        inParams = true;
      }
      if (char === ')') {
        parenCount--;
        if (parenCount === 0) inParams = false;
      }
      if (!inParams) {
        if (char === '{') braceCount++;
        if (char === '}') braceCount--;
      }
    }

    if (braceCount === 0 && !inParams && i > startIndex) break;

    if (sample.length > 8) {
      sample.push('  // ... (truncated)');
      break;
    }
  }

  return sample.join('\n');
}

module.exports = {
  getImports,
  getExports,
  getDefinitions
};
