# 🤖 DeepReview - AI-Powered Multi-Language Code Reviewer

A GitHub Action that performs automated code reviews using Large Language Models (Claude or OpenAI) for pull requests. This action analyzes code changes across multiple programming languages and provides detailed feedback on performance, security, maintainability, and best practices with structured JSON output.

## ✨ Features

- **🌍 Multi-Language Support**: Specialized review prompts for JavaScript/TypeScript, Python, Java, and PHP
- **📊 Structured JSON Output**: Detailed analysis with severity scoring, risk factors, and confidence levels
- **🔍 Smart File Filtering**: Language-specific file detection and filtering
- **🤖 LLM Integration**: Supports both Claude Sonnet 4 and OpenAI GPT-4o-mini
- **🎯 Intelligent Merge Decisions**: Automatic merge blocking based on critical issues with confidence scoring
- **📝 Enhanced PR Comments**: Rich, categorized review results with severity indicators
- **⚡ Optimized Processing**: Intelligent chunking and rate limiting for large codebases
- **🔧 Configurable**: Customizable paths, tokens, temperature, and language settings

## 🚀 Quick Start

### Basic Usage

```yaml
name: DeepReview

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
      
      - name: DeepReview
        uses: tajawal/web-code-review@v1
        with:
          claude_api_key: ${{ secrets.CLAUDE_API_KEY }}
          language: 'js'  # JavaScript/TypeScript
          path_to_files: 'src/'
```

### Multi-Language Examples

```yaml
# JavaScript/TypeScript Review
- name: Review JavaScript Code
  uses: tajawal/web-code-review@v1
  with:
    language: 'js'
    claude_api_key: ${{ secrets.CLAUDE_API_KEY }}
    path_to_files: 'src/,components/'

# Python Review
- name: Review Python Code
  uses: tajawal/web-code-review@v1
  with:
    language: 'python'
    claude_api_key: ${{ secrets.CLAUDE_API_KEY }}
    path_to_files: 'backend/,api/'

# Java Review
- name: Review Java Code
  uses: tajawal/web-code-review@v1
  with:
    language: 'java'
    claude_api_key: ${{ secrets.CLAUDE_API_KEY }}
    path_to_files: 'src/main/java/'

# PHP Review
- name: Review PHP Code
  uses: tajawal/web-code-review@v1
  with:
    language: 'php'
    claude_api_key: ${{ secrets.CLAUDE_API_KEY }}
    path_to_files: 'app/,resources/'
```

### Advanced Configuration

```yaml
name: DeepReview

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
      
      - name: DeepReview
        uses: tajawal/web-code-review@v1
        with:
          llm_provider: 'claude'  # or 'openai'
          language: 'js'          # js, python, java, php
          claude_api_key: ${{ secrets.CLAUDE_API_KEY }}
          # openai_api_key: ${{ secrets.OPENAI_API_KEY }}  # if using OpenAI
          path_to_files: 'packages/,src/'
          base_branch: 'develop'
          max_tokens: '3000'      # Recommended: 3000-5000 for comprehensive reviews
          temperature: '0'        # Optimal for consistent analytical responses
```

## 📋 Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `llm_provider` | LLM provider to use (`claude` or `openai`) | No | `claude` |
| `language` | Programming language for code review (`js`, `python`, `java`, `php`) | No | `js` |
| `path_to_files` | Comma-separated paths to files to review (e.g., `packages/`, `src/`, `components/`) | No | `packages/` |
| `base_branch` | Base branch to compare against (auto-detected from PR if not specified) | No | `develop` |
| `max_tokens` | Maximum tokens for LLM response (recommended: 3000-5000 for comprehensive reviews) | No | `3000` |
| `temperature` | Temperature for LLM response (0.0-1.0, recommended: 0 for analytical responses) | No | `0` |
| `openai_api_key` | OpenAI API key (required if provider is `openai`) | No | - |
| `claude_api_key` | Claude API key (required if provider is `claude`) | No | - |

## 🌍 Supported Languages

### JavaScript/TypeScript (`js`)
- **File Extensions**: `.js`, `.jsx`, `.ts`, `.tsx`, `.mjs`
- **Focus Areas**: 
  - React hooks and component patterns
  - TypeScript type safety
  - Frontend performance and accessibility
  - Web security (XSS, CSRF)
  - Modern JavaScript best practices

### Python (`python`)
- **File Extensions**: `.py`, `.pyw`, `.pyx`, `.pyi`
- **Focus Areas**:
  - SQL injection prevention
  - Command injection vulnerabilities
  - Deserialization security
  - Performance optimization
  - PEP 8 compliance

### Java (`java`)
- **File Extensions**: `.java`
- **Focus Areas**:
  - SOLID principles
  - Enterprise security patterns
  - Memory management
  - Exception handling
  - Resource management

### PHP (`php`)
- **File Extensions**: `.php`
- **Focus Areas**:
  - Web security vulnerabilities
  - Database security
  - Input validation
  - Performance optimization
  - Modern PHP practices

## 📊 Enhanced Review Output

The action now provides structured JSON analysis with detailed metrics:

### Severity Scoring System
Each issue is scored across 5 dimensions:
- **Impact** (0-5): How severe the issue is
- **Exploitability** (0-5): How easy it is to exploit
- **Likelihood** (0-5): How likely the issue is to occur
- **Blast Radius** (0-5): How many systems/users are affected
- **Evidence Strength** (0-5): How strong the evidence is

**Final Severity Score**: Weighted calculation using the formula:
```
severity_score = 0.35*impact + 0.30*exploitability + 0.20*likelihood + 0.10*blast_radius + 0.05*evidence_strength
```

### Issue Categories
- **🔒 Security**: Vulnerabilities, injection attacks, authentication issues
- **⚡ Performance**: Bottlenecks, memory leaks, inefficient algorithms
- **🛠️ Maintainability**: Code complexity, readability, architectural issues
- **📚 Best Practices**: Standards violations, anti-patterns, code smells

### Confidence Scoring
- **High Confidence** (≥0.8): Strong evidence, clear recommendations
- **Medium Confidence** (0.6-0.8): Good evidence, reasonable recommendations
- **Low Confidence** (<0.6): Limited evidence, suggestions for manual review

## 🎯 Merge Decision Logic

The action automatically determines merge safety based on:

### Critical Issues Detection
- **Auto-block**: Any issue with `severity_proposed: "critical"` AND `confidence ≥ 0.6`
- **Manual review**: Critical issues with lower confidence
- **Safe to merge**: No critical issues or only suggestions

### Decision Factors
1. **JSON Analysis**: Primary decision based on structured LLM output
2. **Fallback Text Analysis**: Legacy support for non-JSON responses
3. **Confidence Thresholds**: Configurable confidence levels for blocking

## 📝 Enhanced PR Comments

### Rich Issue Display
```
🔴 SEC-01 - SECURITY (Chunk 1)
- **File**: `src/components/Login.jsx` (lines 45-52)
- **Severity Score**: 4.2/5.0
- **Confidence**: 85%
- **Risk Factors**: Impact: 4, Exploitability: 5, Likelihood: 3, Blast Radius: 4, Evidence: 4
- **Impact**: SQL injection vulnerability allows unauthorized database access
- **Fix**: Use parameterized queries with proper input validation
```

### Categorized Summary
- **🚨 Critical Issues**: High-priority security and performance problems
- **💡 Suggestions**: Improvements and best practice recommendations
- **📊 Review Metrics**: Total counts and processing statistics

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

## 🔍 Smart File Filtering

The action automatically filters files based on language and path:

### Language-Specific Filtering
- **JavaScript/TypeScript**: Only processes `.js`, `.jsx`, `.ts`, `.tsx`, `.mjs` files
- **Python**: Only processes `.py`, `.pyw`, `.pyx`, `.pyi` files
- **Java**: Only processes `.java` files
- **PHP**: Only processes `.php` files

### Path Filtering
- **Included**: Files in any of the specified paths (default: `packages/`)
- **Multiple Paths**: You can specify multiple comma-separated paths
- **Excluded**: `.json`, `.md`, `.lock`, `.test.js`, `.spec.js` files

### Path Examples:
```yaml
# Single path
path_to_files: 'src/'

# Multiple paths
path_to_files: 'packages/,src/,components/'

# Language-specific paths
path_to_files: 'src/,main/,java/'  # for Java
path_to_files: 'backend/,api/'   # for Python
path_to_files: 'app/,resources/' # for PHP
```

## ⚡ Performance Optimizations

### Intelligent Chunking
- **Default Chunk Size**: 300KB (optimized for Claude Sonnet 4)
- **Adaptive Processing**: Sequential for small batches, controlled concurrency for large batches
- **Rate Limiting**: Built-in delays and retry logic to avoid API limits

### Error Handling
- **Exponential Backoff**: Automatic retry with increasing delays
- **Token Limit Management**: Graceful handling of large files
- **Response Validation**: Ensures LLM responses are valid and complete

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

**Note**: This action requires appropriate API keys and may incur costs based on your LLM provider's pricing. The enhanced JSON output and multi-language support provide more detailed and accurate code reviews.
