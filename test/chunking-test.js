#!/usr/bin/env node

/**
 * Dedicated test for chunking and concurrent API functionality
 * This test focuses specifically on testing the diff chunking and concurrent processing
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Load environment variables
try {
  require('dotenv').config({ path: path.join(__dirname, '.env') });
} catch (error) {
  console.log('⚠️  No .env file found');
}

// Mock environment
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

// Track API calls for testing
let apiCallCount = 0;
let chunkResponses = [];

// Mock @actions/core
const mockCore = {
  getInput: (name) => {
    const inputs = {
      'llm_provider': 'claude',
      'path_to_files': 'src/',
      'base_branch': 'master',
      'max_tokens': '2000',
      'temperature': '0.3',
      'claude_api_key': process.env.CLAUDE_API_KEY || 'test-key',
      'openai_api_key': process.env.OPENAI_API_KEY || '',
      'chunk_size': '1024', // Small chunks to force chunking
      'max_concurrent_requests': '2',
      'batch_delay_ms': '100'
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

// Mock node-fetch with chunking simulation
const mockFetch = async (url, options) => {
  apiCallCount++;
  
  // Parse request to determine chunk info
  const body = JSON.parse(options.body);
  const isChunk = body.messages && body.messages[0] && body.messages[0].content && body.messages[0].content.includes('chunk');
  
  let chunkInfo = 'single request';
  if (isChunk) {
    const match = body.messages[0].content.match(/chunk (\d+) of (\d+)/);
    if (match) {
      chunkInfo = `chunk ${match[1]}/${match[2]}`;
    }
  }
  
  console.log(`🌐 API Call #${apiCallCount} (${chunkInfo})`);
  
  // Simulate different responses for different chunks
  const responseContent = isChunk 
    ? `## Chunk ${apiCallCount} Review

🔴 **Critical Issues in this chunk:**
- Security vulnerability in chunk ${apiCallCount}
- Memory leak detected

🟡 **Suggestions:**
- Add error handling
- Improve documentation

**Chunk Decision:** ${apiCallCount % 2 === 0 ? '❌ Do NOT merge' : '✅ Safe to merge'}`
    : `## Single Request Review

🔴 **Critical Issues:**
- Overall security concerns
- Performance issues

**Decision:** ❌ Do NOT merge`;
  
  // Store chunk response for analysis
  if (isChunk) {
    chunkResponses.push({
      chunkNumber: apiCallCount,
      content: responseContent
    });
  }
  
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

// Mock modules
const originalRequire = require;
require = function(id) {
  if (id === '@actions/core') return mockCore;
  if (id === '@actions/github') return mockGithub;
  if (id === 'node-fetch') return { default: mockFetch };
  return originalRequire(id);
};

// Test the chunking functionality
async function testChunking() {
  console.log('🧪 Testing Chunking and Concurrent API Functionality\n');
  
  // Reset counters
  apiCallCount = 0;
  chunkResponses = [];
  
  try {
    // Import and run the action
    const actionPath = path.join(__dirname, '..', 'src', 'index.js');
    require(actionPath);
    
    console.log('\n📊 Test Results:');
    console.log(`✅ Total API calls: ${apiCallCount}`);
    console.log(`✅ Chunk responses collected: ${chunkResponses.length}`);
    
    // Analyze results
    if (apiCallCount > 1) {
      console.log('🔄 Chunking was successfully triggered');
      
      // Check if responses were combined
      if (chunkResponses.length > 0) {
        console.log('📋 Chunk responses were collected for combination');
        
        // Show chunk details
        chunkResponses.forEach((response, index) => {
          console.log(`   Chunk ${index + 1}: ${response.chunkNumber} - ${response.content.includes('❌') ? 'BLOCK' : 'APPROVE'}`);
        });
      }
    } else {
      console.log('📄 Single API call - chunking not needed');
    }
    
    console.log('\n🎉 Chunking test completed successfully!');
    
  } catch (error) {
    console.log(`❌ Chunking test failed:`, error.message);
    throw error;
  }
}

// Run the chunking test
testChunking().catch(console.error); 