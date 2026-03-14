#!/usr/bin/env bash
set -euo pipefail

[[ "${1:-}" == "--" ]] && shift
BUMP="${1:-}"
if [ -z "$BUMP" ]; then
    echo "Usage: pnpm run release -- patch|minor|major|x.y.z" >&2; exit 1
fi

# Pre-flight: must be on main with clean working tree
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$BRANCH" != "main" ]; then
    echo "ERROR: must be on main branch (currently on $BRANCH)" >&2; exit 1
fi
if [ -n "$(git status --porcelain)" ]; then
    echo "ERROR: working tree is not clean — commit or stash changes first" >&2; exit 1
fi

# Pre-flight: run cached checks before bumping
pnpm run check

# Calculate new version
CURRENT=$(jq -r '.plugins[0].version' .claude-plugin/marketplace.json)
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"
case "$BUMP" in
    patch) VERSION="${MAJOR}.${MINOR}.$((PATCH + 1))" ;;
    minor) VERSION="${MAJOR}.$((MINOR + 1)).0" ;;
    major) VERSION="$((MAJOR + 1)).0.0" ;;
    *) VERSION="$BUMP"
       if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
           echo "Usage: pnpm run release -- patch|minor|major|x.y.z" >&2; exit 1
       fi ;;
esac

echo "dotplugins: v${CURRENT} -> v${VERSION}"
read -rp "Proceed? [y/N] " CONFIRM
[[ "$CONFIRM" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 1; }

# Bump all versions in marketplace.json
TMP=$(mktemp)
jq --arg v "$VERSION" '.plugins[].version = $v | .metadata.version = $v' .claude-plugin/marketplace.json > "$TMP" \
    && mv "$TMP" .claude-plugin/marketplace.json

# Sync to each plugin.json
for f in plugins/*/.claude-plugin/plugin.json; do
    TMP=$(mktemp)
    jq --arg v "$VERSION" '.version = $v' "$f" > "$TMP" && mv "$TMP" "$f"
done

# Post-bump validation
pnpm run validate

git add .claude-plugin/marketplace.json plugins/*/.claude-plugin/plugin.json
git commit --no-verify -m "chore: release v${VERSION}"
git push --no-verify origin main
echo "Released dotplugins v${VERSION}"
