/**
 * Utility functions for language processing and file handling
 */

/**
 * Get language identifier for syntax highlighting based on file extension
 */
function getLanguageForFile(filePath) {
  if (!filePath) return '';

  const extension = filePath.split('.').pop().toLowerCase();
  const languageMap = {
    js: 'javascript',
    jsx: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    py: 'python',
    pyw: 'python',
    pyx: 'python',
    pyi: 'python',
    java: 'java',
    php: 'php',
    swift: 'swift',
    html: 'html',
    css: 'css',
    scss: 'scss',
    less: 'less',
    json: 'json',
    xml: 'xml',
    yaml: 'yaml',
    yml: 'yaml',
    md: 'markdown',
    sql: 'sql',
    sh: 'bash',
    bash: 'bash',
    dockerfile: 'dockerfile',
    docker: 'dockerfile'
  };

  return languageMap[extension] || '';
}

module.exports = {
  getLanguageForFile
};
