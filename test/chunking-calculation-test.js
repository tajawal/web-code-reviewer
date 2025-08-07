#!/usr/bin/env node

/**
 * Test to understand chunking calculation with large diffs
 * This test simulates the exact scenario: 337 files, 786KB total diff
 */

const fs = require('fs');
const path = require('path');

// Mock the CONFIG
const CONFIG = {
  DEFAULT_CHUNK_SIZE: 100 * 1024, // 100KB
  MAX_CONCURRENT_REQUESTS: 3,
  BATCH_DELAY_MS: 1000
};

// Mock core for logging
const mockCore = {
  info: (message) => console.log(`ℹ️  ${message}`),
  warning: (message) => console.log(`⚠️  ${message}`),
  error: (message) => console.log(`❌ ${message}`)
};

/**
 * Simulate the splitDiffIntoChunks function
 */
function splitDiffIntoChunks(diff, chunkSize) {
  console.log(`\n🔧 Testing splitDiffIntoChunks:`);
  console.log(`   Input diff size: ${diff.length} bytes (${Math.round(diff.length / 1024)}KB)`);
  console.log(`   Chunk size: ${chunkSize} bytes (${Math.round(chunkSize / 1024)}KB)`);
  
  if (!diff || diff.length === 0) {
    console.log(`   Result: Empty diff, returning empty array`);
    return [];
  }

  if (chunkSize <= 0) {
    console.log(`   Result: Invalid chunk size, returning single chunk`);
    return [diff];
  }

  const chunks = [];
  let currentChunk = '';
  let currentSize = 0;
  
  // Split by file boundaries (--- File: ... ---)
  const fileSections = diff.split(/(?=--- File: )/);
  
  console.log(`   Number of file sections: ${fileSections.length}`);
  
  for (let i = 0; i < fileSections.length; i++) {
    const section = fileSections[i];
    const sectionSize = Buffer.byteLength(section, 'utf8');
    
    console.log(`   Section ${i + 1}: ${sectionSize} bytes`);
    
    // If adding this section would exceed chunk size, start a new chunk
    if (currentSize + sectionSize > chunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk);
      console.log(`     → Started new chunk (total: ${chunks.length})`);
      currentChunk = section;
      currentSize = sectionSize;
    } else {
      currentChunk += section;
      currentSize += sectionSize;
      console.log(`     → Added to current chunk (size: ${currentSize} bytes)`);
    }
  }
  
  // Add the last chunk if it has content
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
    console.log(`   → Added final chunk (total: ${chunks.length})`);
  }
  
  console.log(`   Result: ${chunks.length} chunks created`);
  return chunks;
}

/**
 * Generate a realistic diff with 337 files
 */
function generateTestDiff() {
  console.log('📝 Generating test diff with 337 files...');
  
  let diff = '';
  const totalFiles = 337;
  const targetSize = 786 * 1024; // 786KB
  const avgFileSize = Math.floor(targetSize / totalFiles);
  
  console.log(`   Target total size: ${targetSize} bytes (${Math.round(targetSize / 1024)}KB)`);
  console.log(`   Average file size: ${avgFileSize} bytes`);
  
  for (let i = 1; i <= totalFiles; i++) {
    const fileName = `src/components/Component${i}.js`;
    const fileContent = generateFileContent(avgFileSize);
    
    diff += `--- File: ${fileName} ---\n`;
    diff += fileContent;
    diff += '\n';
  }
  
  const actualSize = Buffer.byteLength(diff, 'utf8');
  console.log(`   Actual diff size: ${actualSize} bytes (${Math.round(actualSize / 1024)}KB)`);
  
  return diff;
}

/**
 * Generate file content of approximately the given size
 */
function generateFileContent(targetSize) {
  const baseContent = `import React from 'react';

export default function Component() {
  const [state, setState] = React.useState(null);
  
  React.useEffect(() => {
    // Component logic here
    console.log('Component mounted');
  }, []);
  
  return (
    <div className="component">
      <h1>Component Title</h1>
      <p>This is a test component with some content.</p>
      <button onClick={() => setState(!state)}>
        Toggle State
      </button>
    </div>
  );
}`;
  
  const baseSize = Buffer.byteLength(baseContent, 'utf8');
  const repetitions = Math.ceil(targetSize / baseSize);
  
  let content = '';
  for (let i = 0; i < repetitions; i++) {
    content += baseContent + '\n';
  }
  
  // Trim to exact size
  while (Buffer.byteLength(content, 'utf8') > targetSize) {
    content = content.slice(0, -1);
  }
  
  return content;
}

/**
 * Test different chunk sizes
 */
function testChunkSizes(diff) {
  console.log('\n🧪 Testing different chunk sizes:');
  
  const testSizes = [
    { name: '50KB', size: 50 * 1024 },
    { name: '100KB', size: 100 * 1024 },
    { name: '200KB', size: 200 * 1024 },
    { name: '500KB', size: 500 * 1024 },
    { name: '1MB', size: 1024 * 1024 }
  ];
  
  testSizes.forEach(test => {
    console.log(`\n📦 Testing ${test.name} chunks:`);
    const chunks = splitDiffIntoChunks(diff, test.size);
    
    console.log(`   Expected chunks: ~${Math.ceil(diff.length / test.size)}`);
    console.log(`   Actual chunks: ${chunks.length}`);
    
    // Calculate chunk sizes
    const chunkSizes = chunks.map(chunk => Buffer.byteLength(chunk, 'utf8'));
    const avgChunkSize = chunkSizes.reduce((a, b) => a + b, 0) / chunkSizes.length;
    const maxChunkSize = Math.max(...chunkSizes);
    const minChunkSize = Math.min(...chunkSizes);
    
    console.log(`   Average chunk size: ${Math.round(avgChunkSize / 1024)}KB`);
    console.log(`   Min chunk size: ${Math.round(minChunkSize / 1024)}KB`);
    console.log(`   Max chunk size: ${Math.round(maxChunkSize / 1024)}KB`);
  });
}

/**
 * Test the problematic scenario (0KB chunks)
 */
function testProblematicScenario(diff) {
  console.log('\n🚨 Testing problematic scenario (0KB chunks):');
  
  // Test with 0 chunk size
  console.log('\n📦 Testing with chunk size = 0:');
  const chunksZero = splitDiffIntoChunks(diff, 0);
  console.log(`   Result: ${chunksZero.length} chunks`);
  
  // Test with undefined chunk size
  console.log('\n📦 Testing with undefined chunk size:');
  const chunksUndefined = splitDiffIntoChunks(diff, undefined);
  console.log(`   Result: ${chunksUndefined.length} chunks`);
  
  // Test with null chunk size
  console.log('\n📦 Testing with null chunk size:');
  const chunksNull = splitDiffIntoChunks(diff, null);
  console.log(`   Result: ${chunksNull.length} chunks`);
}

/**
 * Test file section splitting
 */
function testFileSectionSplitting(diff) {
  console.log('\n🔍 Testing file section splitting:');
  
  const fileSections = diff.split(/(?=--- File: )/);
  console.log(`   Total file sections: ${fileSections.length}`);
  
  // Show first few sections
  for (let i = 0; i < Math.min(5, fileSections.length); i++) {
    const section = fileSections[i];
    const size = Buffer.byteLength(section, 'utf8');
    console.log(`   Section ${i + 1}: ${size} bytes`);
  }
  
  if (fileSections.length > 5) {
    console.log(`   ... and ${fileSections.length - 5} more sections`);
  }
}

/**
 * Main test function
 */
async function runChunkingTest() {
  console.log('🧪 Starting Chunking Calculation Test\n');
  console.log('=' .repeat(60));
  
  // Generate test diff
  const diff = generateTestDiff();
  
  // Test file section splitting
  testFileSectionSplitting(diff);
  
  // Test different chunk sizes
  testChunkSizes(diff);
  
  // Test problematic scenarios
  testProblematicScenario(diff);
  
  console.log('\n' + '=' .repeat(60));
  console.log('✅ Chunking calculation test completed!');
}

// Run the test
runChunkingTest().catch(console.error); 