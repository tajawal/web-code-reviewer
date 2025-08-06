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
      'openai_api_key': process.env.OPENAI_API_KEY || '',
      'chunk_size': process.env.TEST_CHUNK_SIZE || '102400',
      'max_concurrent_requests': process.env.TEST_MAX_CONCURRENT_REQUESTS || '3',
      'batch_delay_ms': process.env.TEST_BATCH_DELAY_MS || '1000'
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

// Mock node-fetch with chunking support
let apiCallCount = 0;
const mockFetch = async (url, options) => {
  apiCallCount++;
  console.log(`🌐 Mock API Call #${apiCallCount} to: ${url}`);
  console.log('Headers:', options.headers);
  
  // Parse the request body to check if it's a chunk
  const body = JSON.parse(options.body);
  const isChunk = body.messages && body.messages[0] && body.messages[0].content && body.messages[0].content.includes('chunk');
  
  console.log(`📦 This is ${isChunk ? 'a chunked request' : 'a single request'}`);
  if (isChunk) {
    console.log(`   Chunk info: ${body.messages[0].content.match(/chunk (\d+) of (\d+)/)?.[0] || 'unknown chunk'}`);
  }
  
  // Simulate API response with different content for chunks
  const responseContent = isChunk 
    ? `This is a mock LLM response for chunk ${apiCallCount} of the diff.

## Chunk Review Summary

🔴 **Critical Issues Found in this chunk:**
- Mock security vulnerability in chunk ${apiCallCount}
- Potential memory leak in component lifecycle

🟡 **Suggestions for this chunk:**
- Consider adding error boundaries
- Improve code documentation

## Chunk Recommendation
${apiCallCount % 2 === 0 ? '❌ Do NOT merge' : '✅ Safe to merge'} - Issues found in this chunk.`
    : `This is a mock LLM response for testing purposes.

## Review Summary

🔴 **Critical Issues Found:**
- Mock security vulnerability in authentication logic
- Potential memory leak in component lifecycle

🟡 **Suggestions:**
- Consider adding error boundaries
- Improve code documentation

## Final Recommendation
❌ Do NOT merge - Critical security issues found that must be addressed.`;
  
  return {
    ok: true,
    json: async () => ({
      choices: [{
        message: {
          content: responseContent
        }
      }],
      content: [{
        text: responseContent
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
    },
    {
      name: 'Chunking Test - Small Chunks',
      env: {
        TEST_PATH_TO_FILES: 'src/',
        TEST_LLM_PROVIDER: 'claude',
        TEST_CHUNK_SIZE: '1024', // 1KB chunks to force chunking
        TEST_MAX_CONCURRENT_REQUESTS: '2',
        TEST_BATCH_DELAY_MS: '500'
      }
    },
    {
      name: 'Chunking Test - High Concurrency',
      env: {
        TEST_PATH_TO_FILES: 'src/',
        TEST_LLM_PROVIDER: 'claude',
        TEST_CHUNK_SIZE: '2048', // 2KB chunks
        TEST_MAX_CONCURRENT_REQUESTS: '5',
        TEST_BATCH_DELAY_MS: '200'
      }
    },
    {
      name: 'Chunking Test - OpenAI',
      env: {
        TEST_PATH_TO_FILES: 'src/',
        TEST_LLM_PROVIDER: 'openai',
        TEST_CHUNK_SIZE: '5120', // 5KB chunks
        TEST_MAX_CONCURRENT_REQUESTS: '3',
        TEST_BATCH_DELAY_MS: '1000'
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
    
    // Reset API call counter for each test
    apiCallCount = 0;
    
    // Set environment variables for this test
    Object.entries(scenario.env).forEach(([key, value]) => {
      process.env[key] = value;
    });
    
    try {
      // Import and run the action
      const actionPath = path.join(__dirname, '..', 'src', 'index.js');
      require(actionPath);
      
      console.log(`✅ ${scenario.name} completed successfully`);
      console.log(`📊 Total API calls made: ${apiCallCount}`);
      
      // Check if chunking was used
      if (apiCallCount > 1) {
        console.log(`🔄 Chunking was used - ${apiCallCount} chunks processed`);
      } else if (apiCallCount === 1) {
        console.log(`📄 Single API call - no chunking needed`);
      }
      
    } catch (error) {
      console.log(`❌ ${scenario.name} failed:`, error.message);
    }
    
    console.log('=' .repeat(50));
  }
  
  console.log('\n🎉 All tests completed!');
}

// Run the tests
runTests().catch(console.error); 