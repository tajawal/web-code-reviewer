#!/usr/bin/env node

/**
 * Debug test for the specific chunking issue
 * This test reproduces the exact problem: 338 chunks with 0KB each
 */

// Mock the exact CONFIG from the main file
const CONFIG = {
  DEFAULT_CHUNK_SIZE: 100 * 1024, // 100KB default chunk size
  MAX_CONCURRENT_REQUESTS: 3,
  BATCH_DELAY_MS: 1000
};

// Mock core
const core = {
  info: (message) => console.log(`ℹ️  ${message}`),
  warning: (message) => console.log(`⚠️  ${message}`),
  error: (message) => console.log(`❌ ${message}`)
};

/**
 * Exact copy of the splitDiffIntoChunks function from the main file
 */
function splitDiffIntoChunks(diff, maxChunkSize = null) {
  console.log(`\n🔧 splitDiffIntoChunks called:`);
  console.log(`   maxChunkSize parameter: ${maxChunkSize}`);
  console.log(`   CONFIG.DEFAULT_CHUNK_SIZE: ${CONFIG.DEFAULT_CHUNK_SIZE}`);
  
  const chunkSize = maxChunkSize || CONFIG.DEFAULT_CHUNK_SIZE;
  console.log(`   final chunkSize: ${chunkSize}`);
  
  if (!diff || diff.length === 0) {
    console.log(`   Result: Empty diff, returning empty array`);
    return [];
  }

  // Ensure chunk size is reasonable
  if (chunkSize <= 0) {
    console.log(`   Result: Invalid chunk size: ${chunkSize}, using default: ${CONFIG.DEFAULT_CHUNK_SIZE}`);
    return [diff]; // Return as single chunk if chunk size is invalid
  }

  const chunks = [];
  let currentChunk = '';
  let currentSize = 0;
  
  // Split by file boundaries (--- File: ... ---)
  const fileSections = diff.split(/(?=--- File: )/);
  
  console.log(`   Number of file sections: ${fileSections.length}`);
  
  for (const section of fileSections) {
    const sectionSize = Buffer.byteLength(section, 'utf8');
    
    // If adding this section would exceed chunk size, start a new chunk
    if (currentSize + sectionSize > chunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentChunk = section;
      currentSize = sectionSize;
    } else {
      currentChunk += section;
      currentSize += sectionSize;
    }
  }
  
  // Add the last chunk if it has content
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }
  
  console.log(`   Result: ${chunks.length} chunks (max ${Math.round(chunkSize / 1024)}KB each)`);
  return chunks;
}

/**
 * Test the exact scenario from your logs
 */
function testExactScenario() {
  console.log('🧪 Testing Exact Scenario: 337 files, 786KB diff\n');
  
  // Create a realistic diff with 337 files
  let diff = '';
  const totalFiles = 337;
  const targetSize = 786 * 1024; // 786KB
  const avgFileSize = Math.floor(targetSize / totalFiles);
  
  console.log(`📝 Creating diff with:`);
  console.log(`   Files: ${totalFiles}`);
  console.log(`   Target size: ${targetSize} bytes (${Math.round(targetSize / 1024)}KB)`);
  console.log(`   Average file size: ${avgFileSize} bytes`);
  
  // Generate the diff
  for (let i = 1; i <= totalFiles; i++) {
    const fileName = `src/components/Component${i}.js`;
    const fileContent = `import React from 'react';

export default function Component${i}() {
  const [state, setState] = React.useState(null);
  
  React.useEffect(() => {
    console.log('Component ${i} mounted');
  }, []);
  
  return (
    <div className="component-${i}">
      <h1>Component ${i}</h1>
      <p>This is component ${i} with some content.</p>
      <button onClick={() => setState(!state)}>
        Toggle State
      </button>
    </div>
  );
}`;
    
    diff += `--- File: ${fileName} ---\n`;
    diff += fileContent;
    diff += '\n';
  }
  
  const actualSize = Buffer.byteLength(diff, 'utf8');
  console.log(`   Actual diff size: ${actualSize} bytes (${Math.round(actualSize / 1024)}KB)`);
  
  // Test with different chunk sizes
  console.log('\n📦 Testing chunking scenarios:');
  
  // Test 1: With CONFIG default (should work)
  console.log('\n1️⃣ Testing with CONFIG.DEFAULT_CHUNK_SIZE:');
  const chunks1 = splitDiffIntoChunks(diff, CONFIG.DEFAULT_CHUNK_SIZE);
  
  // Test 2: With 0 chunk size (should trigger the issue)
  console.log('\n2️⃣ Testing with chunk size = 0:');
  const chunks2 = splitDiffIntoChunks(diff, 0);
  
  // Test 3: With null chunk size (should use CONFIG default)
  console.log('\n3️⃣ Testing with chunk size = null:');
  const chunks3 = splitDiffIntoChunks(diff, null);
  
  // Test 4: With undefined chunk size (should use CONFIG default)
  console.log('\n4️⃣ Testing with chunk size = undefined:');
  const chunks4 = splitDiffIntoChunks(diff, undefined);
  
  // Summary
  console.log('\n📊 Summary:');
  console.log(`   Test 1 (CONFIG default): ${chunks1.length} chunks`);
  console.log(`   Test 2 (0 size): ${chunks2.length} chunks`);
  console.log(`   Test 3 (null): ${chunks3.length} chunks`);
  console.log(`   Test 4 (undefined): ${chunks4.length} chunks`);
  
  // Expected vs actual
  const expectedChunks = Math.ceil(actualSize / CONFIG.DEFAULT_CHUNK_SIZE);
  console.log(`\n🎯 Expected chunks with ${Math.round(CONFIG.DEFAULT_CHUNK_SIZE / 1024)}KB size: ~${expectedChunks}`);
  
  if (chunks1.length === expectedChunks) {
    console.log('✅ Test 1: Working correctly!');
  } else {
    console.log(`❌ Test 1: Expected ~${expectedChunks}, got ${chunks1.length}`);
  }
  
  if (chunks2.length === 1) {
    console.log('✅ Test 2: Correctly handled 0 chunk size');
  } else {
    console.log(`❌ Test 2: Expected 1 chunk, got ${chunks2.length}`);
  }
}

/**
 * Test the constructor logic
 */
function testConstructorLogic() {
  console.log('\n🔧 Testing Constructor Logic:');
  
  // Simulate the constructor logic
  console.log('   CONFIG.DEFAULT_CHUNK_SIZE:', CONFIG.DEFAULT_CHUNK_SIZE);
  
  // Test direct assignment
  const chunkSize1 = CONFIG.DEFAULT_CHUNK_SIZE;
  console.log('   Direct assignment:', chunkSize1);
  
  // Test with parseInt
  const chunkSize2 = parseInt('102400') || CONFIG.DEFAULT_CHUNK_SIZE;
  console.log('   parseInt("102400"):', chunkSize2);
  
  // Test with parseInt of invalid value
  const chunkSize3 = parseInt('invalid') || CONFIG.DEFAULT_CHUNK_SIZE;
  console.log('   parseInt("invalid"):', chunkSize3);
  
  // Test with parseInt of 0
  const chunkSize4 = parseInt('0') || CONFIG.DEFAULT_CHUNK_SIZE;
  console.log('   parseInt("0"):', chunkSize4);
  
  // Test with parseInt of empty string
  const chunkSize5 = parseInt('') || CONFIG.DEFAULT_CHUNK_SIZE;
  console.log('   parseInt(""):', chunkSize5);
}

// Run the tests
console.log('🚀 Starting Debug Test for Chunking Issue\n');
console.log('=' .repeat(60));

testConstructorLogic();
testExactScenario();

console.log('\n' + '=' .repeat(60));
console.log('✅ Debug test completed!'); 