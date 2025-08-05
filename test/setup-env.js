#!/usr/bin/env node

/**
 * Setup script to create .env file from example
 */

const fs = require('fs');
const path = require('path');

const envExamplePath = path.join(__dirname, 'env.example');
const envPath = path.join(__dirname, '.env');

function setupEnv() {
  console.log('🔧 Setting up environment variables for testing...\n');
  
  // Check if .env already exists
  if (fs.existsSync(envPath)) {
    console.log('⚠️  .env file already exists. Skipping setup.');
    console.log('   If you want to reset it, delete test/.env and run this script again.\n');
    return;
  }
  
  // Check if env.example exists
  if (!fs.existsSync(envExamplePath)) {
    console.log('❌ env.example file not found. Please create it first.\n');
    return;
  }
  
  try {
    // Copy env.example to .env
    const exampleContent = fs.readFileSync(envExamplePath, 'utf8');
    fs.writeFileSync(envPath, exampleContent);
    
    console.log('✅ Created test/.env file from env.example');
    console.log('📝 Please edit test/.env and add your API keys:');
    console.log('   - CLAUDE_API_KEY: Your Claude API key');
    console.log('   - OPENAI_API_KEY: Your OpenAI API key (optional)');
    console.log('   - Other test parameters as needed\n');
    
    console.log('💡 You can now run tests with:');
    console.log('   npm run test:single');
    console.log('   npm run test:multi');
    console.log('   npm run test:custom\n');
    
  } catch (error) {
    console.log('❌ Error creating .env file:', error.message);
  }
}

// Run setup
setupEnv(); 