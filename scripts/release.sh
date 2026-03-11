#!/usr/bin/env bash
set -euo pipefail
umask 077

# Parse arguments: supports three forms:
#   pnpm run release -- <bump>               (bumps all plugins + metadata)
#   pnpm run release -- all <bump>            (bumps all plugins + metadata)
#   pnpm run release -- <plugin-name> <bump>  (bumps only the named plugin)
ARG1="${1:-}"
ARG2="${2:-}"

if [ -z "$ARG1" ]; then
    echo "Usage:" >&2
    echo "  pnpm run release -- <bump>               # bump all plugins + metadata" >&2
    echo "  pnpm run release -- all <bump>            # bump all plugins + metadata" >&2
    echo "  pnpm run release -- <plugin-name> <bump>  # bump a single plugin" >&2
    echo "  <bump> = patch | minor | major | x.y.z" >&2
    exit 1
fi

# Determine PLUGIN_NAME and BUMP
if [ -z "$ARG2" ]; then
    # Single arg: must be a bump specifier — bumps all plugins
    PLUGIN_NAME="all"
    BUMP="$ARG1"
else
    PLUGIN_NAME="$ARG1"
    BUMP="$ARG2"
fi

# Validate bump specifier
case "$BUMP" in
    patch|minor|major) ;;
    *)
        if ! [[ "$BUMP" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
            echo "Usage: <bump> must be patch | minor | major | x.y.z" >&2; exit 1
        fi ;;
esac

# Validate plugin name (if not "all")
if [ "$PLUGIN_NAME" != "all" ]; then
    if ! jq -e --arg n "$PLUGIN_NAME" '.plugins[] | select(.name == $n)' .claude-plugin/marketplace.json &>/dev/null; then
        echo "ERROR: plugin '$PLUGIN_NAME' not found in marketplace.json" >&2; exit 1
    fi
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

# Helper: calculate new version from current + bump
calc_version() {
    local current="$1" bump="$2"
    local major minor patch
    IFS='.' read -r major minor patch <<< "$current"
    case "$bump" in
        patch) echo "${major}.${minor}.$((patch + 1))" ;;
        minor) echo "${major}.$((minor + 1)).0" ;;
        major) echo "$((major + 1)).0.0" ;;
        *) echo "$bump" ;;
    esac
}

if [ "$PLUGIN_NAME" = "all" ]; then
    # Bump all plugins + metadata
    PLUGIN_NAMES=$(jq -r '.plugins[].name' .claude-plugin/marketplace.json)
    echo "Bumping all plugins:"
    for name in $PLUGIN_NAMES; do
        CURRENT=$(jq -r --arg n "$name" '.plugins[] | select(.name == $n) | .version' .claude-plugin/marketplace.json)
        VERSION=$(calc_version "$CURRENT" "$BUMP")
        echo "  ${name}: v${CURRENT} -> v${VERSION}"
    done
    META_CURRENT=$(jq -r '.metadata.version' .claude-plugin/marketplace.json)
    META_VERSION=$(calc_version "$META_CURRENT" "$BUMP")
    echo "  metadata: v${META_CURRENT} -> v${META_VERSION}"

    read -rp "Proceed? [y/N] " CONFIRM
    [[ "$CONFIRM" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 1; }

    # Bump each plugin in marketplace.json and its plugin.json
    for name in $PLUGIN_NAMES; do
        CURRENT=$(jq -r --arg n "$name" '.plugins[] | select(.name == $n) | .version' .claude-plugin/marketplace.json)
        VERSION=$(calc_version "$CURRENT" "$BUMP")
        TMP=$(mktemp)
        jq --arg n "$name" --arg v "$VERSION" \
            '(.plugins[] | select(.name == $n)).version = $v' \
            .claude-plugin/marketplace.json > "$TMP" && mv "$TMP" .claude-plugin/marketplace.json
        plugin_json="plugins/${name}/.claude-plugin/plugin.json"
        TMP=$(mktemp)
        jq --arg v "$VERSION" '.version = $v' "$plugin_json" > "$TMP" && mv "$TMP" "$plugin_json"
    done

    # Bump metadata.version
    TMP=$(mktemp)
    jq --arg v "$META_VERSION" '.metadata.version = $v' .claude-plugin/marketplace.json > "$TMP" \
        && mv "$TMP" .claude-plugin/marketplace.json

    # Post-bump validation
    pnpm run validate

    git add .claude-plugin/marketplace.json plugins/*/.claude-plugin/plugin.json
    git commit --no-verify -m "chore: release v${META_VERSION}"
    git push --no-verify origin main
    echo "Released dotplugins v${META_VERSION}"
else
    # Bump a single plugin
    CURRENT=$(jq -r --arg n "$PLUGIN_NAME" '.plugins[] | select(.name == $n) | .version' .claude-plugin/marketplace.json)
    VERSION=$(calc_version "$CURRENT" "$BUMP")
    echo "${PLUGIN_NAME}: v${CURRENT} -> v${VERSION}"

    read -rp "Proceed? [y/N] " CONFIRM
    [[ "$CONFIRM" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 1; }

    # Bump in marketplace.json
    TMP=$(mktemp)
    jq --arg n "$PLUGIN_NAME" --arg v "$VERSION" \
        '(.plugins[] | select(.name == $n)).version = $v' \
        .claude-plugin/marketplace.json > "$TMP" && mv "$TMP" .claude-plugin/marketplace.json

    # Bump in plugin.json
    plugin_json="plugins/${PLUGIN_NAME}/.claude-plugin/plugin.json"
    TMP=$(mktemp)
    jq --arg v "$VERSION" '.version = $v' "$plugin_json" > "$TMP" && mv "$TMP" "$plugin_json"

    # Post-bump validation
    pnpm run validate

    git add .claude-plugin/marketplace.json "plugins/${PLUGIN_NAME}/.claude-plugin/plugin.json"
    git commit --no-verify -m "chore: release ${PLUGIN_NAME} v${VERSION}"
    git push --no-verify origin main
    echo "Released ${PLUGIN_NAME} v${VERSION}"
fi
