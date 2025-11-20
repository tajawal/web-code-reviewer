/**
 * PR labeling configuration
 */

const LABEL_CONFIG = {
  POST_REVIEW_LABEL: 'deep review completed',
  POST_REVIEW_LABEL_COLOR: '0366d6', // GitHub blue color
  POST_REVIEW_LABEL_DESCRIPTION: 'Pull request has been reviewed by AI code reviewer',
  SAFE_TO_MERGE_LABEL: 'safe to merge',
  SAFE_TO_MERGE_LABEL_COLOR: '28a745', // GitHub green color
  SAFE_TO_MERGE_LABEL_DESCRIPTION: 'Code review passed - no critical issues found',
  UNSAFE_TO_MERGE_LABEL: 'unsafe to merge',
  UNSAFE_TO_MERGE_LABEL_COLOR: 'd73a4a', // GitHub red color
  UNSAFE_TO_MERGE_LABEL_DESCRIPTION: 'Code review found critical issues - merge blocked'
};

module.exports = LABEL_CONFIG;
