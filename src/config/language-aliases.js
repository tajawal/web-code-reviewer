/**
 * Language alias configuration to map alternative identifiers to base analyzers
 */

const LANGUAGE_ALIASES = {
  qa_web: 'js',
  qa_android: 'java',
  qa_backend: 'java'
};

function normalizeLanguage(language, defaultLanguage = 'js') {
  if (!language) {
    return defaultLanguage;
  }

  const normalized = language.toLowerCase();
  return LANGUAGE_ALIASES[normalized] || normalized;
}

module.exports = {
  LANGUAGE_ALIASES,
  normalizeLanguage
};
