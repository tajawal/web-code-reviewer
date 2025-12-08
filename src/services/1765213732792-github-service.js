/**
 * GitHub service for handling PR operations, comments, and labels
 */

const core = require('@actions/core');
const { CONFIG } = require('../constants');

class GitHubService {
  constructor(octokit, context) {
    this.octokit = octokit;
    this.context = context;
  }

  /**
   * Add "post code review" label to the PR if it doesn't exist
   */
  async addPostCodeReviewLabel() {
    try {
      const labelName = CONFIG.POST_REVIEW_LABEL;

      // Check if the label already exists on the PR
      const { data: labels } = await this.octokit.rest.issues.listLabelsOnIssue({
        owner: this.context.repo.owner,
        repo: this.context.repo.repo,
        issue_number: this.context.issue.number
      });

      const labelExists = labels.some(
        label => label.name.toLowerCase() === labelName.toLowerCase()
      );

      if (labelExists) {
        core.info(`🏷️  Label "${labelName}" already exists on PR`);
        return;
      }

      // Try to add the label to the PR
      await this.octokit.rest.issues.addLabels({
        owner: this.context.repo.owner,
        repo: this.context.repo.repo,
        issue_number: this.context.issue.number,
        labels: [labelName]
      });

      core.info(`🏷️  Successfully added "${labelName}" label to PR`);
    } catch (error) {
      // If the label doesn't exist in the repository, try to create it first
      if (error.status === 422) {
        try {
          await this.createPostCodeReviewLabel();
        } catch (createError) {
          core.warning(
            `⚠️  Could not create "${CONFIG.POST_REVIEW_LABEL}" label: ${createError.message}`
          );
        }
      } else {
        core.warning(`⚠️  Error adding "${CONFIG.POST_REVIEW_LABEL}" label: ${error.message}`);
      }
    }
  }

  /**
   * Create the "post code review" label in the repository
   */
  async createPostCodeReviewLabel() {
    try {
      const labelName = CONFIG.POST_REVIEW_LABEL;

      await this.octokit.rest.issues.createLabel({
        owner: this.context.repo.owner,
        repo: this.context.repo.repo,
        name: labelName,
        color: CONFIG.POST_REVIEW_LABEL_COLOR,
        description: CONFIG.POST_REVIEW_LABEL_DESCRIPTION
      });

      core.info(`🏷️  Created "${labelName}" label in repository`);

      // Now try to add it to the PR
      await this.octokit.rest.issues.addLabels({
        owner: this.context.repo.owner,
        repo: this.context.repo.repo,
        issue_number: this.context.issue.number,
        labels: [labelName]
      });

      core.info(`🏷️  Successfully added "${CONFIG.POST_REVIEW_LABEL}" label to PR`);
    } catch (error) {
      core.warning(`⚠️  Error creating "${CONFIG.POST_REVIEW_LABEL}" label: ${error.message}`);
    }
  }

  /**
   * Delete ALL previous DeepReview comments on the PR
   */
  async deleteAllPreviousComments() {
    try {
      // Get all comments on the PR
      const { data: comments } = await this.octokit.rest.issues.listComments({
        owner: this.context.repo.owner,
        repo: this.context.repo.repo,
        issue_number: this.context.issue.number,
        per_page: 100 // Limit to last 100 comments
      });

      // Find comments made by our bot
      const botComments = comments.filter(
        comment => comment.body.includes('## 🤖 DeepReview') // Match our bot's header
      );

      if (botComments.length === 0) {
        core.info('ℹ️  No existing DeepReview comments found');
        return;
      }

      // Delete ALL existing DeepReview comments
      for (const comment of botComments) {
        core.info(`🗑️ Deleting DeepReview comment: ${comment.id} (created: ${comment.created_at})`);
        await this.octokit.rest.issues.deleteComment({
          owner: this.context.repo.owner,
          repo: this.context.repo.repo,
          comment_id: comment.id
        });
      }

      core.info(`✅ Deleted ${botComments.length} existing DeepReview comment(s)`);
    } catch (error) {
      core.warning(`⚠️  Error deleting previous comments: ${error.message}`);
      // Don't throw error - continue with adding new comment
    }
  }

  /**
   * Remove merge status labels (safe to merge / unsafe to merge)
   */
  async removeMergeStatusLabels() {
    try {
      const { data: labels } = await this.octokit.rest.issues.listLabelsOnIssue({
        owner: this.context.repo.owner,
        repo: this.context.repo.repo,
        issue_number: this.context.issue.number
      });

      const labelsToRemove = labels
        .filter(
          label =>
            label.name.toLowerCase() === CONFIG.SAFE_TO_MERGE_LABEL.toLowerCase() ||
            label.name.toLowerCase() === CONFIG.UNSAFE_TO_MERGE_LABEL.toLowerCase()
        )
        .map(label => label.name);

      if (labelsToRemove.length > 0) {
        for (const labelName of labelsToRemove) {
          await this.octokit.rest.issues.removeLabel({
            owner: this.context.repo.owner,
            repo: this.context.repo.repo,
            issue_number: this.context.issue.number,
            name: labelName
          });
        }
        core.info(`🏷️  Removed previous merge status labels: ${labelsToRemove.join(', ')}`);
      }
    } catch (error) {
      core.warning(`⚠️  Error removing merge status labels: ${error.message}`);
    }
  }

  /**
   * Add merge status label based on review result
   */
  async addMergeStatusLabel(shouldBlockMerge) {
    try {
      // First, remove any existing merge status labels
      await this.removeMergeStatusLabels();

      const labelName = shouldBlockMerge
        ? CONFIG.UNSAFE_TO_MERGE_LABEL
        : CONFIG.SAFE_TO_MERGE_LABEL;

      // Check if the label already exists on the PR (shouldn't after removal, but just in case)
      const { data: labels } = await this.octokit.rest.issues.listLabelsOnIssue({
        owner: this.context.repo.owner,
        repo: this.context.repo.repo,
        issue_number: this.context.issue.number
      });

      const labelExists = labels.some(
        label => label.name.toLowerCase() === labelName.toLowerCase()
      );

      if (labelExists) {
        core.info(`🏷️  Label "${labelName}" already exists on PR`);
        return;
      }

      // Try to add the label to the PR
      try {
        await this.octokit.rest.issues.addLabels({
          owner: this.context.repo.owner,
          repo: this.context.repo.repo,
          issue_number: this.context.issue.number,
          labels: [labelName]
        });

        core.info(`🏷️  Successfully added "${labelName}" label to PR`);
      } catch (error) {
        // If the label doesn't exist in the repository, try to create it first
        if (error.status === 422) {
          try {
            await this.createMergeStatusLabel(shouldBlockMerge);
          } catch (createError) {
            core.warning(`⚠️  Could not create "${labelName}" label: ${createError.message}`);
          }
        } else {
          core.warning(`⚠️  Error adding "${labelName}" label: ${error.message}`);
        }
      }
    } catch (error) {
      core.warning(`⚠️  Error adding merge status label: ${error.message}`);
    }
  }

  /**
   * Create merge status label in the repository
   */
  async createMergeStatusLabel(shouldBlockMerge) {
    try {
      const labelName = shouldBlockMerge
        ? CONFIG.UNSAFE_TO_MERGE_LABEL
        : CONFIG.SAFE_TO_MERGE_LABEL;
      const labelColor = shouldBlockMerge
        ? CONFIG.UNSAFE_TO_MERGE_LABEL_COLOR
        : CONFIG.SAFE_TO_MERGE_LABEL_COLOR;
      const labelDescription = shouldBlockMerge
        ? CONFIG.UNSAFE_TO_MERGE_LABEL_DESCRIPTION
        : CONFIG.SAFE_TO_MERGE_LABEL_DESCRIPTION;

      await this.octokit.rest.issues.createLabel({
        owner: this.context.repo.owner,
        repo: this.context.repo.repo,
        name: labelName,
        color: labelColor,
        description: labelDescription
      });

      core.info(`🏷️  Created "${labelName}" label in repository`);

      // Now try to add it to the PR
      await this.octokit.rest.issues.addLabels({
        owner: this.context.repo.owner,
        repo: this.context.repo.repo,
        issue_number: this.context.issue.number,
        labels: [labelName]
      });

      core.info(`🏷️  Successfully added "${labelName}" label to PR`);
    } catch (error) {
      core.warning(`⚠️  Error creating merge status label: ${error.message}`);
    }
  }

  /**
   * Add PR comment to GitHub
   * Always deletes old comments first, then adds a new comment
   */
  async addPRComment(comment, shouldBlockMerge) {
    if (this.context.eventName !== 'pull_request') {
      core.info('⚠️  Not a pull request event, skipping PR comment');
      return;
    }

    try {
      // Step 1: Delete ALL existing DeepReview comments first
      await this.deleteAllPreviousComments();

      // Step 2: Add a new comment
      core.info('💬 Adding new DeepReview comment...');
      await this.octokit.rest.issues.createComment({
        owner: this.context.repo.owner,
        repo: this.context.repo.repo,
        issue_number: this.context.issue.number,
        body: comment
      });
      core.info('✅ Added new PR comment successfully');

      // Step 3: Add "post code review" label to the PR
      core.info('🏷️  Adding "post code review" label to PR...');
      await this.addPostCodeReviewLabel();

      // Step 4: Add merge status label (safe to merge / unsafe to merge)
      // core.info('🏷️  Adding merge status label to PR...');
      // await this.addMergeStatusLabel(shouldBlockMerge);
    } catch (error) {
      core.error(`❌ Error adding PR comment: ${error.message}`);
    }
  }

  /**
   * Get base branch dynamically from PR or use input/default
   */
  getBaseBranch(inputBaseBranch, defaultBaseBranch) {
    // If we're in a pull request context, get the base branch from the PR
    if (this.context.eventName === 'pull_request' && this.context.payload.pull_request) {
      const prBaseBranch = this.context.payload.pull_request.base.ref;
      core.info(`📋 Using PR base branch: ${prBaseBranch}`);
      return prBaseBranch;
    }

    // Fallback to input or default
    if (inputBaseBranch) {
      core.info(`📋 Using input base branch: ${inputBaseBranch}`);
      return inputBaseBranch;
    }

    core.info(`📋 Using default base branch: ${defaultBaseBranch}`);
    return defaultBaseBranch;
  }
}

module.exports = GitHubService;
