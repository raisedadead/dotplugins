#!/usr/bin/env bash
set -euo pipefail

ERRORS=0

# Validate JSON files
for f in .claude-plugin/marketplace.json plugins/*/.claude-plugin/plugin.json; do
    if ! jq empty "$f" 2>/dev/null; then
        echo "FAIL: invalid JSON: $f"; ERRORS=$((ERRORS + 1))
    fi
done

# Ensure each plugin's version in marketplace.json matches its own plugin.json
for name in $(jq -r '.plugins[].name' .claude-plugin/marketplace.json); do
    marketplace_version=$(jq -r --arg n "$name" '.plugins[] | select(.name == $n) | .version' .claude-plugin/marketplace.json)
    plugin_json="plugins/${name}/.claude-plugin/plugin.json"
    if [ ! -f "$plugin_json" ]; then
        echo "FAIL: $plugin_json not found for marketplace plugin '$name'"
        ERRORS=$((ERRORS + 1))
        continue
    fi
    pv=$(jq -r '.version // empty' "$plugin_json")
    if [ -z "$pv" ]; then
        echo "FAIL: $plugin_json missing version field"
        ERRORS=$((ERRORS + 1))
    elif [ "$pv" != "$marketplace_version" ]; then
        echo "FAIL: $plugin_json version ($pv) != marketplace.json version ($marketplace_version) for plugin '$name'"
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

# Validate SKILL.md frontmatter exists and name matches directory
for skill in plugins/*/skills/*/SKILL.md; do
    if ! head -1 "$skill" | grep -q '^---'; then
        echo "FAIL: missing YAML frontmatter in $skill"
        ERRORS=$((ERRORS + 1))
    else
        dir_name=$(basename "$(dirname "$skill")")
        fm_name=$(awk '/^---$/{n++; next} n==1 && /^name:/{sub(/^name: */, ""); gsub(/"/, ""); print; exit}' "$skill")
        if [ -n "$fm_name" ] && [ "$fm_name" != "$dir_name" ]; then
            echo "FAIL: $skill frontmatter name '$fm_name' != directory name '$dir_name'"
            ERRORS=$((ERRORS + 1))
        fi
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
    plugin_dir=$(dirname "$(dirname "$hj")")
    while IFS= read -r cmd; do
        resolved="${cmd//\$\{CLAUDE_PLUGIN_ROOT\}/$plugin_dir}"
        if [ ! -f "$resolved" ]; then
            echo "FAIL: $hj references missing script: $cmd"
            ERRORS=$((ERRORS + 1))
        fi
    done < <(jq -r '.. | .command? // empty' "$hj")
done

# Official Claude plugin validator
if command -v claude &>/dev/null; then
    for pd in plugins/*/; do
        [ -f "${pd}.claude-plugin/plugin.json" ] || continue
        if ! claude plugin validate "$pd" 2>&1; then
            echo "FAIL: claude plugin validate ${pd}"; ERRORS=$((ERRORS + 1))
        fi
    done
    if ! claude plugin validate . 2>&1; then
        echo "FAIL: claude plugin validate ."; ERRORS=$((ERRORS + 1))
    fi
else
    echo "SKIP: claude CLI not installed"
fi

if [ "$ERRORS" -eq 0 ]; then
    echo "All checks passed."
else
    echo "${ERRORS} check(s) failed."; exit 1
fi
