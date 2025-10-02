/**
 * Main constants file - imports from modular configuration files
 * This maintains backward compatibility while providing a clean, organized structure
 */

// Import configuration modules
const CORE_CONFIG = require('./config/core');
const PROCESSING_CONFIG = require('./config/processing');
const LOGGING_CONFIG = require('./config/logging');
const LABEL_CONFIG = require('./config/labels');
const { APPROVAL_PHRASES, BLOCKING_PHRASES, CRITICAL_ISSUES } = require('./config/merge-decision');
const { LANGUAGE_FILE_CONFIGS, LANGUAGE_ROLE_CONFIGS, LANGUAGE_DEPENDENCY_CONFIGS } = require('./config/languages');
const LLM_PROVIDERS = require('./config/llm-providers');

// Import prompt modules
const SHARED_PROMPT_COMPONENTS = require('./prompts/shared-components');
const LANGUAGE_CRITICAL_OVERRIDES = require('./prompts/critical-overrides');
const LANGUAGE_SPECIFIC_CHECKS = require('./prompts/language-checks');
const { LANGUAGE_PROMPTS, getReviewPrompt } = require('./prompts/builder');

// Import utility modules
const { getLanguageForFile } = require('./utils/language-utils');

/**
 * Main configuration object that combines all sections
 * Maintains backward compatibility with existing code
 */
const CONFIG = {
  // Core configuration
  ...CORE_CONFIG,

  // Processing configuration
  ...PROCESSING_CONFIG,

  // Logging configuration
  ...LOGGING_CONFIG,

  // Label configuration
  ...LABEL_CONFIG,

  // Merge decision logic
  APPROVAL_PHRASES,
  BLOCKING_PHRASES,
  CRITICAL_ISSUES,

  // Language configurations
  LANGUAGE_CONFIGS: LANGUAGE_FILE_CONFIGS
};

// Export everything for backward compatibility
module.exports = {
  // Main configuration (backward compatible)
  CONFIG,

  // Individual configuration sections
  CORE_CONFIG,
  PROCESSING_CONFIG,
  LOGGING_CONFIG,
  LABEL_CONFIG,

  // LLM and language configurations
  LLM_PROVIDERS,
  LANGUAGE_FILE_CONFIGS,
  LANGUAGE_ROLE_CONFIGS,
  LANGUAGE_DEPENDENCY_CONFIGS,

  // Prompt components and checks
  SHARED_PROMPT_COMPONENTS,
  LANGUAGE_CRITICAL_OVERRIDES,
  LANGUAGE_SPECIFIC_CHECKS,

  // Generated prompts and functions
  LANGUAGE_PROMPTS,
  getReviewPrompt,
  getLanguageForFile
};
