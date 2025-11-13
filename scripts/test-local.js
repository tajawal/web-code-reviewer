#!/usr/bin/env node

/**
 * Local testing script for web-code-reviewer
 *
 * This script simulates running the GitHub Action locally:
 * 1. Sets up required environment variables
 * 2. Configures inputs (like language, paths, etc.)
 * 3. Runs the action against your current git branch
 *
 * Prerequisites:
 * - You must be in a git repository
 * - You must have changes committed to a branch
 * - The base branch must exist in origin (e.g., origin/master)
 *
 * Usage:
 *   node scripts/test-local.js
 *
 * Or with custom config:
 *   LANGUAGE=python BASE_BRANCH=develop node scripts/test-local.js
 */

const path = require('path');
const { execSync } = require('child_process');

// Check if we're in a git repo
try {
  execSync('git rev-parse --git-dir', { stdio: 'ignore' });
} catch (error) {
  console.error('❌ Error: Not in a git repository!');
  console.error('   Please run this script from your git repository root.');
  process.exit(1);
}

// Load environment variables from .env.local if it exists
try {
  require('dotenv').config({ path: '.env.local' });
  console.log('✅ Loaded .env.local');
} catch (error) {
  console.log('ℹ️  No .env.local file found (optional)');
}

// Configuration (can be overridden by environment variables)
const config = {
  llmProvider: process.env.LLM_PROVIDER || 'claude',
  language: process.env.LANGUAGE || 'js',
  pathToFiles: process.env.PATH_TO_FILES || 'src/',
  baseBranch: process.env.BASE_BRANCH || 'master',
  maxTokens: process.env.MAX_TOKENS || '8000',
  temperature: process.env.TEMPERATURE || '0',
  team: process.env.TEAM || 'test-team',
  department: process.env.DEPARTMENT || 'engineering',
  ignorePatterns: process.env.IGNORE_PATTERNS || '.json,.md,.lock,.test.js,.spec.js'
};

// Get current branch
let currentBranch = 'HEAD';
try {
  currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
} catch (error) {
  console.warn('⚠️  Could not determine current branch, using HEAD');
}

// Check if base branch exists
try {
  execSync(`git rev-parse origin/${config.baseBranch}`, { stdio: 'ignore' });
} catch (error) {
  console.error(`❌ Error: Base branch 'origin/${config.baseBranch}' not found!`);
  console.error('   Available branches:');
  try {
    const branches = execSync('git branch -r', { encoding: 'utf8' });
    console.error(branches);
  } catch (e) {
    // Ignore
  }
  console.error(`\n   Try: git fetch origin ${config.baseBranch}`);
  process.exit(1);
}

// Check if there are any changes
try {
  const changes = execSync(`git diff --name-only origin/${config.baseBranch}...HEAD`, {
    encoding: 'utf8'
  }).trim();

  if (!changes) {
    console.warn('⚠️  Warning: No changes detected between origin/' + config.baseBranch + ' and ' + currentBranch);
    console.warn('   The review may not find anything to review.');
    console.warn('\n   To create test changes:');
    console.warn('   1. Make changes to files in ' + config.pathToFiles);
    console.warn('   2. git add <files>');
    console.warn('   3. git commit -m "test changes"');
    console.warn('   4. Run this script again\n');
  } else {
    const fileCount = changes.split('\n').length;
    console.log(`✅ Found ${fileCount} changed file(s) to review\n`);
  }
} catch (error) {
  console.error('❌ Error checking for changes:', error.message);
  process.exit(1);
}

// Validate API keys
if (config.llmProvider === 'claude' && !process.env.CLAUDE_API_KEY) {
  console.error('❌ Error: CLAUDE_API_KEY is required!');
  console.error('   Set it in .env.local or as an environment variable:');
  console.error('   export CLAUDE_API_KEY="sk-ant-..."');
  process.exit(1);
}

if (config.llmProvider === 'openai' && !process.env.OPENAI_API_KEY) {
  console.error('❌ Error: OPENAI_API_KEY is required!');
  console.error('   Set it in .env.local or as an environment variable:');
  console.error('   export OPENAI_API_KEY="sk-..."');
  process.exit(1);
}

if (!process.env.GITHUB_TOKEN) {
  console.warn('⚠️  Warning: GITHUB_TOKEN not set!');
  console.warn('   The action will run but cannot post PR comments.');
  console.warn('   Set it in .env.local: export GITHUB_TOKEN="ghp_..."');
  console.warn('');
}

// Set GitHub Actions environment variables
process.env.INPUT_LLM_PROVIDER = config.llmProvider;
process.env.INPUT_LANGUAGE = config.language;
process.env.INPUT_PATH_TO_FILES = config.pathToFiles;
process.env.INPUT_BASE_BRANCH = config.baseBranch;
process.env.INPUT_MAX_TOKENS = config.maxTokens;
process.env.INPUT_TEMPERATURE = config.temperature;
process.env.INPUT_TEAM = config.team;
process.env.INPUT_DEPARTMENT = config.department;
process.env.INPUT_IGNORE_PATTERNS = config.ignorePatterns;

// Set API keys
if (config.llmProvider === 'claude') {
  process.env.INPUT_CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
} else if (config.llmProvider === 'openai') {
  process.env.INPUT_OPENAI_API_KEY = process.env.OPENAI_API_KEY;
}

// Mock GitHub context
process.env.GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY || 'test/repo';
process.env.GITHUB_EVENT_NAME = 'pull_request';
process.env.GITHUB_SHA = 'HEAD';
process.env.GITHUB_REF_NAME = currentBranch;

// Print configuration
console.log('🧪 Running web-code-reviewer locally\n');
console.log('📋 Configuration:');
console.log('   Provider:', config.llmProvider);
console.log('   Language:', config.language);
console.log('   Path:', config.pathToFiles);
console.log('   Base Branch:', config.baseBranch);
console.log('   Current Branch:', currentBranch);
console.log('   Max Tokens:', config.maxTokens);
console.log('   Temperature:', config.temperature);
console.log('   Team:', config.team);
console.log('   Department:', config.department);
console.log('   Repository:', process.env.GITHUB_REPOSITORY);
console.log('');
console.log('🔍 Git Diff Command:');
console.log(`   git diff origin/${config.baseBranch}...HEAD`);
console.log('');
console.log('🚀 Starting review...\n');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Run the action
try {
  require('../src/index.js');
} catch (error) {
  console.error('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.error('❌ Error running action:', error.message);
  console.error('\nStack trace:');
  console.error(error.stack);
  process.exit(1);
}
