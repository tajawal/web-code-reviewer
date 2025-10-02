const javascriptAnalyzer = require('./javascript');
const pythonAnalyzer = require('./python');
const javaAnalyzer = require('./java');
const phpAnalyzer = require('./php');
const swiftAnalyzer = require('./swift');
const { LANGUAGE_ALIASES, normalizeLanguage } = require('../config/language-aliases');

const ANALYZERS = {
  js: javascriptAnalyzer,
  javascript: javascriptAnalyzer,
  ts: javascriptAnalyzer,
  typescript: javascriptAnalyzer,
  python: pythonAnalyzer,
  java: javaAnalyzer,
  php: phpAnalyzer,
  swift: swiftAnalyzer
};

function getLanguageAnalyzer(language) {
  const normalized = normalizeLanguage(language);
  return ANALYZERS[normalized] || javascriptAnalyzer;
}

module.exports = {
  getLanguageAnalyzer,
  normalizeLanguage,
  LANGUAGE_ALIASES
};
