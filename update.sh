#!/usr/bin/env bash
#
# Canonical updater for the `tokenrip-cli` skill.
#
# Two callers source this script:
#
#   1. The skill's own Auto-Installation block (in SKILL.md) — runs whenever
#      Claude Code auto-loads the skill.
#   2. The `tokenrip-bootloader` slash command — runs on every invocation as
#      a courtesy refresh.
#
# Single source of truth: when the skill content evolves, only this file (and
# SKILL.md itself) change. The bootloader never reimplements the update.
#
# Behavior:
#   - Idempotent: exits cleanly if the installed skill matches the remote.
#   - Best-effort: silently no-ops when the skill is not installed locally,
#     when curl fails, or when the manifest is unreachable. Never returns
#     non-zero (the bootloader's `| bash` should not interrupt a session).
#
# Serve this file at: https://tokenrip.com/.well-known/skills/tokenrip/update.sh
#
set +e

BASE="https://tokenrip.com/.well-known/skills/tokenrip"

# 1. Install the CLI if missing — the skill is useless without `rip`.
command -v rip >/dev/null 2>&1 || npm install -g @tokenrip/cli >/dev/null 2>&1

# 2. Locate the skill directory. Walk up from $PWD first (project-local), then
#    fall back to global locations.
SKILL_DIR=""
_D="$PWD"
while [ "$_D" != "/" ] && [ -z "$SKILL_DIR" ]; do
  [ -d "${_D}/.claude/skills/tokenrip" ] && SKILL_DIR="${_D}/.claude/skills/tokenrip"
  _D="$(dirname "$_D")"
done
[ -z "$SKILL_DIR" ] && [ -d "${HOME}/.agents/skills/tokenrip" ] && SKILL_DIR="${HOME}/.agents/skills/tokenrip"
[ -z "$SKILL_DIR" ] && [ -d "${HOME}/.claude/skills/tokenrip" ] && SKILL_DIR="${HOME}/.claude/skills/tokenrip"

# Not installed locally — nothing to update. Exit cleanly.
[ -z "$SKILL_DIR" ] && exit 0

# 3. Compare versions. The local marker lives in SKILL.md as
#    `<!-- tokenrip-skill-version: X.Y.Z -->`. The remote is in manifest.json.
CURRENT_VER=$(grep -m1 'tokenrip-skill-version:' "$SKILL_DIR/SKILL.md" 2>/dev/null | grep -o '[0-9][0-9.]*')
REMOTE_VER=$(curl -fsSL "$BASE/manifest.json" 2>/dev/null | grep -o '"version":"[^"]*"' | head -1 | cut -d'"' -f4)

# Already current — exit cleanly.
[ -n "$CURRENT_VER" ] && [ "$CURRENT_VER" = "$REMOTE_VER" ] && exit 0

# Remote unreachable — exit cleanly. Better to skip an update than to wedge
# the caller.
[ -z "$REMOTE_VER" ] && exit 0

# 4. Refresh SKILL.md, references, and the CLI itself.
rip update >/dev/null 2>&1
curl -fsSL "$BASE/SKILL.md" -o "$SKILL_DIR/SKILL.md" 2>/dev/null
mkdir -p "$SKILL_DIR/references"
for ref in setup-and-identity agent-architecture workspaces surfaces output-and-provenance; do
  curl -fsSL "$BASE/references/${ref}.md" -o "$SKILL_DIR/references/${ref}.md" 2>/dev/null
done

exit 0
