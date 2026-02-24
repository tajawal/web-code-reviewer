/**
 * Quality Gates for Deterministic Reviews
 * These gates ensure reviews are stable and consistent
 */

const QUALITY_GATES = {
  // ============================================================================
  // CHUNK CONSISTENCY GATES
  // ============================================================================
  chunk_consistency: {
    // Maximum allowed variance in critical counts across chunks
    // If chunk A finds 3 critical and chunk B finds 0, variance is 3
    max_critical_variance: 3,

    // If variance exceeds this, log warning but don't fail
    warning_threshold: 2,

    reasoning: 'High variance suggests instability or inconsistent scoring'
  },

  // ============================================================================
  // ISSUE VALIDATION GATES
  // ============================================================================
  issue_validation: {
    // All issues MUST have these fields
    required_fields: [
      'id',
      'category',
      'severity_proposed',
      'severity_score',
      'confidence',
      'evidence_strength',
      'file',
      'lines',
      'snippet',
      'why_it_matters',
      'fix_summary'
    ],

    // Validation rules per field
    rules: {
      severity_score: {
        min: 0,
        max: 5,
        must_match_proposed: true,
        reasoning: 'Score must align with severity_proposed classification'
      },

      evidence_strength: {
        min: 0,
        max: 5,
        if_lte_2: 'severity_proposed must be suggestion',
        reasoning: 'Weak evidence cannot support critical classification'
      },

      confidence: {
        min: 0,
        max: 1,
        if_lte_0_5: 'severity_proposed must be suggestion',
        reasoning: 'Low confidence cannot justify critical'
      },

      category: {
        allowed_values: ['security', 'performance', 'maintainability', 'best_practices'],
        reasoning: 'Must be valid category'
      },

      snippet: {
        max_lines: 12,
        must_include_risky_code: true,
        reasoning: 'Snippet must be short and focused on the issue'
      }
    }
  },

  // ============================================================================
  // SEVERITY CLASSIFICATION GATES
  // ============================================================================
  severity_classification: {
    critical: {
      requires_all_of: [
        'severity_score >= 3.60',
        'evidence_strength >= 4', // RAISED from 3: strong evidence required
        'confidence >= 0.7',
        'not_dev_only_context',
        'not_clearly_mitigated'
      ],

      category_overrides: {
        security: {
          min_evidence: 4,
          min_confidence: 0.8,
          min_score: 3.4,
          reasoning: 'Security issues need strongest evidence'
        },

        performance: {
          min_evidence: 4,
          min_confidence: 0.75,
          min_score: 3.6,
          reasoning: 'Performance issues need proof of impact'
        },

        maintainability: {
          min_evidence: 4,
          min_confidence: 0.8,
          min_score: 4.0,
          reasoning: 'Maintainability is rarely critical'
        },

        best_practices: {
          min_evidence: 5,
          min_confidence: 0.95,
          min_score: 4.5,
          reasoning: 'Best practices are almost never critical'
        }
      }
    },

    suggestion: {
      reasoning: 'Default for everything that does not meet critical gates'
    }
  },

  // ============================================================================
  // CONTEXT SIZE GATES
  // ============================================================================
  context: {
    fixed_size: 200 * 1024, // 200KB for Sonnet 4.6's larger context window
    determinism: 'FIXED size for consistency (no dynamic calculation)',
    reasoning: 'Increased for Sonnet 4.6 1M token context window'
  },

  // ============================================================================
  // TOKEN ESTIMATION GATES
  // ============================================================================
  token_estimation: {
    chars_per_token: 3.5,
    safety_buffer: 1.1, // 10% extra
    formula: 'Math.ceil((text.length / 3.5) * 1.1)',
    reasoning: 'Conservative estimate prevents overflow'
  },

  // ============================================================================
  // DEDUPLICATION GATES
  // ============================================================================
  deduplication: {
    merge_strategy: 'AVERAGE (not MAX)',
    reasoning: 'Average prevents flipping from suggestion to critical',

    example: {
      scenario: 'Same issue found in two chunks',
      chunk_a: { severity_score: 3.4, confidence: 0.6 },
      chunk_b: { severity_score: 3.7, confidence: 0.8 },
      old_approach: { severity_score: 3.7, confidence: 0.8, result: 'CRITICAL (bad!)' },
      new_approach: { severity_score: 3.55, confidence: 0.7, result: 'SUGGESTION (correct)' }
    }
  }
};

module.exports = QUALITY_GATES;
