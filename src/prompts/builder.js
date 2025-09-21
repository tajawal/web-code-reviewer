/**
 * Prompt building functions for dynamic prompt generation
 */

const SHARED_PROMPT_COMPONENTS = require('./shared-components');
const LANGUAGE_CRITICAL_OVERRIDES = require('./critical-overrides');
const LANGUAGE_SPECIFIC_CHECKS = require('./language-checks');
const { LANGUAGE_ROLE_CONFIGS } = require('../config/languages');

/**
 * Build complete prompt for a specific language
 */
function buildLanguagePrompt(language) {
  const config = LANGUAGE_ROLE_CONFIGS[language];
  if (!config) {
    throw new Error(`Unsupported language: ${language}`);
  }

  return `${SHARED_PROMPT_COMPONENTS.roleAndGoal(config.language, config.role)}

${SHARED_PROMPT_COMPONENTS.detrminismAndOutputContract}

${SHARED_PROMPT_COMPONENTS.scopeAndExclusions}

${SHARED_PROMPT_COMPONENTS.severityScoring}

${LANGUAGE_CRITICAL_OVERRIDES[language]}

${LANGUAGE_SPECIFIC_CHECKS[language]}

${SHARED_PROMPT_COMPONENTS.evidenceRequirements}

${SHARED_PROMPT_COMPONENTS.confidenceAndEvidenceStrength}

${SHARED_PROMPT_COMPONENTS.finalPolicy}

${SHARED_PROMPT_COMPONENTS.outputFormat(config.testExample, config.fileExample)}

${SHARED_PROMPT_COMPONENTS.context}`;
}

/**
 * Language-specific review prompts (built dynamically)
 */
const LANGUAGE_PROMPTS = {
  js: buildLanguagePrompt('js'),
  python: buildLanguagePrompt('python'),
  java: buildLanguagePrompt('java'),
  php: buildLanguagePrompt('php'),
  swift: buildLanguagePrompt('swift'),
  qa_web: buildLanguagePrompt('qa_web'),
  qa_android: buildLanguagePrompt('qa_android'),
  qa_backend: buildLanguagePrompt('qa_backend')
};

/**
 * Get review prompt for specific language
 */
function getReviewPrompt(language) {
  return LANGUAGE_PROMPTS[language] || LANGUAGE_PROMPTS.js; // Default to JS if language not found
}

console.log(buildLanguagePrompt('qa_backend'));

module.exports = {
  LANGUAGE_PROMPTS,
  getReviewPrompt,
  buildLanguagePrompt
};
