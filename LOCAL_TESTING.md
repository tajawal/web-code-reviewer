# 🧪 Local Testing Guide

This guide explains how to test the web-code-reviewer GitHub Action locally on your machine.

## 🎯 How Git Diff Works

The action uses standard git commands to get file changes:

```bash
# Get list of changed files
git diff --name-only --diff-filter=AMRC origin/master...HEAD

# Get full diff for each file
git diff origin/master...HEAD --unified=10 -- "path/to/file.js"
```

**This works exactly the same locally and in GitHub Actions!**

## ⚙️ Prerequisites

1. **Git repository** with:
   - A branch with committed changes
   - Remote configured (usually `origin`)
   - Base branch fetched from remote

2. **Node.js** installed (v20 or higher)

3. **API Key** for your chosen LLM provider:
   - Claude: Get from https://console.anthropic.com/
   - OpenAI: Get from https://platform.openai.com/

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
npm install --save-dev dotenv
```

### 2. Create Environment File

```bash
# Copy example file
cp .env.local.example .env.local

# Edit with your API keys
nano .env.local  # or use your favorite editor
```

**Minimal `.env.local`:**
```bash
CLAUDE_API_KEY=sk-ant-api03-your-actual-key-here
```

### 3. Prepare Test Changes

```bash
# Make sure you're on a branch (not master)
git checkout -b test/local-review

# Make some changes
echo "console.log('test');" >> src/services/test.js
git add src/services/test.js
git commit -m "test: add test file"

# Verify changes exist
git diff --name-only origin/master...HEAD
```

### 4. Run the Test

```bash
# Run with default settings
node scripts/test-local.js

# Or with custom configuration
LANGUAGE=python BASE_BRANCH=develop node scripts/test-local.js
```

## 🔧 Configuration Options

You can override any setting using environment variables:

```bash
# Use OpenAI instead of Claude
LLM_PROVIDER=openai node scripts/test-local.js

# Review Python code
LANGUAGE=python node scripts/test-local.js

# Different base branch
BASE_BRANCH=develop node scripts/test-local.js

# Custom path
PATH_TO_FILES=packages/ node scripts/test-local.js

# Combine multiple options
LANGUAGE=python PATH_TO_FILES=backend/ BASE_BRANCH=main node scripts/test-local.js
```

### Available Configuration:

| Variable | Default | Description |
|----------|---------|-------------|
| `LLM_PROVIDER` | `claude` | LLM provider (`claude` or `openai`) |
| `LANGUAGE` | `js` | Language to review (`js`, `python`, `java`, `php`, `swift`, `qa_web`, `qa_android`, `qa_backend`) |
| `PATH_TO_FILES` | `src/` | Path to files to review |
| `BASE_BRANCH` | `master` | Base branch to compare against |
| `MAX_TOKENS` | `8000` | Maximum tokens for LLM response |
| `TEMPERATURE` | `0` | Temperature (0 for deterministic) |
| `TEAM` | `test-team` | Team name |
| `DEPARTMENT` | `engineering` | Department name |

## 📋 What the Test Script Does

1. **Validates environment**:
   - Checks if you're in a git repo
   - Verifies base branch exists
   - Checks for API keys
   - Detects changes to review

2. **Sets up GitHub Actions environment**:
   - Configures all required environment variables
   - Mimics GitHub Actions context
   - Sets input parameters

3. **Runs the action**:
   - Executes `src/index.js` directly
   - Uses real git commands on your repo
   - Processes your actual code changes
   - Calls the LLM API with your diff

4. **Shows results**:
   - Prints review output to console
   - Shows what would be posted as PR comment
   - Indicates if merge would be blocked

## 🐛 Troubleshooting

### "Not in a git repository"
```bash
# Make sure you're in the repo root
cd /path/to/web-code-reviewer
pwd  # Should show repo directory
```

### "Base branch not found"
```bash
# Fetch the base branch
git fetch origin master

# Verify it exists
git branch -r | grep master
```

### "No changes detected"
```bash
# Check what git sees
git diff --name-only origin/master...HEAD

# If empty, make sure you have commits
git log --oneline -5

# And that you're not on master
git branch --show-current
```

### "CLAUDE_API_KEY is required"
```bash
# Make sure .env.local exists and has your key
cat .env.local

# Key should start with sk-ant-
# Example: CLAUDE_API_KEY=sk-ant-api03-xxxxx
```

### "API Error 401 Unauthorized"
```bash
# Your API key is invalid
# Get a new one from https://console.anthropic.com/
# Update .env.local with the new key
```

### "No files match language filter"
```bash
# Check what files changed
git diff --name-only origin/master...HEAD

# Make sure they match your language
# For JS: files should end in .js, .jsx, .ts, .tsx
# Change language if needed: LANGUAGE=python node scripts/test-local.js
```

## 💡 Tips

### Test Different Scenarios

```bash
# Test with minimal changes
git checkout -b test/small-change
echo "// comment" >> src/index.js
git commit -am "test: small change"
node scripts/test-local.js

# Test with multiple files
git checkout -b test/multi-file
# ... edit multiple files ...
git commit -am "test: multiple changes"
node scripts/test-local.js

# Test with security issues
git checkout -b test/security
echo "eval(userInput)" >> src/dangerous.js
git commit -am "test: security issue"
node scripts/test-local.js
```

### Compare Providers

```bash
# Test with Claude
LLM_PROVIDER=claude node scripts/test-local.js > claude-output.txt

# Test with OpenAI (make sure OPENAI_API_KEY is set)
LLM_PROVIDER=openai node scripts/test-local.js > openai-output.txt

# Compare outputs
diff claude-output.txt openai-output.txt
```

### Test Determinism

```bash
# Run twice and compare (should be identical)
node scripts/test-local.js > run1.txt
node scripts/test-local.js > run2.txt
diff run1.txt run2.txt  # Should show no differences
```

## 📊 Understanding Output

The script shows:

1. **Configuration** - Settings being used
2. **Git diff command** - What git command is executed
3. **File detection** - Which files will be reviewed
4. **LLM interaction** - Chunks being processed
5. **Review results** - Issues found
6. **Merge decision** - Whether PR would be blocked

## 🔐 Security Notes

- **Never commit `.env.local`** - It contains your API keys!
- `.gitignore` already excludes it
- Use `.env.local.example` as a template only
- Rotate keys if accidentally committed

## 🎓 Learning More

- See `src/services/file-service.js` for git diff logic
- See `src/services/llm-service.js` for LLM interaction
- See `src/services/review-service.js` for merge decision logic
- Run tests: `npm test`
- Check code quality: `npm run lint`

## 🆘 Need Help?

If you encounter issues:

1. Check prerequisites are met
2. Review troubleshooting section
3. Verify your `.env.local` is correct
4. Check git state: `git status` and `git log`
5. Try with a fresh test branch

For persistent issues, check the GitHub Actions logs to see how it runs in CI.
