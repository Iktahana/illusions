# Claude Code Review Setup Guide

This guide will help you complete the setup for automated PR reviews using Claude Code.

## ✅ What Has Been Configured

The following files have been created and configured:

1. **`CLAUDE.md`** - Code review standards and guidelines
2. **`.github/workflows/claude-review.yml`** - GitHub Actions workflow

## 🔧 Required Configuration Steps

### Step 1: Install Claude GitHub App

Choose one of the following methods:

#### Option A: Quick Install (Recommended)

If you have Claude CLI installed locally:

```bash
cd /Users/iktahana/Cursor/illusions
claude /install-github-app
```

This command will:
- Guide you through installing the GitHub App
- Automatically configure necessary permissions
- Set up the integration with your repository

**Prerequisites**:
- You must be a repository admin
- Claude CLI must be installed on your machine

#### Option B: Manual Install

1. Visit https://github.com/apps/claude
2. Click "Install" or "Configure"
3. Select your account/organization
4. Choose "Only select repositories" and select `illusions`
5. Grant the following permissions:
   - **Contents**: Read & Write
   - **Issues**: Read & Write
   - **Pull requests**: Read & Write
6. Click "Install"

### Step 2: Configure Anthropic API Key

1. Get your API key:
   - Visit https://console.anthropic.com
   - Navigate to "API Keys" section
   - Create a new API key (or use existing one)
   - Copy the key (it starts with `sk-ant-`)

2. Add the API key to GitHub Secrets:
   - Go to your repository on GitHub
   - Navigate to **Settings → Secrets and variables → Actions**
   - Click "New repository secret"
   - Set:
     - **Name**: `ANTHROPIC_API_KEY`
     - **Secret**: Paste your API key
   - Click "Add secret"

### Step 3: Verify Configuration

1. Create a test branch:
   ```bash
   git checkout -b test-claude-review
   ```

2. Make a small change (e.g., add a comment to a file):
   ```bash
   echo "// Test comment" >> README.md
   git add README.md
   git commit -m "test: verify Claude review setup"
   git push origin test-claude-review
   ```

3. Create a Pull Request on GitHub

4. Check the "Actions" tab to see if the workflow runs

5. Claude should post a review comment on your PR within a few minutes

## 🎯 What to Expect

### When a PR is Created or Updated

The Claude Code Review workflow will automatically:

1. **Analyze the PR** - Review all changed files
2. **Check Security** - Scan for vulnerabilities, hardcoded secrets, XSS risks
3. **Check Performance** - Verify React hooks, detect memory leaks
4. **Check Languages** - Ensure only English and Japanese are used (no Chinese, Korean)
5. **Suggest Japanese Improvements** - Provide advisory feedback on Japanese text naturalness
6. **Check Code Style** - Verify TypeScript types, naming conventions, etc.
7. **Post Review Comment** - Add a structured review comment on the PR

### Review Comment Structure

Claude will post a comment with the following sections:

```markdown
## 🔒 Security Issues
[Critical security findings]

## ⚡ Performance Issues
[Performance concerns]

## 🌐 Language Violations (CRITICAL)
[Prohibited language usage]

## 💡 Japanese Quality Suggestions (Advisory)
[Japanese phrasing improvements]

## 📝 Code Style Issues
[Style and convention issues]

## ✅ Summary
- Status: Approved / Needs Changes / Blocked
- Critical Issues: X
- High Priority: X
- Medium/Low: X
- Suggestions: X
```

## 🔄 Updating the Configuration

### Changing the Model

To switch between models, edit `.github/workflows/claude-review.yml`:

```yaml
claude_args: "--max-turns 5 --model MODEL_NAME"
```

Available models:
- `claude-3-5-haiku-20241022` (Current - Fast & Cost-effective)
- `claude-3-5-sonnet-20241022` (More thorough analysis)
- `claude-opus-4-5-20251101` (Most powerful)

### Adjusting Max Turns

Increase for deeper analysis (uses more tokens):
```yaml
claude_args: "--max-turns 10 --model claude-3-5-haiku-20241022"
```

### Customizing Review Focus

Edit the `prompt` section in `.github/workflows/claude-review.yml` to emphasize different areas.

### Updating Review Standards

Edit `CLAUDE.md` to add or modify review criteria.

## ⚠️ Troubleshooting

### Claude is not responding to PRs

1. **Check GitHub Actions logs**:
   - Go to your PR
   - Click "Checks" tab
   - Look for "Claude Code Review" workflow
   - Check logs for errors

2. **Verify API Key**:
   - Ensure `ANTHROPIC_API_KEY` is correctly set in repository secrets
   - Check that the key is valid at https://console.anthropic.com

3. **Verify GitHub App installation**:
   - Go to https://github.com/apps/claude
   - Check if it's installed on your repository
   - Verify permissions are granted

4. **Check workflow file syntax**:
   - Ensure `.github/workflows/claude-review.yml` has no YAML syntax errors
   - GitHub will show a warning if the workflow file is invalid

### Review is incomplete or too shallow

- Increase `max-turns` in `claude_args`
- Consider upgrading to Sonnet model
- Check if the PR is very large (may hit token limits)

### Authentication errors

- Verify API key is correct and active
- Check if you have sufficient API credits
- Ensure the key has not expired

## 📊 Cost Estimation

With Haiku model (`claude-3-5-haiku-20241022`):

- **Input**: $0.80 per million tokens
- **Output**: $4.00 per million tokens
- **Typical PR review**: 10-50K tokens (depends on code size)
- **Estimated cost per review**: $0.01 - $0.05

With Max Plan (current):
- Unlimited reviews within plan limits

After switching to $100 plan:
- Approximately 300M tokens per month
- Can handle 5,000-30,000 PR reviews per month

## 📝 Notes

- The workflow only runs on PR open and synchronize events (not on every commit)
- Claude respects the standards defined in `CLAUDE.md`
- Japanese quality checks are advisory only (not blocking)
- Review focuses are: Security, Performance, Language compliance, Code style

## 🆘 Support

If you encounter issues:

1. Check GitHub Actions logs first
2. Verify all configuration steps above
3. Review the [Claude Code documentation](https://code.claude.com/docs/en/github-actions)
4. Check [claude-code-action repository](https://github.com/anthropics/claude-code-action) for known issues

---

**Setup completed!** 🎉

Once you complete Step 1 and Step 2, your automated PR reviews will be ready to go.
