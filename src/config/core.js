/**
 * Core configuration constants for the GitHub Actions Code Reviewer
 */

const CORE_CONFIG = {
  // Default values
  DEFAULT_BASE_BRANCH: 'develop',
  DEFAULT_PROVIDER: 'claude',
  DEFAULT_PATH_TO_FILES: 'packages/',
  DEFAULT_LANGUAGE: 'js',

  // LLM settings
  MAX_TOKENS: 8000, // Increased to handle comprehensive code reviews with multiple issues
  TEMPERATURE: 0, // Optimal for consistent analytical responses

  // File filtering
  IGNORE_PATTERNS: [
    '.json',
    '.md',
    '.lock',
    '.test.js',
    '.spec.js',
    '.mock.ts',
    '.mock.js',
    '.test.ts'
  ]
};

module.exports = CORE_CONFIG;
