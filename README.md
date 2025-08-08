# 🤖 AI Enabled Specialized Code Reviewer

A GitHub Action that performs automated code reviews using Large Language Models (Claude or OpenAI) for pull requests. This action analyzes code changes and provides detailed feedback on performance, security, maintainability, and best practices.

## ✨ Features

- **Multi-dimensional Review**: Analyzes code across Performance, Security, Maintainability, and Best Practices
- **LLM Integration**: Supports both Claude (Anthropic) and OpenAI providers
- **Smart Merge Decisions**: Automatically determines if changes are safe to merge
- **Detailed PR Comments**: Posts comprehensive review results directly to pull requests
- **Configurable Paths**: Review specific directories or file types
- **Customizable Parameters**: Adjust tokens, temperature, and other LLM settings

## 🚀 Quick Start

### Basic Usage

```yaml
name: LLM Code Review

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      
      - name: LLM Code Review
        uses: tajawal/web-code-review@v1
        with:
          claude_api_key: ${{ secrets.CLAUDE_API_KEY }}
          path_to_files: 'src/'
```

### Advanced Usage

```yaml
name: LLM Code Review

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      
      - name: LLM Code Review
        uses: tajawal/web-code-review@v1
        with:
          llm_provider: 'claude'  # or 'openai'
          claude_api_key: ${{ secrets.CLAUDE_API_KEY }}
          # openai_api_key: ${{ secrets.OPENAI_API_KEY }}  # if using OpenAI
          path_to_files: 'packages/'
          base_branch: 'develop'
          max_tokens: '2000'
          temperature: '0.3'
```

## 📋 Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `llm_provider` | LLM provider to use (`claude` or `openai`) | No | `claude` |
| `path_to_files` | Comma-separated paths to files to review (e.g., `packages/`, `src/`, `components/`) | No | `packages/` |
| `base_branch` | Base branch to compare against (auto-detected from PR if not specified) | No | `develop` |
| `max_tokens` | Maximum tokens for LLM response | No | `2000` |
| `temperature` | Temperature for LLM response (0.0-1.0) | No | `0.3` |
| `openai_api_key` | OpenAI API key (required if provider is `openai`) | No | - |
| `claude_api_key` | Claude API key (required if provider is `claude`) | No | - |

## 🔧 Configuration

### Base Branch Detection

The action automatically detects the base branch from the pull request context:

- **In PR context**: Uses the PR's base branch automatically
- **Manual override**: You can specify `base_branch` input to override the auto-detection
- **Fallback**: Uses `develop` as default if neither PR context nor input is available

### API Keys

You'll need to set up API keys for your chosen LLM provider:

#### For Claude (Anthropic):
1. Get your API key from [Anthropic Console](https://console.anthropic.com/)
2. Add it to your repository secrets as `CLAUDE_API_KEY`

#### For OpenAI:
1. Get your API key from [OpenAI Platform](https://platform.openai.com/)
2. Add it to your repository secrets as `OPENAI_API_KEY`

### Repository Secrets Setup

1. Go to your repository settings
2. Navigate to "Secrets and variables" → "Actions"
3. Add your API key:
   - **Name**: `CLAUDE_API_KEY` (for Claude) or `OPENAI_API_KEY` (for OpenAI)
   - **Value**: Your API key

## 📊 Review Categories

The action performs comprehensive reviews across four key dimensions:

### 1. Performance
- Runtime and render performance impact
- Unnecessary re-renders or memory-heavy operations
- Missing optimizations (lazy loading, caching, memoization)

### 2. Security
- Injection vulnerabilities (XSS, CSRF)
- Untrusted user input handling
- Sensitive data and access control management

### 3. Maintainability
- Code cleanliness and modularity
- Naming conventions and abstraction levels
- Code understandability and modification ease

### 4. Best Practices
- Modern frontend standards and patterns
- React hooks, component splitting, TypeScript safety
- Accessibility and code quality standards

## 🎯 Merge Decisions

The action automatically determines if changes are safe to merge based on:

- **Explicit approval phrases**: "safe to merge", "merge approved", etc.
- **Explicit blocking phrases**: "do not merge", "block merge", etc.
- **Critical issue detection**: Security vulnerabilities, memory leaks, etc.

## 📝 Output

The action provides:

1. **Detailed PR Comments**: Comprehensive review results posted directly to pull requests
2. **Console Logs**: Detailed execution logs in GitHub Actions
3. **Merge Decisions**: Automatic pass/fail based on review findings

### Example PR Comment

```
## 🤖 LLM Code Review

**Overall Assessment**: ✅ **SAFE TO MERGE** - All changes are safe and well-implemented

**Review Details:**
- **Provider**: CLAUDE
- **Files Reviewed**: 3 files
- **Review Date**: 1/15/2024, 10:30:00 AM
- **Base Branch**: main
- **Head Branch**: feature/new-component
- **Path Filter**: src/

**Files Reviewed:**
- `src/components/Button.jsx`
- `src/utils/helpers.js`
- `src/styles/button.css`

---

## 📋 **Complete LLM Review**

[Detailed LLM analysis here...]

---

**What to do next:**
1. ✅ Review the detailed analysis above
2. 🚀 Safe to merge when ready
3. 💡 Consider any optimization suggestions as future improvements

---
*This review was automatically generated by @tajawal/web-code-review*
```

## 🔍 File Filtering

The action automatically filters files to review:

- **Included**: Files in any of the specified paths (default: `packages/`)
- **Multiple Paths**: You can specify multiple comma-separated paths (e.g., `packages/,src/,components/`)
- **Excluded**: `.json`, `.md`, `.lock`, `.test.js`, `.spec.js` files

### Path Examples:
```yaml
# Single path
path_to_files: 'src/'

# Multiple paths
path_to_files: 'packages/,src/,components/'

# Mixed paths
path_to_files: 'src/components/,packages/utils/,lib/'
```

## 🛠️ Development

### Local Development

1. Clone the repository
2. Install dependencies: `npm install`
3. Build the action: `npm run build`

### Local Testing

The action includes a comprehensive local testing setup:

```bash
# Setup environment variables (first time only)
npm run test:setup

# Run all tests
npm test

# Run specific test scenarios
npm run test:single    # Single path test
npm run test:multi     # Multiple paths test
npm run test:openai    # OpenAI provider test
npm run test:custom    # Custom configuration test

# Test with custom parameters
TEST_PATH_TO_FILES="src/,lib/" npm run test:custom
```

See [test/README.md](test/README.md) for detailed testing documentation.

### Manual Testing

```bash
# Install dependencies
npm install

# Build the action
npm run build

# Test locally (requires API keys)
node dist/index.js
```

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📞 Support

For issues and questions:
- Create an issue in this repository
- Check the [GitHub Actions documentation](https://docs.github.com/en/actions)

---

**Note**: This action requires appropriate API keys and may incur costs based on your LLM provider's pricing.
