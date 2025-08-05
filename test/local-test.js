#!/usr/bin/env node

/**
 * Local test script for the GitHub Action
 * This simulates the GitHub Actions environment for local testing
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env file
try {
  require('dotenv').config({ path: path.join(__dirname, '.env') });
  console.log('📄 Loaded environment variables from .env file');
} catch (error) {
  console.log('⚠️  No .env file found, using default environment variables');
}

// Mock GitHub Actions environment
process.env.GITHUB_TOKEN = process.env.GITHUB_TOKEN || 'test-token';
process.env.GITHUB_SHA = process.env.GITHUB_SHA || execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
process.env.GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY || 'tajawal/web-code-reviewer';

// Mock GitHub context
const mockContext = {
  eventName: 'pull_request',
  sha: process.env.GITHUB_SHA,
  repo: {
    owner: 'tajawal',
    repo: 'web-code-reviewer'
  },
  issue: {
    number: 1
  },
  payload: {
    pull_request: {
      base: {
        ref: 'master'
      },
      head: {
        ref: 'feature/test'
      }
    }
  }
};

// Mock @actions/core
const mockCore = {
  getInput: (name) => {
    const inputs = {
      'llm_provider': process.env.TEST_LLM_PROVIDER || 'claude',
      'path_to_files': process.env.TEST_PATH_TO_FILES || 'src/',
      'base_branch': process.env.TEST_BASE_BRANCH || 'master',
      'max_tokens': process.env.TEST_MAX_TOKENS || '2000',
      'temperature': process.env.TEST_TEMPERATURE || '0.3',
      'claude_api_key': process.env.CLAUDE_API_KEY || '',
      'openai_api_key': process.env.OPENAI_API_KEY || ''
    };
    
    // Debug: Log the input request and available values
    console.log(`🔍 core.getInput("${name}") called`);
    console.log(`   Available inputs:`, Object.keys(inputs));
    console.log(`   Environment variables:`, {
      TEST_LLM_PROVIDER: process.env.TEST_LLM_PROVIDER,
      TEST_PATH_TO_FILES: process.env.TEST_PATH_TO_FILES,
      TEST_BASE_BRANCH: process.env.TEST_BASE_BRANCH,
      CLAUDE_API_KEY: process.env.CLAUDE_API_KEY ? '***SET***' : 'NOT SET',
      OPENAI_API_KEY: process.env.OPENAI_API_KEY ? '***SET***' : 'NOT SET'
    });
    
    const value = inputs[name] || '';
    console.log(`   Returning: "${value}"`);
    return value;
  },
  info: (message) => console.log(`ℹ️  ${message}`),
  warning: (message) => console.log(`⚠️  ${message}`),
  error: (message) => console.log(`❌ ${message}`),
  setFailed: (message) => {
    console.log(`🚨 FAILED: ${message}`);
    process.exit(1);
  }
};

// Mock @actions/github
const mockGithub = {
  getOctokit: (token) => ({
    rest: {
      issues: {
        createComment: async (params) => {
          console.log('📝 Mock PR Comment:');
          console.log('Owner:', params.owner);
          console.log('Repo:', params.repo);
          console.log('Issue Number:', params.issue_number);
          console.log('Body:', params.body);
          return { data: { id: 123 } };
        }
      }
    }
  }),
  context: mockContext
};

// Mock node-fetch
const mockFetch = async (url, options) => {
  console.log(`🌐 Mock API Call to: ${url}`);
  console.log('Headers:', options.headers);
  console.log('Body:', options.body);
  
  // Simulate API response
  return {
    ok: true,
    json: async () => ({
      choices: [{
        message: {
          content: `This is a mock LLM response for testing purposes.

## Review Summary

🔴 **Critical Issues Found:**
- Mock security vulnerability in authentication logic
- Potential memory leak in component lifecycle

🟡 **Suggestions:**
- Consider adding error boundaries
- Improve code documentation

## Final Recommendation
❌ Do NOT merge - Critical security issues found that must be addressed.`
        }
      }],
      content: [{
        text: `This is a mock LLM response for testing purposes.

## Review Summary

🔴 **Critical Issues Found:**
- Mock security vulnerability in authentication logic
- Potential memory leak in component lifecycle

🟡 **Suggestions:**
- Consider adding error boundaries
- Improve code documentation

## Final Recommendation
❌ Do NOT merge - Critical security issues found that must be addressed.`
      }]
    })
  };
};

// Mock the modules
const originalRequire = require;
require = function(id) {
  if (id === '@actions/core') {
    return mockCore;
  }
  if (id === '@actions/github') {
    return mockGithub;
  }
  if (id === 'node-fetch') {
    return { default: mockFetch };
  }
  return originalRequire(id);
};

// Test configuration
const testConfig = {
  // Test different scenarios
  scenarios: [
    {
      name: 'Single Path Test',
      env: {
        TEST_PATH_TO_FILES: 'src/',
        TEST_LLM_PROVIDER: 'claude'
      }
    },
    {
      name: 'Multiple Paths Test',
      env: {
        TEST_PATH_TO_FILES: 'src/,packages/,components/',
        TEST_LLM_PROVIDER: 'claude'
      }
    },
    {
      name: 'OpenAI Provider Test',
      env: {
        TEST_PATH_TO_FILES: 'src/',
        TEST_LLM_PROVIDER: 'openai'
      }
    }
  ]
};

// Run tests
async function runTests() {
  console.log('🧪 Starting Local Tests for GitHub Action\n');
  
  for (const scenario of testConfig.scenarios) {
    console.log(`\n📋 Running: ${scenario.name}`);
    console.log('=' .repeat(50));
    
    // Set environment variables for this test
    Object.entries(scenario.env).forEach(([key, value]) => {
      process.env[key] = value;
    });
    
    try {
      // Import and run the action
      const actionPath = path.join(__dirname, '..', 'src', 'index.js');
      require(actionPath);
      
      console.log(`✅ ${scenario.name} completed successfully`);
    } catch (error) {
      console.log(`❌ ${scenario.name} failed:`, error.message);
    }
    
    console.log('=' .repeat(50));
  }
  
  console.log('\n🎉 All tests completed!');
}

// Run the tests
runTests().catch(console.error); 