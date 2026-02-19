# dotplugins development tasks

set shell := ["bash", "-uc"]

# Default recipe - show help
default:
    @just --list

# === Info ===

# Show current plugin versions (from marketplace.json)
version:
    @jq -r '.plugins[] | "\(.name): v\(.version)"' .claude-plugin/marketplace.json

# === Validate ===

# Validate marketplace.json and plugin structure
validate:
    #!/usr/bin/env bash
    set -euo pipefail
    ERRORS=0
    # Validate JSON files
    for f in .claude-plugin/marketplace.json plugins/*/.claude-plugin/plugin.json; do
        if ! jq empty "$f" 2>/dev/null; then
            echo "FAIL: invalid JSON: $f"; ERRORS=$((ERRORS + 1))
        fi
    done
    # Ensure no plugin.json has a version field
    for f in plugins/*/.claude-plugin/plugin.json; do
        if jq -e '.version' "$f" &>/dev/null; then
            echo "FAIL: $f must not contain version (single source: marketplace.json)"
            ERRORS=$((ERRORS + 1))
        fi
    done
    # Ensure every marketplace plugin has a directory
    for name in $(jq -r '.plugins[].name' .claude-plugin/marketplace.json); do
        if [ ! -d "plugins/${name}" ]; then
            echo "FAIL: plugin '${name}' listed in marketplace.json but plugins/${name}/ missing"
            ERRORS=$((ERRORS + 1))
        fi
    done
    # Validate SKILL.md frontmatter exists
    for skill in plugins/*/skills/*/SKILL.md; do
        if ! head -1 "$skill" | grep -q '^---'; then
            echo "FAIL: missing YAML frontmatter in $skill"
            ERRORS=$((ERRORS + 1))
        fi
    done
    # sp-specific: shellcheck hooks
    if command -v shellcheck &>/dev/null; then
        for sh in plugins/sp/hooks/*.sh; do
            if ! shellcheck -S warning "$sh"; then
                echo "FAIL: shellcheck: $sh"; ERRORS=$((ERRORS + 1))
            fi
        done
    else
        echo "SKIP: shellcheck not installed"
    fi
    # sp-specific: validate hooks.json
    if ! jq -e '.hooks' plugins/sp/hooks/hooks.json &>/dev/null; then
        echo "FAIL: plugins/sp/hooks/hooks.json missing .hooks key"
        ERRORS=$((ERRORS + 1))
    fi
    # cowork-specific: python syntax check
    for py in plugins/cowork/skills/*/scripts/*.py; do
        [ -f "$py" ] || continue
        if ! python3 -c "import ast; ast.parse(open('$py').read())" 2>/dev/null; then
            echo "FAIL: syntax error: $py"; ERRORS=$((ERRORS + 1))
        fi
    done
    if [ "$ERRORS" -eq 0 ]; then
        echo "All checks passed."
    else
        echo "${ERRORS} check(s) failed."; exit 1
    fi

# === Release ===

# Release a plugin: just release sp patch|minor|major|1.2.3
release plugin bump:
    #!/usr/bin/env bash
    set -euo pipefail
    PLUGIN="{{plugin}}"
    BUMP="{{bump}}"
    # Verify plugin exists in marketplace
    CURRENT=$(jq -r --arg name "$PLUGIN" '.plugins[] | select(.name == $name) | .version' .claude-plugin/marketplace.json)
    if [ -z "$CURRENT" ]; then
        echo "Error: plugin '${PLUGIN}' not found in marketplace.json" >&2; exit 1
    fi
    # Compute next version
    IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"
    case "{{bump}}" in
        patch) VERSION="${MAJOR}.${MINOR}.$((PATCH + 1))" ;;
        minor) VERSION="${MAJOR}.$((MINOR + 1)).0" ;;
        major) VERSION="$((MAJOR + 1)).0.0" ;;
        *) VERSION="{{bump}}" ;;
    esac
    echo "${PLUGIN}: v${CURRENT} -> v${VERSION}"
    read -rp "Proceed? [y/N] " CONFIRM
    [[ "$CONFIRM" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 1; }
    # Bump version in marketplace.json (single source of truth)
    IDX=$(jq --arg name "$PLUGIN" '.plugins | to_entries[] | select(.value.name == $name) | .key' .claude-plugin/marketplace.json)
    TMP=$(mktemp)
    jq --arg v "$VERSION" --argjson i "$IDX" '.plugins[$i].version = $v' .claude-plugin/marketplace.json > "$TMP" \
        && mv "$TMP" .claude-plugin/marketplace.json
    # Validate before committing
    just validate
    # Commit and push
    git add .claude-plugin/marketplace.json
    git commit -m "chore(${PLUGIN}): release ${VERSION}"
    git push origin main
    echo "Released ${PLUGIN} v${VERSION}"
