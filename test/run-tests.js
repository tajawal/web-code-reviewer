#!/usr/bin/env node

/**
 * Simple test runner for the GitHub Action
 * Usage: node test/run-tests.js [scenario]
 */

const { spawn } = require('child_process');
const path = require('path');

// Load environment variables from .env file
try {
  require('dotenv').config({ path: path.join(__dirname, '.env') });
  console.log('📄 Loaded environment variables from .env file');
} catch (error) {
  console.log('⚠️  No .env file found, using default environment variables');
}

const scenarios = {
  'single-path': {
    description: 'Test with single path',
    env: {
      TEST_PATH_TO_FILES: 'src/',
      TEST_LLM_PROVIDER: 'claude'
    }
  },
  'multi-path': {
    description: 'Test with multiple paths',
    env: {
      TEST_PATH_TO_FILES: 'src/,packages/,components/',
      TEST_LLM_PROVIDER: 'claude'
    }
  },
  'openai': {
    description: 'Test with OpenAI provider',
    env: {
      TEST_PATH_TO_FILES: 'src/',
      TEST_LLM_PROVIDER: 'openai'
    }
  },
  'chunking-small': {
    description: 'Test chunking with small chunks',
    env: {
      TEST_PATH_TO_FILES: 'src/',
      TEST_LLM_PROVIDER: 'claude',
      TEST_CHUNK_SIZE: '1024',
      TEST_MAX_CONCURRENT_REQUESTS: '2',
      TEST_BATCH_DELAY_MS: '500'
    }
  },
  'chunking-high-concurrency': {
    description: 'Test chunking with high concurrency',
    env: {
      TEST_PATH_TO_FILES: 'src/',
      TEST_LLM_PROVIDER: 'claude',
      TEST_CHUNK_SIZE: '2048',
      TEST_MAX_CONCURRENT_REQUESTS: '5',
      TEST_BATCH_DELAY_MS: '200'
    }
  },
  'chunking-openai': {
    description: 'Test chunking with OpenAI provider',
    env: {
      TEST_PATH_TO_FILES: 'src/',
      TEST_LLM_PROVIDER: 'openai',
      TEST_CHUNK_SIZE: '5120',
      TEST_MAX_CONCURRENT_REQUESTS: '3',
      TEST_BATCH_DELAY_MS: '1000'
    }
  },
  'custom': {
    description: 'Test with custom configuration',
    env: {
      TEST_PATH_TO_FILES: process.env.TEST_PATH_TO_FILES || 'src/',
      TEST_LLM_PROVIDER: process.env.TEST_LLM_PROVIDER || 'claude',
      TEST_BASE_BRANCH: process.env.TEST_BASE_BRANCH || 'master',
      TEST_MAX_TOKENS: process.env.TEST_MAX_TOKENS || '2000',
      TEST_TEMPERATURE: process.env.TEST_TEMPERATURE || '0.3',
      TEST_CHUNK_SIZE: process.env.TEST_CHUNK_SIZE || '102400',
      TEST_MAX_CONCURRENT_REQUESTS: process.env.TEST_MAX_CONCURRENT_REQUESTS || '3',
      TEST_BATCH_DELAY_MS: process.env.TEST_BATCH_DELAY_MS || '1000'
    }
  }
};

function runTest(scenarioName) {
  const scenario = scenarios[scenarioName];
  
  if (!scenario) {
    console.log('❌ Unknown scenario:', scenarioName);
    console.log('\nAvailable scenarios:');
    Object.keys(scenarios).forEach(name => {
      console.log(`  - ${name}: ${scenarios[name].description}`);
    });
    process.exit(1);
  }
  
  console.log(`🧪 Running test: ${scenarioName}`);
  console.log(`📋 Description: ${scenario.description}`);
  console.log('=' .repeat(60));
  
  // Set environment variables
  Object.entries(scenario.env).forEach(([key, value]) => {
    process.env[key] = value;
    console.log(`🔧 Set ${key} = "${value}"`);
  });
  
  // Debug: Show all relevant environment variables
  console.log('\n🔍 Environment variables after setting:');
  console.log('   TEST_LLM_PROVIDER:', process.env.TEST_LLM_PROVIDER);
  console.log('   TEST_PATH_TO_FILES:', process.env.TEST_PATH_TO_FILES);
  console.log('   TEST_BASE_BRANCH:', process.env.TEST_BASE_BRANCH);
  console.log('   TEST_CHUNK_SIZE:', process.env.TEST_CHUNK_SIZE);
  console.log('   TEST_MAX_CONCURRENT_REQUESTS:', process.env.TEST_MAX_CONCURRENT_REQUESTS);
  console.log('   TEST_BATCH_DELAY_MS:', process.env.TEST_BATCH_DELAY_MS);
  console.log('   CLAUDE_API_KEY:', process.env.CLAUDE_API_KEY ? '***SET***' : 'NOT SET');
  console.log('   OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? '***SET***' : 'NOT SET');
  console.log('');
  
  // Run the test
  const testScript = path.join(__dirname, 'local-test.js');
  const child = spawn('node', [testScript], {
    stdio: 'inherit',
    env: { ...process.env } // Ensure we pass all environment variables
  });
  
  child.on('close', (code) => {
    console.log('=' .repeat(60));
    if (code === 0) {
      console.log(`✅ Test '${scenarioName}' completed successfully`);
    } else {
      console.log(`❌ Test '${scenarioName}' failed with code ${code}`);
    }
  });
}

// Get scenario from command line arguments
const scenario = process.argv[2] || 'single-path';

if (scenario === '--help' || scenario === '-h') {
  console.log('🧪 GitHub Action Local Test Runner');
  console.log('');
  console.log('Usage: node test/run-tests.js [scenario]');
  console.log('');
  console.log('Available scenarios:');
  Object.entries(scenarios).forEach(([name, config]) => {
    console.log(`  ${name}: ${config.description}`);
  });
  console.log('');
  console.log('Examples:');
  console.log('  node test/run-tests.js single-path');
  console.log('  node test/run-tests.js multi-path');
  console.log('  node test/run-tests.js openai');
  console.log('  TEST_PATH_TO_FILES="src/,lib/" node test/run-tests.js custom');
  process.exit(0);
}

runTest(scenario); 