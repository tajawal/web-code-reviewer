/**
 * Review service for handling core review logic and decision making
 */

const core = require('@actions/core');
const ResponseParserService = require('./response-parser-service');
const { CONFIG, getLanguageForFile } = require('../constants');

class ReviewService {
  constructor() {
    // No constructor needed for this service
  }

  /**
   * Check if LLM response indicates merge should be blocked based on JSON analysis
   */
  checkMergeDecision(llmResponse) {
    try {
      // Try to extract JSON from the new XML-style format first
      const jsonMatches = llmResponse.match(/<JSON>\s*([\s\S]*?)\s*<\/JSON>/g);

      if (jsonMatches && jsonMatches.length > 0) {
        core.info(`📊 Found ${jsonMatches.length} JSON objects in XML format`);

        // Parse all JSON objects and combine their data
        const allIssues = [];
        let hasBlockingRecommendation = false;
        let totalCriticalCount = 0;

        jsonMatches.forEach((match, index) => {
          try {
            const jsonStr = match.replace(/<JSON>\s*/, '').replace(/\s*<\/JSON>/, '');
            const reviewData = JSON.parse(jsonStr);

            core.info(
              `📋 Parsing JSON object ${index + 1}/${jsonMatches.length}: ${reviewData.issues?.length || 0} issues`
            );

            // Check final recommendation from this chunk
            if (reviewData.final_recommendation) {
              if (reviewData.final_recommendation === 'do_not_merge') {
                hasBlockingRecommendation = true;
                core.info(
                  `🤖 Chunk ${index + 1} final recommendation: ${reviewData.final_recommendation} (BLOCK)`
                );
              } else {
                core.info(
                  `🤖 Chunk ${index + 1} final recommendation: ${reviewData.final_recommendation} (APPROVE)`
                );
              }
            }

            // Collect issues
            if (reviewData.issues && Array.isArray(reviewData.issues)) {
              reviewData.issues.forEach(issue => {
                // Add chunk context to issue
                const issueWithContext = {
                  ...issue,
                  chunk: index + 1,
                  originalId: issue.id
                };
                allIssues.push(issueWithContext);
              });
            }

            // Collect metrics
            if (reviewData.metrics) {
              totalCriticalCount += reviewData.metrics.critical_count || 0;
            }
          } catch (parseError) {
            core.warning(`⚠️  Error parsing JSON object ${index + 1}: ${parseError.message}`);
          }
        });

        // Check if any chunk recommended blocking
        if (hasBlockingRecommendation) {
          core.info('🚨 At least one chunk recommended blocking the merge');
          return true;
        }

        // Analyze all issues based on severity and confidence
        if (allIssues.length > 0) {
          const criticalIssues = allIssues.filter(
            issue => issue.severity_proposed === 'critical' && issue.confidence >= 0.6
          );

          const highConfidenceCritical = criticalIssues.length;

          if (highConfidenceCritical > 0) {
            core.info(
              `🚨 Found ${highConfidenceCritical} critical issues with confidence ≥ 0.6 across all chunks`
            );
            core.info(
              `   Issues: ${criticalIssues.map(i => `${i.originalId} (${i.category}, Chunk ${i.chunk}, score: ${i.severity_score?.toFixed(1) || 'N/A'})`).join(', ')}`
            );
            return true; // Block merge
          }

          // Log all issues for transparency with severity scores
          const allIssuesSummary = allIssues.map(
            issue =>
              `${issue.severity_proposed.toUpperCase()} ${issue.originalId}: ${issue.category} (Chunk ${issue.chunk}, score: ${issue.severity_score?.toFixed(1) || 'N/A'}, confidence: ${issue.confidence})`
          );

          if (allIssuesSummary.length > 0) {
            core.info(`📋 All issues found: ${allIssuesSummary.join(', ')}`);
          }
        }

        // Check combined metrics
        if (totalCriticalCount > 0) {
          core.info(`🚨 Total critical issues count across all chunks: ${totalCriticalCount}`);
          return true; // Block merge if any critical issues
        }

        core.info('✅ No critical issues found across all chunks - safe to merge');
        return false;
      }

      // Fallback to old text-based parsing if JSON not found
      core.warning('⚠️  JSON not found in response, falling back to text-based parsing');
      return this.checkMergeDecisionLegacy(llmResponse);
    } catch (error) {
      core.warning(`⚠️  Error parsing JSON response: ${error.message}`);
      core.warning('⚠️  Falling back to text-based parsing');
      return this.checkMergeDecisionLegacy(llmResponse);
    }
  }

  /**
   * Legacy text-based merge decision checking (fallback)
   */
  checkMergeDecisionLegacy(llmResponse) {
    const response = llmResponse.toLowerCase();

    // Check for explicit approval phrases
    for (const phrase of CONFIG.APPROVAL_PHRASES) {
      if (response.includes(phrase)) {
        core.info(`✅ Found approval phrase: "${phrase}"`);
        return false; // Safe to merge
      }
    }

    // Check for explicit blocking phrases
    for (const phrase of CONFIG.BLOCKING_PHRASES) {
      if (response.includes(phrase)) {
        core.info(`🚨 Found blocking phrase: "${phrase}"`);
        return true; // Block merge
      }
    }

    // Check for critical issue indicators
    let criticalIssueCount = 0;
    for (const issue of CONFIG.CRITICAL_ISSUES) {
      if (response.includes(issue)) {
        criticalIssueCount++;
      }
    }

    if (criticalIssueCount >= 2) {
      core.info(`🚨 Found ${criticalIssueCount} critical issues without explicit approval`);
      return true;
    }

    core.info('⚠️  No explicit merge decision found, defaulting to allow merge');
    return false;
  }

  /**
   * Generate PR comment content with enhanced JSON parsing
   */
  generatePRComment(
    shouldBlockMerge,
    changedFiles,
    llmResponse,
    _department,
    _team,
    _provider,
    _baseBranch,
    _pathToFiles,
    _ignorePatterns
  ) {
    const status = shouldBlockMerge ? '❌ **DO NOT MERGE**' : '✅ **SAFE TO MERGE**';
    const statusDescription = shouldBlockMerge
      ? 'Issues found that must be addressed before merging'
      : 'All changes are safe and well-implemented';

    // Extract issues and metadata using centralized function
    const extractedData = ResponseParserService.extractIssuesFromResponse(llmResponse);

    // Create review summary
    let reviewSummary = '';
    if (extractedData.summaries.length > 0) {
      reviewSummary = `**AI Summary**: ${extractedData.summaries.join(' ')}\n\n`;
    }

    // Create structured issue display
    let issueDetails = '';
    let reviewMetrics = '';
    if (extractedData.issues.length > 0) {
      const criticalIssues = extractedData.issues.filter(i => i.severity_proposed === 'critical');
      const suggestions = extractedData.issues.filter(i => i.severity_proposed === 'suggestion');

      issueDetails = '## 🔍 **Issues Found**\n\n';

      if (criticalIssues.length > 0) {
        issueDetails += `### 🚨 **Critical Issues (${criticalIssues.length})**\n`;
        criticalIssues.forEach(issue => {
          const language = getLanguageForFile(issue.file);
          // Show chunk information (handle both single chunk and multiple chunks)
          const chunkInfo =
            issue.chunks && issue.chunks.length > 1
              ? `Chunks ${issue.chunks.join(', ')}`
              : `Chunk ${issue.chunk}`;
          issueDetails += `🔴 ${issue.originalId} - ${issue.category.toUpperCase()} (${chunkInfo})\n`;
          if (issue.snippet) {
            issueDetails += `\`\`\`${language}\n${issue.snippet}\n\`\`\`\n`;
          }
          issueDetails += `- **File**: \`${issue.file}\` (lines ${issue.lines.join('-')})\n`;
          issueDetails += `- **Impact**: ${issue.why_it_matters}\n`;
          if (issue.fix_summary) {
            issueDetails += `- **Fix Summary**: ${issue.fix_summary}\n`;
          }
          if (issue.fix_code_patch) {
            issueDetails += `\`\`\`${language}\n${issue.fix_code_patch}\n\`\`\`\n`;
          }
          if (issue.tests) {
            issueDetails += `- **Test**: ${issue.tests}\n`;
          }
          issueDetails += '\n';
        });
      }

      if (suggestions.length > 0) {
        issueDetails += `### 💡 **Suggestions (${suggestions.length})**\n`;
        suggestions.forEach(issue => {
          const language = getLanguageForFile(issue.file);
          // Show chunk information (handle both single chunk and multiple chunks)
          const chunkInfo =
            issue.chunks && issue.chunks.length > 1
              ? `Chunks ${issue.chunks.join(', ')}`
              : `Chunk ${issue.chunk}`;
          issueDetails += `🟡 ${issue.originalId} - ${issue.category.toUpperCase()} (${chunkInfo})\n`;
          if (issue.snippet) {
            issueDetails += `\`\`\`${language}\n${issue.snippet}\n\`\`\`\n`;
          }
          issueDetails += `- **File**: \`${issue.file}\` (lines ${issue.lines.join('-')})\n`;
          issueDetails += `- **Impact**: ${issue.why_it_matters}\n`;
          if (issue.fix_summary) {
            issueDetails += `- **Fix Summary**: ${issue.fix_summary}\n`;
          }
          if (issue.fix_code_patch) {
            issueDetails += `\`\`\`${language}\n${issue.fix_code_patch}\n\`\`\`\n`;
          }
          issueDetails += '\n';
        });
      }

      // Add combined metrics

      reviewMetrics += '### 📊 **Review Metrics**\n';
      reviewMetrics += `- **Critical Issues**: ${extractedData.totalCriticalCount}\n`;
      reviewMetrics += `- **Suggestions**: ${extractedData.totalSuggestionCount}\n`;
      reviewMetrics += `- **Total Issues**: ${extractedData.issues.length}\n`;
      reviewMetrics += `- **Chunks Processed**: ${extractedData.chunksProcessed}\n\n`;
    }

    return `## 🤖 DeepReview

**Overall Assessment**: ${status} - ${statusDescription}

${reviewSummary}

---

${reviewMetrics}

---

${issueDetails}

---

**What to do next:**
${
  shouldBlockMerge
    ? '1. 🔍 Review the critical issues above\n2. 🛠️ Fix the issues mentioned in the review\n3. 🔄 Push changes and re-run the review\n4. ✅ Merge only after all critical issues are resolved'
    : '1. ✅ Review the suggestions above\n2. 🚀 Safe to merge when ready\n3. 💡 Consider any optimization suggestions as future improvements'
}
`;
  }

  /**
   * Prepare review data for logging
   */
  prepareReviewLogData(
    shouldBlockMerge,
    changedFiles,
    llmResponse,
    department,
    team,
    language,
    provider
  ) {
    try {
      // Extract issues from LLM response
      const extractedData = ResponseParserService.extractIssuesFromResponse(llmResponse);

      // Prepare issues for logging (simplified format)
      const logIssues = extractedData.issues.map(issue => ({
        id: issue.id,
        category: issue.category,
        severity: issue.severity_proposed,
        severity_score: issue.severity_score,
        confidence: issue.confidence,
        file: issue.file,
        lines: issue.lines,
        chunk: issue.chunk,
        risk_factors: issue.risk_factors,
        risk_factors_notes: issue.risk_factors_notes
      }));

      const reviewData = {
        department,
        team,
        head_branch: process.env.GITHUB_REF_NAME || 'HEAD',
        files_reviewed: changedFiles.length,
        issues: logIssues,
        review_timestamp: new Date().toISOString(),
        repository: `${process.env.GITHUB_REPOSITORY || 'unknown/unknown'}`,
        pr_number:
          process.env.GITHUB_EVENT_NAME === 'pull_request' ? process.env.GITHUB_EVENT_NUMBER : null,
        merge_blocked: shouldBlockMerge,
        language,
        provider
      };

      return reviewData;
    } catch (error) {
      core.warning(`⚠️  Error preparing review log data: ${error.message}`);
      // Return basic data if parsing fails
      return {
        department,
        team,
        head_branch: 'HEAD',
        files_reviewed: changedFiles.length,
        issues: [],
        review_timestamp: new Date().toISOString(),
        repository: `${process.env.GITHUB_REPOSITORY || 'unknown/unknown'}`,
        pr_number: null,
        merge_blocked: shouldBlockMerge,
        language,
        provider
      };
    }
  }
}

module.exports = ReviewService;
