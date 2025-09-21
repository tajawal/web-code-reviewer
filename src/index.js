#!/usr/bin/env node

const core = require('@actions/core');
const github = require('@actions/github');
const { getReviewPrompt } = require('./constants');

// Import services
const InputService = require('./services/input-service');
const FileService = require('./services/file-service');
const LLMService = require('./services/llm-service');
const GitHubService = require('./services/github-service');
const ReviewService = require('./services/review-service');
const LoggingService = require('./services/logging-service');

// Version information - updated during build process
const VERSION_INFO = {
  version: '1.14.29',
  name: 'web-code-reviewer',
  description: 'Automated code review using LLM (Claude/OpenAI) for GitHub PRs'
};

// Get and log current version
let versionInfo = VERSION_INFO.version;
let packageName = VERSION_INFO.name;
let description = VERSION_INFO.description;

// Try to get version from package.json if available (for development)
try {
  const packageJson = require('../package.json');
  versionInfo = packageJson.version;
  packageName = packageJson.name;
  description = packageJson.description;
} catch {
  // In production (dist/index.js), use embedded version info
  // This is expected and not an error
}

core.info(`🚀 GitHub Actions Deep Reviewer v${versionInfo}`);
core.info(`📦 Package: ${packageName}`);
core.info(`📝 Description: ${description}`);
core.info(`🔧 Node.js: ${process.version}`);
core.info(`⏰ Started at: ${new Date().toISOString()}\n`);

/**
 * GitHub Actions Deep Reviewer - Main orchestrator
 * Now uses modular services for better maintainability
 */
class GitHubActionsReviewer {
  constructor() {
    // Initialize services
    this.inputService = new InputService();
    this.reviewService = new ReviewService();
    this.loggingService = new LoggingService();

    // Get and validate inputs
    this.inputs = this.inputService.getInputs();

    // Set API key environment variables
    this.inputService.setApiKeyEnvironment(this.inputs);

    // Initialize GitHub context
    this.octokit = github.getOctokit(process.env.GITHUB_TOKEN);
    this.context = github.context;

    // Initialize GitHub service
    this.githubService = new GitHubService(this.octokit, this.context);

    // Get base branch dynamically
    this.baseBranch = this.githubService.getBaseBranch(
      this.inputs.inputBaseBranch,
      require('./constants').CONFIG.DEFAULT_BASE_BRANCH
    );

    // Initialize file service
    this.fileService = new FileService(
      this.baseBranch,
      this.inputs.language,
      this.inputs.pathToFiles,
      this.inputs.ignorePatterns
    );

    // Initialize LLM service
    this.llmService = new LLMService(
      this.inputs.provider,
      this.inputs.maxTokens,
      this.inputs.temperature,
      this.baseBranch
    );
  }

  /**
   * Run the complete review process
   */
  async runReview() {
    // Log review details
    this.loggingService.logReviewDetails(
      this.inputs.department,
      this.inputs.team,
      this.baseBranch,
      this.inputs.provider,
      this.inputs.language,
      this.inputs.pathToFiles,
      this.inputs.ignorePatterns,
      this.inputs.chunkSize,
      this.inputs.maxConcurrentRequests,
      this.inputs.batchDelayMs
    );

    // Get changed files
    const changedFiles = this.fileService.getChangedFiles();

    if (!this.loggingService.logChangedFiles(changedFiles)) {
      return;
    }

    // LLM Review
    core.info(`🤖 Running LLM Review of branch changes...\n`);

    // Get language-specific review prompt
    const reviewPrompt = getReviewPrompt(this.inputs.language);
    core.info(`📝 Using ${this.inputs.language} review prompt`);

    const fullDiff = this.fileService.getFullDiff();
    const llmResponse = await this.llmService.callLLM(reviewPrompt, fullDiff, changedFiles);

    if (this.loggingService.logLLMResponse(llmResponse)) {
      // Check if LLM recommends blocking the merge
      const shouldBlockMerge = this.reviewService.checkMergeDecision(llmResponse);

      // Generate and post PR comment
      const prComment = this.reviewService.generatePRComment(
        shouldBlockMerge,
        changedFiles,
        llmResponse,
        this.inputs.department,
        this.inputs.team,
        this.inputs.provider,
        this.baseBranch,
        this.inputs.pathToFiles,
        this.inputs.ignorePatterns
      );

      await this.githubService.addPRComment(prComment);

      // Log review data to external endpoint (non-blocking)
      const reviewData = this.reviewService.prepareReviewLogData(
        shouldBlockMerge,
        changedFiles,
        llmResponse,
        this.inputs.department,
        this.inputs.team,
        this.inputs.language,
        this.inputs.provider
      );

      this.loggingService.logReviewData(reviewData);

      // Log final decision
      this.loggingService.logFinalDecision(shouldBlockMerge, llmResponse);
    }
  }
}

// Run the review
async function run() {
  try {
    const reviewer = new GitHubActionsReviewer();
    await reviewer.runReview();
  } catch (error) {
    core.setFailed(`❌ Review failed: ${error.message}`);
  }
}

run();
