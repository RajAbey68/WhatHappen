#!/usr/bin/env bash
# ==============================================================================
# Multi-Repo & Hermes Dev Server Quality Gate Deployment Script
# Automatically deploys the 5-tier test harness to any target repo or remote server
# ==============================================================================
set -e

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1}"

if [ -z "$TARGET" ]; then
  echo "Usage:"
  echo "  1. Local Repo:   ./scripts/deploy-quality-harness-to-all-repos.sh /Users/rajabey/code/nextstay"
  echo "  2. Hermes Server: ./scripts/deploy-quality-harness-to-all-repos.sh user@hermes-dev-server:/path/to/repo"
  exit 1
fi

# Check if target is a remote SSH destination (e.g. user@hermes:... or hermes:...)
if [[ "$TARGET" =~ : ]]; then
  REMOTE_HOST="${TARGET%%:*}"
  REMOTE_PATH="${TARGET#*:}"

  echo "🌐 Deploying Standard Quality Harness to Hermes Dev Server: $REMOTE_HOST ($REMOTE_PATH)"
  
  # Create remote directories
  ssh "$REMOTE_HOST" "mkdir -p '$REMOTE_PATH/scripts' '$REMOTE_PATH/.github/workflows' '$REMOTE_PATH/.agents/rules' '$REMOTE_PATH/.cursor/rules'"

  # Copy assets over scp/rsync
  scp "$SOURCE_DIR/scripts/quality-gate.sh" "$REMOTE_HOST:$REMOTE_PATH/scripts/"
  scp "$SOURCE_DIR/.coderabbit.yaml" "$REMOTE_HOST:$REMOTE_PATH/"
  scp "$SOURCE_DIR/.github/workflows/test-harness.yml" "$REMOTE_HOST:$REMOTE_PATH/.github/workflows/"
  scp "$SOURCE_DIR/.agents/rules/standard-test-management-process.md" "$REMOTE_HOST:$REMOTE_PATH/.agents/rules/"
  scp "$SOURCE_DIR/.cursor/rules/quality-gate.mdc" "$REMOTE_HOST:$REMOTE_PATH/.cursor/rules/"

  # Set remote permissions
  ssh "$REMOTE_HOST" "chmod +x '$REMOTE_PATH/scripts/quality-gate.sh'"
  
  echo "✅ Deployed to Hermes Dev Server successfully!"
else
  TARGET_DIR="$TARGET"
  echo "🚀 Deploying Standard Quality Harness to Local Repo: $TARGET_DIR"

  # 1. Ensure target directories exist
  mkdir -p "$TARGET_DIR/scripts"
  mkdir -p "$TARGET_DIR/.github/workflows"
  mkdir -p "$TARGET_DIR/.agents/rules"
  mkdir -p "$TARGET_DIR/.cursor/rules"

  # 2. Copy core harness assets
  cp "$SOURCE_DIR/scripts/quality-gate.sh" "$TARGET_DIR/scripts/"
  cp "$SOURCE_DIR/.coderabbit.yaml" "$TARGET_DIR/"
  cp "$SOURCE_DIR/.github/workflows/test-harness.yml" "$TARGET_DIR/.github/workflows/"
  cp "$SOURCE_DIR/.agents/rules/standard-test-management-process.md" "$TARGET_DIR/.agents/rules/"
  cp "$SOURCE_DIR/.cursor/rules/quality-gate.mdc" "$TARGET_DIR/.cursor/rules/"

  # 3. Make scripts executable
  chmod +x "$TARGET_DIR/scripts/quality-gate.sh"

  echo "✅ Standard test harness assets copied locally."
fi

echo "👉 Next step in target repo:"
echo "   npm install --save-dev husky"
echo "   npx husky init"
echo "   echo 'npm run quality-gate' > .husky/pre-commit"
echo "   chmod +x .husky/pre-commit"
echo "   Add '\"quality-gate\": \"bash scripts/quality-gate.sh\"' to package.json"
