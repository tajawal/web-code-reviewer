/**
 * Language-Specific Scoring Rubrics
 * Defines HOW to score common issues per language
 */

const LANGUAGE_RUBRICS = {
  // ============================================================================
  // JAVASCRIPT/TYPESCRIPT RUBRICS
  // ============================================================================
  js: {
    unstable_hook_deps: {
      description: 'useEffect/useMemo/useCallback with missing or unstable dependencies',

      scoring_levels: {
        missing_primitive_dep: {
          description: 'Primitive variable missing from deps array',
          impact: 2,
          exploitability: 2,
          likelihood: 2,
          evidence_strength: 2, // Depends on effect purpose
          confidence: 0.5,
          reasoning: 'Forgotten dependency, but impact varies by effect logic'
        },

        missing_object_or_function_dep: {
          description: 'Object or function reference missing from deps',
          impact: 3,
          exploitability: 2,
          likelihood: 3,
          evidence_strength: 3,
          confidence: 0.6,
          reasoning: 'Object/function identity changes cause unintended reruns'
        },

        missing_array_dep: {
          description: 'Array reference missing from deps',
          impact: 3,
          exploitability: 1,
          likelihood: 4,
          evidence_strength: 4,
          confidence: 0.8,
          reasoning: 'Array missing always causes effect rerun on every render'
        },

        infinite_loop_proof: {
          description: 'Effect references state that it modifies (infinite loop)',
          impact: 5,
          exploitability: 1,
          likelihood: 5,
          evidence_strength: 5,
          confidence: 0.95,
          reasoning: 'Guaranteed infinite loop - effect runs, updates state, reruns'
        }
      }
    },

    react_heavy_render: {
      description: 'Expensive computation in component render path',

      scoring_levels: {
        unknown_cost: {
          description: 'Expensive operation present but cost unknown',
          impact: 2,
          exploitability: 1,
          likelihood: 2,
          evidence_strength: 2,
          confidence: 0.4,
          reasoning: 'Visible operation but performance impact unclear'
        },

        moderate_cost: {
          description: 'Clearly expensive operation (O(n), JSON.parse, filter())',
          impact: 3,
          exploitability: 2,
          likelihood: 2,
          evidence_strength: 3,
          confidence: 0.6,
          reasoning: 'Moderate cost operation in render, impact visible in diff'
        },

        high_cost: {
          description: 'Very expensive operation (recursive, N+1, API call)',
          impact: 4,
          exploitability: 3,
          likelihood: 3,
          evidence_strength: 4,
          confidence: 0.8,
          reasoning: 'Clearly expensive operation in render path'
        }
      }
    },

    missing_cleanup: {
      description: 'useEffect subscribes to external resource without cleanup',

      scoring_levels: {
        memory_leak_potential: {
          description: 'Subscription/listener/timer without unsubscribe in cleanup',
          impact: 3,
          exploitability: 2,
          likelihood: 4,
          evidence_strength: 4,
          confidence: 0.8,
          reasoning: 'Every mount adds listener without cleanup → memory leak'
        },

        event_listener_leak: {
          description: 'addEventListener without removeEventListener in cleanup',
          impact: 3,
          exploitability: 2,
          likelihood: 4,
          evidence_strength: 4,
          confidence: 0.8,
          reasoning: 'Clear memory leak pattern'
        }
      }
    }
  },

  // ============================================================================
  // PYTHON RUBRICS
  // ============================================================================
  python: {
    sql_injection: {
      description: 'SQL query built with string interpolation without parameterization',

      scoring_levels: {
        direct_user_input: {
          description: 'User input directly in f-string or format()',
          impact: 5,
          exploitability: 5,
          likelihood: 5,
          evidence_strength: 5,
          confidence: 0.95,
          reasoning: 'Direct injection vulnerability, always critical'
        },

        uncertain_source: {
          description: 'Query built with variable that might be user-controlled',
          impact: 5,
          exploitability: 3,
          likelihood: 3,
          evidence_strength: 2,
          confidence: 0.5,
          reasoning: 'Potential injection but source uncertain'
        }
      }
    },

    unsafe_yaml: {
      description: 'yaml.load() without Loader parameter (unsafe)',

      scoring_levels: {
        untrusted_data: {
          description: 'yaml.load(untrusted_data) without safe_load',
          impact: 5,
          exploitability: 4,
          likelihood: 4,
          evidence_strength: 5,
          confidence: 0.95,
          reasoning: 'Arbitrary code execution possible'
        }
      }
    }
  },

  // ============================================================================
  // JAVA RUBRICS
  // ============================================================================
  java: {
    sql_injection: {
      description: 'SQL via string concatenation without PreparedStatement',

      scoring_levels: {
        direct_concatenation: {
          description: 'String.concat() or + operator in SQL query',
          impact: 5,
          exploitability: 5,
          likelihood: 5,
          evidence_strength: 5,
          confidence: 0.95,
          reasoning: 'Direct SQL injection'
        }
      }
    },

    n_plus_one_query: {
      description: 'Query in loop or lazy loading without fetch join',

      scoring_levels: {
        lazy_loading_leak: {
          description: 'Entity.getChildren() called in loop, loads one by one',
          impact: 4,
          exploitability: 2,
          likelihood: 4,
          evidence_strength: 4,
          confidence: 0.8,
          reasoning: 'Observable N+1 pattern in JPA'
        }
      }
    }
  }
};

module.exports = LANGUAGE_RUBRICS;
