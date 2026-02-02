#!/bin/bash
# Claude Reflect - Auto-register current project on session start
# This script adds the current working directory to the reflect profile

set -euo pipefail

# Read input from stdin (contains session info including cwd)
input=$(cat)
cwd=$(echo "$input" | jq -r '.cwd // empty')

# If no cwd provided, exit silently
if [ -z "$cwd" ]; then
  exit 0
fi

# Check if it's a git repo (only register git repos)
if [ ! -d "$cwd/.git" ]; then
  exit 0
fi

# Profile path
PROFILE_DIR="$HOME/.claude-reflect"
PROFILE_FILE="$PROFILE_DIR/profile.json"

# Ensure profile directory exists
mkdir -p "$PROFILE_DIR"

# If profile doesn't exist, create minimal one
if [ ! -f "$PROFILE_FILE" ]; then
  cat > "$PROFILE_FILE" << 'PROFILE'
{
  "version": "0.1.0",
  "created_at": "",
  "updated_at": "",
  "technical_level": {
    "overall": "unknown",
    "confidence": 0,
    "domains": {}
  },
  "strengths": [],
  "weaknesses": [],
  "work_habits": {
    "peak_hours": [],
    "avg_session_length_minutes": 0,
    "multitasking_tendency": "moderate"
  },
  "learning_preferences": {
    "style": "mixed",
    "depth": "moderate",
    "feedback_receptiveness": "medium"
  },
  "active_projects": [],
  "profile_corrections": []
}
PROFILE
  # Update timestamps
  now=$(date -Iseconds)
  tmp=$(mktemp)
  jq --arg now "$now" '.created_at = $now | .updated_at = $now' "$PROFILE_FILE" > "$tmp" && mv "$tmp" "$PROFILE_FILE"
fi

# Check if project already registered
existing=$(jq -r --arg path "$cwd" '.active_projects[] | select(.path == $path) | .path' "$PROFILE_FILE" 2>/dev/null || echo "")

if [ -z "$existing" ]; then
  # Add project to profile
  now=$(date -Iseconds)
  tmp=$(mktemp)
  jq --arg path "$cwd" --arg now "$now" \
    '.active_projects += [{"path": $path, "role": "developer"}] | .updated_at = $now' \
    "$PROFILE_FILE" > "$tmp" && mv "$tmp" "$PROFILE_FILE"

  # Output success message (will be shown as system message)
  echo "{\"continue\": true, \"suppressOutput\": true}"
else
  # Already registered, silent success
  echo "{\"continue\": true, \"suppressOutput\": true}"
fi
