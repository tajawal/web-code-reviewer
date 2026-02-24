/**
 * Context configuration for enhanced LLM prompts
 * FIXED context size for deterministic reviews
 */

const CONTEXT_CONFIG = {
  // FIXED context size for determinism (not dynamic)
  // Using fixed size ensures every review gets consistent context
  // Increased for Sonnet 4.6's 1M token context window
  FIXED_CONTEXT_SIZE: 200 * 1024, // 200KB fixed context - leverages larger context window

  // Legacy dynamic sizing (kept for backward compatibility, but not used)
  MAX_CONTEXT_SIZE: 250 * 1024, // 250KB max context size (fallback) - increased for Sonnet 4.6

  // Full content for direct imports (hybrid approach)
  FULL_CONTENT_FOR_DIRECT_IMPORTS: true, // Include full file content for first-level imports
  MAX_DIRECT_IMPORT_LINES: 2000, // Max lines per imported file
  MAX_DIRECT_IMPORTS: 5, // Max number of direct imports to include full content
  MAX_PROJECT_FILES: 30, // Max files to include in project structure
  MAX_COMMIT_HISTORY: 5, // Reduced from 15 for more focused context
  MAX_IMPORT_LINES: 10, // Reduced from 15 for more focused context

  // Legacy dynamic context sizing (NOT USED - kept for reference)
  CONTEXT_TOKEN_RATIO: 0.35, // DEPRECATED: Use FIXED_CONTEXT_SIZE instead
  MIN_CONTEXT_SIZE: 20 * 1024, // DEPRECATED: Use FIXED_CONTEXT_SIZE instead
  MAX_CONTEXT_SIZE_LARGE: 200 * 1024, // DEPRECATED: Use FIXED_CONTEXT_SIZE instead

  // Cost optimization settings
  ENABLE_COST_OPTIMIZATION: false, // Set to true to enable smart context scaling
  SMALL_CHANGE_THRESHOLD: 10 * 1024, // 10KB - use reduced context for small changes
  LARGE_CHANGE_THRESHOLD: 50 * 1024, // 50KB - use full context for large changes

  // Context features (can be toggled)
  ENABLE_PROJECT_STRUCTURE: true,
  ENABLE_DEPENDENCIES: true,
  ENABLE_COMMIT_HISTORY: true,
  ENABLE_FILE_RELATIONSHIPS: true,

  // File patterns to exclude from context
  EXCLUDE_PATTERNS: [
    'node_modules',
    'dist',
    '.git',
    'coverage',
    '.nyc_output',
    'build',
    'out',
    '.next',
    '.nuxt'
  ],

  // File extensions to include in project structure
  INCLUDE_EXTENSIONS: ['.js', '.ts', '.tsx', '.jsx', '.vue', '.svelte', '.json', '.md'],

  // Context priority (order matters)
  CONTEXT_PRIORITY: ['dependencies', 'project_structure', 'file_relationships', 'commit_history']
};

module.exports = CONTEXT_CONFIG;
