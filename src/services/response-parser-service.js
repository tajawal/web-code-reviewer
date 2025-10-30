/**
 * Centralized Response Parser Service
 * Handles all LLM response parsing to eliminate code duplication
 * Enhanced with chunk processing consistency, deduplication, and failure handling
 */

const core = require('@actions/core');

class ResponseParserService {
  /**
   * Extract issues and metadata from LLM response with enhanced chunk processing
   * This is the single source of truth for parsing LLM responses
   */
  static extractIssuesFromResponse(llmResponse) {
    const issues = [];
    const summaries = [];
    const chunkResults = [];
    let totalCriticalCount = 0;
    let totalSuggestionCount = 0;
    let jsonMatches = [];
    let failedChunks = 0;

    // Check for potential truncation indicators
    if (llmResponse && typeof llmResponse === 'string') {
      const hasIncompleteJson = llmResponse.includes('<JSON>') && !llmResponse.includes('</JSON>');
      const hasIncompleteSummary =
        llmResponse.includes('<SUMMARY>') && !llmResponse.includes('</SUMMARY>');

      if (hasIncompleteJson || hasIncompleteSummary) {
        core.warning('⚠️  Detected potentially truncated LLM response - missing closing tags');
      }
    }

    try {
      // Try to extract JSON from the new XML-style format first
      jsonMatches = llmResponse.match(/<JSON>\s*([\s\S]*?)\s*<\/JSON>/g) || [];

      // Extract summary from <SUMMARY> tags (prioritize this over JSON summary field)
      const summaryMatches = llmResponse.match(/<SUMMARY>\s*([\s\S]*?)\s*<\/SUMMARY>/g) || [];

      if (summaryMatches.length > 0) {
        summaryMatches.forEach((match, index) => {
          const summaryContent = match
            .replace(/<SUMMARY>\s*/, '')
            .replace(/\s*<\/SUMMARY>/, '')
            .trim();
          if (summaryContent) {
            summaries.push(`**Chunk ${index + 1}**: ${summaryContent}`);
          }
        });
      }

      if (jsonMatches.length > 0) {
        jsonMatches.forEach((match, index) => {
          try {
            const jsonStr = match.replace(/<JSON>\s*/, '').replace(/\s*<\/JSON>/, '');
            const reviewData = JSON.parse(jsonStr);

            // Validate chunk data structure
            const validatedChunk = this.validateChunkData(reviewData, index + 1);
            chunkResults.push(validatedChunk);

            // Only use JSON summary if no <SUMMARY> tags were found
            if (validatedChunk.summary && summaryMatches.length === 0) {
              summaries.push(`**Chunk ${index + 1}**: ${validatedChunk.summary}`);
            }

            // Collect issues with enhanced context
            if (validatedChunk.issues && Array.isArray(validatedChunk.issues)) {
              validatedChunk.issues.forEach(issue => {
                // Add comprehensive chunk context to issue
                const issueWithContext = {
                  ...issue,
                  chunk: index + 1,
                  originalId: issue.id,
                  chunkIndex: index, // 0-based index for internal processing
                  chunkTotal: jsonMatches.length,
                  processedAt: new Date().toISOString()
                };
                issues.push(issueWithContext);
              });
            }

            // Collect metrics with validation
            if (validatedChunk.metrics) {
              totalCriticalCount += validatedChunk.metrics.critical_count || 0;
              totalSuggestionCount += validatedChunk.metrics.suggestion_count || 0;
            }
          } catch (parseError) {
            failedChunks++;
            core.warning(`⚠️  Error parsing JSON object ${index + 1}: ${parseError.message}`);

            // Add failed chunk info for tracking
            chunkResults.push({
              chunkIndex: index,
              success: false,
              error: parseError.message,
              issues: [],
              summary: null,
              metrics: { critical_count: 0, suggestion_count: 0 }
            });
          }
        });
      }
    } catch (error) {
      core.warning(`⚠️  Error extracting issues from response: ${error.message}`);
    }

    // Deduplicate issues across chunks
    const deduplicatedIssues = this.deduplicateIssues(issues);

    // Calculate processing statistics
    const successfulChunks = jsonMatches.length - failedChunks;
    const processingStats = {
      totalChunks: jsonMatches.length,
      successfulChunks,
      failedChunks,
      successRate: jsonMatches.length > 0 ? (successfulChunks / jsonMatches.length) * 100 : 0
    };

    // Log processing statistics
    if (failedChunks > 0) {
      core.warning(
        `⚠️  Chunk processing: ${successfulChunks}/${jsonMatches.length} successful (${processingStats.successRate.toFixed(1)}% success rate)`
      );
    } else {
      core.info(`✅ Chunk processing: All ${jsonMatches.length} chunks processed successfully`);
    }

    return {
      issues: deduplicatedIssues,
      summaries,
      totalCriticalCount,
      totalSuggestionCount,
      chunksProcessed: jsonMatches.length,
      chunkResults,
      processingStats
    };
  }

  /**
   * Validate chunk data structure and ensure required fields
   */
  static validateChunkData(chunkData, chunkNumber) {
    const validated = {
      chunkIndex: chunkNumber - 1,
      chunkNumber,
      success: true,
      issues: [],
      summary: null,
      metrics: { critical_count: 0, suggestion_count: 0 }
    };

    // Validate summary
    if (chunkData.summary && typeof chunkData.summary === 'string') {
      validated.summary = chunkData.summary.trim();
    }

    // Validate issues array
    if (chunkData.issues && Array.isArray(chunkData.issues)) {
      validated.issues = chunkData.issues.filter(issue => {
        // Basic validation for required fields
        return (
          issue &&
          typeof issue.id === 'string' &&
          typeof issue.category === 'string' &&
          typeof issue.severity_proposed === 'string'
        );
      });
    }

    // Validate metrics
    if (chunkData.metrics && typeof chunkData.metrics === 'object') {
      validated.metrics = {
        critical_count: Math.max(0, parseInt(chunkData.metrics.critical_count) || 0),
        suggestion_count: Math.max(0, parseInt(chunkData.metrics.suggestion_count) || 0)
      };
    }

    return validated;
  }

  /**
   * Deduplicate issues across chunks based on file, lines, and issue type
   */
  static deduplicateIssues(issues) {
    const issueMap = new Map();
    const deduplicated = [];

    issues.forEach(issue => {
      // Create a unique key based on file, lines, and issue type
      const key = `${issue.file}:${issue.lines?.join('-')}:${issue.category}:${issue.id}`;

      if (issueMap.has(key)) {
        // Issue already exists, merge chunk information
        const existingIssue = issueMap.get(key);
        existingIssue.chunks = existingIssue.chunks || [existingIssue.chunk];
        if (!existingIssue.chunks.includes(issue.chunk)) {
          existingIssue.chunks.push(issue.chunk);
        }

        // CHANGED: Use AVERAGE instead of MAX for determinism
        // Taking average prevents flipping from suggestion to critical based on one chunk's higher score
        // Example: Chunk A (score=3.4, confidence=0.6) + Chunk B (score=3.7, confidence=0.8)
        // Old (MAX): Would take 3.7/0.8 → might escalate to critical
        // New (AVG): Would take 3.55/0.7 → stays suggestion
        const existingConfidence = existingIssue.confidence || 0;
        const existingScore = existingIssue.severity_score || 0;

        // Average confidence (more stable)
        existingIssue.confidence = (existingConfidence + issue.confidence) / 2;

        // Average severity score (prevents classification flipping)
        existingIssue.severity_score = (existingScore + issue.severity_score) / 2;
      } else {
        // New issue, add to map and result
        const newIssue = {
          ...issue,
          chunks: [issue.chunk]
        };
        issueMap.set(key, newIssue);
        deduplicated.push(newIssue);
      }
    });

    // Sort issues by severity score (highest first)
    deduplicated.sort((a, b) => (b.severity_score || 0) - (a.severity_score || 0));

    return deduplicated;
  }
}

module.exports = ResponseParserService;
