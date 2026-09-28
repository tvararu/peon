#!/usr/bin/env bash
PRWT=/path/to/orca/workspaces/peon/ribboneel
NOTES_HOME=/path/to/notes
cd "$PRWT" || exit 1
start=$(git ls-remote origin refs/heads/main 2>/dev/null | cut -f1)
prs=$(gh pr list --repo tvararu/peon --state open --json number --jq '[.[].number]|sort|join(",")' 2>/dev/null)
echo "watch start main=$start open_prs=$prs"
while true; do
  sleep 60
  head=$(git ls-remote origin refs/heads/main 2>/dev/null | cut -f1)
  if [ -n "$head" ] && [ "$head" != "$start" ]; then
    echo "EVENT main moved $start -> $head"; git fetch -q origin; git log --oneline "$start..$head" 2>/dev/null; exit 0
  fi
  if ! orca-ide worktree ps --json 2>/dev/null | jq -e '.result.worktrees[] | select(.displayName=="harness-direct-drive")' >/dev/null; then
    orca-ide status --json >/dev/null 2>&1 && { echo "EVENT harness-direct-drive worktree is gone"; exit 0; }
  fi
  if grep -qE '^- \*\*6\.\*\*' ${NOTES_HOME}/peon-todos.md 2>/dev/null; then echo "EVENT item 6 marked Done in peon-todos.md"; exit 0; fi
done
