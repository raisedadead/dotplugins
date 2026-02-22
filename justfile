# dotplugins development tasks

set shell := ["bash", "-uc"]

# Default recipe - show help
default:
    @just --list

# === Info ===

# Show current version (unified across all plugins)
version:
    @jq -r '.plugins[0].version' .claude-plugin/marketplace.json

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
    # Ensure all plugin versions match (unified versioning)
    EXPECTED=$(jq -r '.plugins[0].version' .claude-plugin/marketplace.json)
    for f in .claude-plugin/marketplace.json; do
        for v in $(jq -r '.plugins[].version' "$f"); do
            if [ "$v" != "$EXPECTED" ]; then
                echo "FAIL: version mismatch in marketplace.json: $v != $EXPECTED"
                ERRORS=$((ERRORS + 1))
            fi
        done
    done
    for f in plugins/*/.claude-plugin/plugin.json; do
        pv=$(jq -r '.version // empty' "$f")
        if [ -z "$pv" ]; then
            echo "FAIL: $f missing version field"
            ERRORS=$((ERRORS + 1))
        elif [ "$pv" != "$EXPECTED" ]; then
            echo "FAIL: $f version ($pv) != expected ($EXPECTED)"
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
    # Shellcheck all hook scripts
    if command -v shellcheck &>/dev/null; then
        for sh in plugins/*/hooks/*.sh; do
            [ -f "$sh" ] || continue
            if ! shellcheck -S warning "$sh"; then
                echo "FAIL: shellcheck: $sh"; ERRORS=$((ERRORS + 1))
            fi
        done
    else
        echo "SKIP: shellcheck not installed"
    fi
    # Validate hooks.json for plugins that have hooks
    for hj in plugins/*/hooks/hooks.json; do
        [ -f "$hj" ] || continue
        if ! jq -e '.hooks' "$hj" &>/dev/null; then
            echo "FAIL: $hj missing .hooks key"
            ERRORS=$((ERRORS + 1))
        fi
    done
    if [ "$ERRORS" -eq 0 ]; then
        echo "All checks passed."
    else
        echo "${ERRORS} check(s) failed."; exit 1
    fi

# === Release ===

# Bump all plugins: just release patch|minor|major
release bump:
    #!/usr/bin/env bash
    set -euo pipefail
    CURRENT=$(jq -r '.plugins[0].version' .claude-plugin/marketplace.json)
    IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"
    case "{{bump}}" in
        patch) VERSION="${MAJOR}.${MINOR}.$((PATCH + 1))" ;;
        minor) VERSION="${MAJOR}.$((MINOR + 1)).0" ;;
        major) VERSION="$((MAJOR + 1)).0.0" ;;
        *) VERSION="{{bump}}"
           if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
               echo "Usage: just release patch|minor|major|x.y.z" >&2; exit 1
           fi ;;

    esac
    echo "dotplugins: v${CURRENT} -> v${VERSION}"
    read -rp "Proceed? [y/N] " CONFIRM
    [[ "$CONFIRM" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 1; }
    # Bump all versions in marketplace.json
    TMP=$(mktemp)
    jq --arg v "$VERSION" '.plugins[].version = $v' .claude-plugin/marketplace.json > "$TMP" \
        && mv "$TMP" .claude-plugin/marketplace.json
    # Sync to each plugin.json
    for f in plugins/*/.claude-plugin/plugin.json; do
        TMP=$(mktemp)
        jq --arg v "$VERSION" '.version = $v' "$f" > "$TMP" && mv "$TMP" "$f"
    done
    just validate
    git add .claude-plugin/marketplace.json plugins/*/.claude-plugin/plugin.json
    git commit -m "chore: release v${VERSION}"
    git push origin main
    echo "Released dotplugins v${VERSION}"
