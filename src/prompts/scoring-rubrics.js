/**
 * Explicit Scoring Rubrics for Deterministic Issue Classification
 * These rubrics define HOW to score each risk factor (0-5)
 */

const SCORING_RUBRICS = {
  // ============================================================================
  // IMPACT RUBRIC (How bad if exploited/triggered)
  // ============================================================================
  impact: {
    0: 'No negative effect',
    1: 'Cosmetic issue or minor inconvenience',
    2: 'Noticeable degradation (slow, broken feature for some users)',
    3: 'Significant impact (feature unusable, data inconsistency)',
    4: 'Major impact (entire feature broken, significant data loss)',
    5: 'Catastrophic (system outage, all users affected, complete data loss)'
  },

  // ============================================================================
  // EXPLOITABILITY RUBRIC (How easy to trigger)
  // ============================================================================
  exploitability: {
    0: 'Impossible to trigger or requires privileged access',
    1: 'Very difficult (requires specific setup, timing, or knowledge)',
    2: 'Difficult (requires multiple steps or uncommon scenario)',
    3: 'Moderate difficulty (requires normal interaction but specific scenario)',
    4: 'Easy (triggered by standard interaction)',
    5: 'Trivial (guaranteed to trigger with any use)'
  },

  // ============================================================================
  // LIKELIHOOD RUBRIC (Probability of occurrence)
  // ============================================================================
  likelihood: {
    0: 'Never occurs',
    1: 'Very rare (only in edge cases)',
    2: 'Rare (only under specific conditions)',
    3: 'Moderate (happens in common scenarios)',
    4: 'High (happens in most scenarios)',
    5: 'Always occurs with normal use'
  },

  // ============================================================================
  // BLAST RADIUS RUBRIC (How many users/systems affected)
  // ============================================================================
  blast_radius: {
    0: 'Only affects developer or isolated test',
    1: 'Single user or very small subset',
    2: 'Small subset of users (< 5%)',
    3: 'Moderate subset of users (5-50%)',
    4: 'Large subset of users (50-95%)',
    5: 'All users or production systems'
  },

  // ============================================================================
  // EVIDENCE STRENGTH RUBRIC (How clearly visible in code)
  // ============================================================================
  evidence_strength: {
    0: 'No code evidence, pure assumption',
    1: 'Weak hint but mostly assumption (cross-file dependency, unclear intent)',
    2: 'Indirect evidence (missing definition, assumes behavior from context)',
    3: 'Moderate evidence (visible in diff but one factor uncertain, depends on unseen code)',
    4: 'Strong evidence (clearly visible in diff, all factors directly observable)',
    5: 'Crystal clear (absolutely certain, no assumptions possible, guaranteed to be issue)'
  },

  // ============================================================================
  // CONFIDENCE RUBRIC (How confident in the assessment)
  // ============================================================================
  confidence: {
    '0.0-0.3': 'Very low (mostly guessing, many assumptions)',
    '0.3-0.5': 'Low (assumptions made, context unclear)',
    '0.5-0.7': 'Moderate (visible in code but not guaranteed issue)',
    '0.7-0.9': 'High (clearly problematic, direct evidence)',
    '0.9-1.0': 'Very high (absolutely certain, no doubt)'
  },

  // ============================================================================
  // EXAMPLES FOR EACH CATEGORY
  // ============================================================================
  examples: {
    security_sql_injection: {
      issue: 'User input directly in SQL query via f-string',
      impact: 5, // Arbitrary database access
      exploitability: 5, // User can control input
      likelihood: 5, // Will happen with any user input
      blast_radius: 5, // All users affected
      evidence_strength: 5, // Direct in code: f"SELECT * WHERE id = {user_id}"
      confidence: 0.95,
      severity_score: 4.85, // Will be critical
      reasoning: 'All factors are maximum, directly observable in diff'
    },

    performance_missing_debounce: {
      issue: 'onChange handler does heavy work without debounce',
      impact: 3, // Multiple renders degrade UX
      exploitability: 4, // User types fast
      likelihood: 3, // Depends on user typing speed
      blast_radius: 2, // Text input users
      evidence_strength: 3, // Handler visible but cost not quantified
      confidence: 0.6,
      severity_score: 3.05, // Will be SUGGESTION
      reasoning: 'Moderate impact but impact not crystal clear'
    },

    maintainability_unused_variable: {
      issue: 'Variable imported but never used',
      impact: 1, // No runtime effect
      exploitability: 0, // Cannot exploit
      likelihood: 0, // Not a bug
      blast_radius: 0, // No users affected
      evidence_strength: 5, // Directly observable
      confidence: 1.0,
      severity_score: 0.85, // Always SUGGESTION
      reasoning: 'Code quality, not a bug'
    }
  }
};

// ============================================================================
// SEVERITY CLASSIFICATION RULES (FINAL DECISION)
// ============================================================================

const SEVERITY_CLASSIFICATION = {
  // New stricter rules for world-class determinism

  critical: {
    // MUST meet ALL of:
    rules: [
      'severity_score >= 3.60',
      'evidence_strength >= 4', // RAISED from 3: must be strong evidence
      'confidence >= 0.7',
      'NOT in dev_only_context',
      'NOT mitigated_by_recognized_pattern'
    ],
    reasoning: 'Only issues with strong evidence, high confidence, and clear impact are critical'
  },

  suggestion: {
    rules: [
      'Everything else',
      'OR evidence_strength <= 2 (regardless of score)',
      'OR confidence <= 0.5 (regardless of score)',
      'OR in dev_only_context',
      'OR clearly mitigated'
    ]
  },

  // ========================================================================
  // CATEGORY-SPECIFIC THRESHOLDS
  // ========================================================================
  by_category: {
    security: {
      // Security is most critical: highest bars
      min_evidence_for_critical: 4, // Must be crystal clear
      min_confidence_for_critical: 0.8,
      min_score_for_critical: 3.4, // Slightly lower score needed (evidence more important)
      default: 'suggestion', // Security defaults to suggestion unless proven
      reasoning: 'False positives in security reviews are better than false negatives'
    },

    performance: {
      min_evidence_for_critical: 4,
      min_confidence_for_critical: 0.75,
      min_score_for_critical: 3.6,
      default: 'suggestion',
      reasoning: 'Performance issues need proof of actual impact'
    },

    maintainability: {
      min_evidence_for_critical: 4,
      min_confidence_for_critical: 0.8,
      min_score_for_critical: 4.0, // Highest bar (code quality)
      default: 'suggestion',
      reasoning: 'Maintainability issues are almost always suggestions'
    },

    best_practices: {
      min_evidence_for_critical: 5, // Extremely rare to be critical
      min_confidence_for_critical: 0.95,
      min_score_for_critical: 4.5,
      default: 'suggestion',
      reasoning: 'Best practices violations are rarely critical'
    }
  }
};

module.exports = {
  SCORING_RUBRICS,
  SEVERITY_CLASSIFICATION
};
