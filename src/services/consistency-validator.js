/**
 * Consistency Validator - Ensures chunk processing is stable across runs
 * Validates that different chunks agree on issue classifications
 */

const core = require('@actions/core');

class ConsistencyValidator {
  /**
   * Check consistency of critical counts across chunks
   * High variance may indicate instability
   */
  static validateChunkConsistency(chunkResults) {
    if (chunkResults.length <= 1) {
      return { isConsistent: true, warnings: [] };
    }

    const warnings = [];
    const criticalCounts = chunkResults
      .filter(r => r.success)
      .map(r => r.metrics?.critical_count || 0);

    if (criticalCounts.length === 0) {
      return { isConsistent: true, warnings };
    }

    const maxCount = Math.max(...criticalCounts);
    const minCount = Math.min(...criticalCounts);
    const variance = maxCount - minCount;

    // If variance is high (more than 3), warn about potential instability
    if (variance > 3) {
      const message = `⚠️  High variance in critical issue counts across chunks: ${criticalCounts.join(', ')} (variance: ${variance})`;
      warnings.push(message);
      core.warning(message);
    }

    // If some chunks found issues but others didn't, it might be a problem
    if (minCount === 0 && maxCount > 0) {
      const message = `⚠️  Inconsistent critical findings: some chunks found ${maxCount}, others found 0`;
      warnings.push(message);
      core.warning(message);
    }

    return {
      isConsistent: variance <= 3,
      variance,
      minCount,
      maxCount,
      warnings
    };
  }

  /**
   * Validate that evidence strength is consistent with severity classification
   */
  static validateEvidenceConsistency(issues) {
    const violations = [];
    const warnings = [];

    issues.forEach(issue => {
      // RULE 1: If evidence_strength <= 2, must be suggestion
      if (issue.evidence_strength <= 2 && issue.severity_proposed === 'critical') {
        violations.push({
          issueId: issue.id,
          line: issue.lines?.[0],
          violation: `Evidence strength ${issue.evidence_strength} (weak) but marked critical`,
          fix: 'Change severity_proposed to "suggestion"'
        });
      }

      // RULE 2: If confidence <= 0.5, must be suggestion
      if (issue.confidence <= 0.5 && issue.severity_proposed === 'critical') {
        violations.push({
          issueId: issue.id,
          line: issue.lines?.[0],
          violation: `Confidence ${issue.confidence} (low) but marked critical`,
          fix: 'Change severity_proposed to "suggestion"'
        });
      }

      // RULE 3: Evidence strength should match impact/exploitability
      const strongEvidence = issue.evidence_strength >= 4;
      const highRiskFactors =
        issue.risk_factors?.impact >= 4 && issue.risk_factors?.exploitability >= 4;
      if (highRiskFactors && !strongEvidence) {
        warnings.push({
          issueId: issue.id,
          issue: `High risk factors but moderate evidence (${issue.evidence_strength})`,
          suggestion: 'Consider lowering confidence or evidence_strength'
        });
      }
    });

    if (violations.length > 0) {
      core.warning(`⚠️  Found ${violations.length} evidence consistency violations`);
      violations.forEach(v => {
        core.warning(`   ${v.issueId} (line ${v.line}): ${v.violation} → ${v.fix}`);
      });
    }

    return {
      isConsistent: violations.length === 0,
      violations,
      count: violations.length
    };
  }

  /**
   * Check if severity_score matches severity_proposed classification
   */
  static validateScoringConsistency(issues) {
    const violations = [];

    issues.forEach(issue => {
      const score = issue.severity_score || 0;
      const proposed = issue.severity_proposed;
      const evidence = issue.evidence_strength || 0;
      const confidence = issue.confidence || 0;

      // Check if critical classification is justified by score
      if (proposed === 'critical') {
        // Score should be >= 3.60
        if (score < 3.6) {
          violations.push({
            issueId: issue.id,
            violation: `Critical classification but score ${score.toFixed(2)} < 3.60`
          });
        }

        // Evidence should be >= 4
        if (evidence < 4) {
          violations.push({
            issueId: issue.id,
            violation: `Critical classification but evidence_strength ${evidence} < 4`
          });
        }

        // Confidence should be >= 0.7
        if (confidence < 0.7) {
          violations.push({
            issueId: issue.id,
            violation: `Critical classification but confidence ${confidence.toFixed(2)} < 0.7`
          });
        }
      }
    });

    if (violations.length > 0) {
      core.warning(`⚠️  Found ${violations.length} scoring consistency violations`);
    }

    return {
      isConsistent: violations.length === 0,
      violations,
      count: violations.length
    };
  }

  /**
   * Validate all consistency rules
   */
  static validateAll(issues, chunkResults) {
    const results = {
      chunkConsistency: this.validateChunkConsistency(chunkResults),
      evidenceConsistency: this.validateEvidenceConsistency(issues),
      scoringConsistency: this.validateScoringConsistency(issues)
    };

    const totalViolations =
      results.chunkConsistency.warnings.length +
      results.evidenceConsistency.violations.length +
      results.scoringConsistency.violations.length;

    if (totalViolations > 0) {
      core.warning(`⚠️  Total consistency violations: ${totalViolations}`);
    } else {
      core.info(`✅ All consistency checks passed`);
    }

    return {
      ...results,
      isFullyConsistent:
        results.chunkConsistency.isConsistent &&
        results.evidenceConsistency.isConsistent &&
        results.scoringConsistency.isConsistent
    };
  }
}

module.exports = ConsistencyValidator;
