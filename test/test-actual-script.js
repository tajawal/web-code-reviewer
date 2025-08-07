#!/usr/bin/env node

/**
 * Test the actual script to see what's happening in the real environment
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Set up environment variables
process.env.GITHUB_TOKEN = 'test-token';
process.env.GITHUB_SHA = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
process.env.GITHUB_REPOSITORY = 'tajawal/web-code-reviewer';
process.env.CLAUDE_API_KEY = 'test-key';

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
      'llm_provider': 'claude',
      'path_to_files': 'src/',
      'base_branch': 'master',
      'max_tokens': '2000',
      'temperature': '0.3',
      'claude_api_key': 'test-key',
      'openai_api_key': '',
      'chunk_size': '102400',
      'max_concurrent_requests': '3',
      'batch_delay_ms': '1000'
    };
    return inputs[name] || '';
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
          console.log('📝 Mock PR Comment created');
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
  
  return {
    ok: true,
    json: async () => ({
      choices: [{
        message: {
          content: `Mock response for testing`
        }
      }],
      content: [{
        text: `Mock response for testing`
      }]
    })
  };
};

// Mock the modules
const originalRequire = require;
require = function(id) {
  if (id === '@actions/core') return mockCore;
  if (id === '@actions/github') return mockGithub;
  if (id === 'node-fetch') return { default: mockFetch };
  return originalRequire(id);
};

// Run the actual script
async function testActualScript() {
  console.log('🧪 Testing Actual Script\n');
  console.log('=' .repeat(60));
  
  try {
    // Import and run the actual script
    const scriptPath = path.join(__dirname, '..', 'src', 'index.js');
    console.log(`📄 Loading script from: ${scriptPath}`);
    
    require(scriptPath);
    
    console.log('\n✅ Script executed successfully!');
  } catch (error) {
    console.log(`❌ Script failed:`, error.message);
    console.log(error.stack);
  }
}

// Run the test
testActualScript().catch(console.error); 