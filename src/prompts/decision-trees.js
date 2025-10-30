/**
 * Explicit Decision Trees for Issue Severity Classification
 * REPLACES vague rules with clear, deterministic decision logic
 * These are the SOURCE OF TRUTH for severity classification
 */

const DECISION_TREES = {
  // ============================================================================
  // JAVASCRIPT/TYPESCRIPT DECISION TREES
  // ============================================================================

  js: {
    // ========================================================================
    // PERFORMANCE: Missing Initial State Check
    // ========================================================================
    missing_initial_state_check: {
      rule: 'useEffect checking external state (window.amplitude, window.GA, etc.) but not calling handler on mount',
      category: 'performance',

      severity_decision: {
        default: 'suggestion', // NOT auto-critical

        escalate_to_critical_if_ALL_of: [
          'observable_stale_state_bug_documented_in_logs',
          'user_impact_confirmed',
          'evidence_strength >= 4'
        ],

        OR_escalate_if: [
          {
            condition: 'impact >= 4 AND exploitability >= 3 AND likelihood >= 3',
            evidence_strength: 4,
            confidence: 0.8,
            reason: 'High impact, easy to trigger, always happens'
          }
        ]
      },

      risk_factors_default: {
        impact: 2, // Moderate: stale state is not catastrophic
        exploitability: 2, // Moderate: requires external state to exist
        likelihood: 2, // Moderate: happens in specific timing scenarios
        blast_radius: 1, // Low: affects only this specific handler
        evidence_strength: 3 // Moderate: visible in diff but impact not proven
      },

      evidence_required: [
        'useEffect with condition checking external state',
        'Handler attached to event listener',
        'No initial call to handler after attachment'
      ],

      fix_approach: 'Call updateAmplitudeState() after addEventListener() to check initial state'
    },

    // ========================================================================
    // PERFORMANCE: Event Burst Control (Debounce/Throttle)
    // ========================================================================
    event_burst_without_mitigation: {
      rule: 'High-frequency event handler (onChange, onScroll, onResize, onKeyPress) without debounce/throttle',
      category: 'performance',

      severity_decision: {
        default: 'suggestion',

        escalate_to_critical_if: {
          condition:
            'impact >= 4 AND exploitability >= 3 AND heavy_work_observed AND no_mitigation',
          evidence_strength_required: 4,
          confidence_required: 0.8,
          reason: 'Heavy work in high-frequency handler causes observable performance regression'
        }
      },

      risk_factors_default: {
        impact: 3, // Significant: multiple renders degrade UX
        exploitability: 3, // Moderate: requires user interaction
        likelihood: 3, // High: user will interact with input/scroll/resize
        blast_radius: 2, // Multiple: all users of that input field
        evidence_strength: 3 // Moderate: handler visible but cost not clear
      }
    },

    event_burst_with_mitigation_unknown_effectiveness: {
      rule: 'High-frequency handler with debounce/throttle present, but effectiveness unknown',
      category: 'performance',

      severity_decision: {
        default: 'suggestion', // NOT critical (developer showed awareness)

        cap_severity_score: 2.0, // Hard cap to prevent escalation
        cap_confidence: 0.5,

        reasoning:
          'Presence of debounce/throttle shows developer intent to mitigate. Cannot escalate without proof of ineffectiveness.'
      },

      risk_factors: {
        impact: 1,
        exploitability: 1,
        likelihood: 1,
        blast_radius: 1,
        evidence_strength: 2 // Mitigation present but implementation unclear
      }
    },

    event_burst_with_ineffective_mitigation: {
      rule: 'High-frequency handler with debounce/throttle that FAILS to prevent multiple renders',
      category: 'performance',

      required_evidence: 'MUST anchor code proving ineffectiveness (ALL of):',
      ineffective_proof: [
        'Debounced wrapper recreated each render (no useMemo)',
        'OR debounce created inside handler (new instance per keystroke)',
        'OR wait < 32ms for text input (essentially no delay)',
        'OR unstable deps cause identity churn',
        'OR async side-effect without cleanup causing stale updates',
        'PLUS heavy work clearly observable in code'
      ],

      severity_decision: {
        when_ineffective_proof_satisfied: {
          severity_proposed: 'critical',
          risk_factors: {
            impact: 4, // Heavy work every keystroke
            exploitability: 3, // Easy to trigger (just type)
            likelihood: 3, // Will happen on normal usage
            blast_radius: 2, // Multiple users affected
            evidence_strength: 4 // Directly observable in code
          },
          confidence: 0.8,
          severity_score_calculated: 'Will compute to >= 3.60'
        }
      }
    },

    // ========================================================================
    // REACT HOOKS: Unstable Dependencies
    // ========================================================================
    unstable_hook_deps: {
      rule: 'useEffect/useMemo/useCallback missing required dependencies or includes inline values',
      category: 'maintainability',

      severity_by_risk: {
        missing_primitive: {
          default_severity: 'suggestion',
          evidence_strength: 2,
          confidence: 0.5,
          reason: 'Primitive dependency forgotten, but impact depends on effect purpose'
        },

        missing_object_or_function: {
          default_severity: 'suggestion',
          evidence_strength: 3,
          confidence: 0.6,
          reason: 'Object/function deps missing can cause unintended retriggers'
        },

        missing_array: {
          default_severity: 'suggestion',
          evidence_strength: 4,
          confidence: 0.8,
          reason: 'Array missing from deps will cause effect to rerun unnecessarily'
        },

        infinite_loop_proof: {
          default_severity: 'critical',
          evidence_strength: 5,
          confidence: 0.95,
          reason: 'Effect directly references state that effect modifies'
        }
      }
    }
  },

  // ============================================================================
  // PYTHON DECISION TREES
  // ============================================================================
  python: {
    sql_injection: {
      rule: 'SQL query built with f-strings, % formatting, or .format() without parameterization',
      category: 'security',

      severity_decision: {
        default: 'critical',
        evidence_strength: 5,
        confidence: 0.95,
        reason: 'Direct SQL injection vulnerability, always critical'
      }
    },

    unsafe_deserialization: {
      rule: 'pickle.load, yaml.load (unsafe), or similar on untrusted data',
      category: 'security',

      severity_decision: {
        default: 'critical',
        evidence_strength: 5,
        confidence: 0.9,
        reason: 'Arbitrary code execution risk'
      }
    }
  },

  // ============================================================================
  // JAVA DECISION TREES
  // ============================================================================
  java: {
    sql_injection: {
      rule: 'SQL query via string concatenation without PreparedStatement',
      category: 'security',

      severity_decision: {
        default: 'critical',
        evidence_strength: 5,
        confidence: 0.95
      }
    }
  },

  // ============================================================================
  // PHP DECISION TREES
  // ============================================================================
  php: {
    sql_injection: {
      rule: 'SQL via string interpolation without prepared statements',
      category: 'security',

      severity_decision: {
        default: 'critical',
        evidence_strength: 5,
        confidence: 0.95
      }
    }
  },

  // ============================================================================
  // SWIFT DECISION TREES
  // ============================================================================
  swift: {
    force_unwrap_untrusted: {
      rule: 'Force unwrap (!) on data from network/external source without validation',
      category: 'reliability',

      severity_decision: {
        default: 'critical',
        evidence_strength: 5,
        confidence: 0.95,
        reason: 'Will crash on invalid input'
      }
    }
  }
};

module.exports = DECISION_TREES;
