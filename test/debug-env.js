#!/usr/bin/env node

/**
 * Debug script to test environment variable loading
 */

// Load environment variables from .env file
try {
  require('dotenv').config({ path: require('path').join(__dirname, '.env') });
  console.log('📄 Loaded environment variables from .env file');
} catch (error) {
  console.log('⚠️  No .env file found, using default environment variables');
}

console.log('\n🔍 Environment Variables Debug:');
console.log('===============================');

// Check all relevant environment variables
const envVars = [
  'TEST_LLM_PROVIDER',
  'TEST_PATH_TO_FILES', 
  'TEST_BASE_BRANCH',
  'TEST_MAX_TOKENS',
  'TEST_TEMPERATURE',
  'CLAUDE_API_KEY',
  'OPENAI_API_KEY'
];

envVars.forEach(varName => {
  const value = process.env[varName];
  if (value) {
    if (varName.includes('API_KEY')) {
      console.log(`${varName}: ***SET*** (${value.length} chars)`);
    } else {
      console.log(`${varName}: "${value}"`);
    }
  } else {
    console.log(`${varName}: NOT SET`);
  }
});

console.log('\n🎯 Testing core.getInput mock:');
console.log('=============================');

// Mock core.getInput function
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
    
    console.log(`🔍 core.getInput("${name}")`);
    console.log(`   Available inputs:`, Object.keys(inputs));
    console.log(`   Returning: "${inputs[name] || ''}"`);
    return inputs[name] || '';
  }
};

// Test all inputs
const testInputs = [
  'llm_provider',
  'path_to_files', 
  'base_branch',
  'max_tokens',
  'temperature',
  'claude_api_key',
  'openai_api_key'
];

testInputs.forEach(inputName => {
  const value = mockCore.getInput(inputName);
  console.log(`✅ ${inputName}: "${value}"`);
});

console.log('\n🎉 Environment variable test completed!'); 