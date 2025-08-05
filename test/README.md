# 🧪 Local Testing for GitHub Action

This directory contains tools for testing the GitHub Action locally before releasing.

## 📋 Quick Start

### 1. Setup Environment Variables
```bash
# Setup .env file from template
npm run test:setup

# Edit the created test/.env file with your API keys
# Then run tests
npm test
```

### 2. Run All Tests
```bash
npm test
```

### 2. Run Specific Test Scenarios
```bash
# Single path test
npm run test:single

# Multiple paths test
npm run test:multi

# OpenAI provider test
npm run test:openai

# Custom configuration test
npm run test:custom
```

### 3. Run with Custom Parameters
```bash
# Test with custom paths
TEST_PATH_TO_FILES="src/,lib/" npm run test:custom

# Test with different provider
TEST_LLM_PROVIDER="openai" npm run test:custom

# Test with custom parameters
TEST_MAX_TOKENS="4000" TEST_TEMPERATURE="0.7" npm run test:custom
```

## 🔧 Test Scenarios

### Single Path Test
- Tests the action with a single path (`src/`)
- Verifies basic functionality
- Uses Claude provider

### Multiple Paths Test
- Tests the new multi-path feature
- Uses multiple comma-separated paths
- Verifies path parsing and filtering

### OpenAI Provider Test
- Tests with OpenAI provider instead of Claude
- Verifies provider switching functionality
- Tests different API response formats

### Custom Parameters Test
- Tests with custom configuration
- Allows environment variable overrides
- Useful for testing specific scenarios

### No API Key Test
- Tests behavior when no API key is provided
- Verifies proper warning messages
- Tests graceful degradation

## 🎯 What Gets Tested

### ✅ Core Functionality
- Input parsing and validation
- Path filtering (single and multiple paths)
- Base branch detection
- LLM provider configuration

### ✅ Mock Environment
- GitHub Actions context simulation
- PR event simulation
- API key handling
- Error handling

### ✅ Output Generation
- PR comment generation
- Logging and console output
- Merge decision logic
- Status reporting

## 🔍 Test Output

The tests will show:
- Input parameters being used
- File detection and filtering
- Mock API calls
- Generated PR comments
- Final merge decisions

Example output:
```
🧪 Running test: multi-path
📋 Description: Test with multiple paths
============================================================
ℹ️  🚀 Starting LLM Code Review (GitHub Actions)...
ℹ️  🤖 Using CLAUDE LLM
ℹ️  📋 Review Details:
ℹ️    - Base Branch: main
ℹ️    - Head Ref: abc123...
ℹ️    - Review Date: 1/15/2024, 10:30:00 AM
ℹ️    - Reviewer: CLAUDE LLM
ℹ️    - Path to Files: src/, packages/, components/
ℹ️    - PR Number: 1
ℹ️  📁 Parsed paths to review: src/, packages/, components/
ℹ️  🔍 Detecting changed files...
✅ Test 'multi-path' completed successfully
============================================================
```

## 🛠️ Customizing Tests

### Environment Variables Setup

#### Option 1: Using .env file (Recommended)
```bash
# Setup environment file
npm run test:setup

# Edit test/.env with your configuration
# Then run tests
npm test
```

#### Option 2: Command line environment variables
```bash
# Test with real API keys (optional)
export CLAUDE_API_KEY="your-claude-key"
export OPENAI_API_KEY="your-openai-key"

# Test with custom configuration
export TEST_PATH_TO_FILES="src/,lib/,utils/"
export TEST_LLM_PROVIDER="openai"
export TEST_BASE_BRANCH="develop"
export TEST_MAX_TOKENS="4000"
export TEST_TEMPERATURE="0.7"

# Run test
npm run test:custom
```

### Environment Variables Reference

| Variable | Description | Default |
|----------|-------------|---------|
| `CLAUDE_API_KEY` | Claude API key for testing | - |
| `OPENAI_API_KEY` | OpenAI API key for testing | - |
| `TEST_LLM_PROVIDER` | LLM provider to test | `claude` |
| `TEST_PATH_TO_FILES` | Paths to test | `src/` |
| `TEST_BASE_BRANCH` | Base branch for testing | `develop` |
| `TEST_MAX_TOKENS` | Max tokens for LLM | `2000` |
| `TEST_TEMPERATURE` | Temperature for LLM | `0.3` |
| `GITHUB_TOKEN` | GitHub token (optional) | - |
| `TEST_SCENARIO` | Default test scenario | `single-path` |
| `TEST_VERBOSE` | Enable verbose output | `false` |

### Adding New Test Scenarios
1. Edit `test-config.json` to add new scenarios
2. Update `test/run-tests.js` to include new scenarios
3. Add new npm scripts in `package.json` if needed

## 🚨 Troubleshooting

### Common Issues

**Test fails with "Cannot find module"**
```bash
# Make sure dependencies are installed
npm install

# Rebuild the action
npm run build
```

**Mock API calls not working**
- Check that the test script is properly mocking `node-fetch`
- Verify the mock response format matches the expected API response

**Environment variables not working**
- Make sure to export variables before running tests
- Check that the variable names match the expected format

## 📝 Notes

- Tests use mock API responses to avoid real API calls
- No actual GitHub API calls are made during testing
- All file operations are simulated
- Tests run in isolation to avoid side effects

## 🎉 Next Steps

After running tests successfully:
1. Commit your changes
2. Build the action: `npm run build`
3. Create a new release tag
4. Push to GitHub
5. Create a GitHub release 