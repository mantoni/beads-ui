---
name: beads-work
description:
  Task and issue tracking using Beads (bd CLI). Use for all task creation,
  status updates, session management, and work discovery. Replaces TodoWrite,
  TaskCreate, and markdown task lists.
---

This project uses **Beads** for issue tracking when the work is substantive
enough to merit a tracked task. Never use TodoWrite, TaskCreate, or markdown
files to track tasks. The `bd` CLI is the only sanctioned tool.

## Session Start

At the start of any session where Beads-tracked work is involved, orient
yourself:

```bash
bd prime        # Load project context and active issues (run after clear/compaction/new session)
bd ready        # Show issues available to work (no blockers)
bd list --status=in_progress  # Check what is already claimed
```

## Creating Issues

Create an issue **before** writing code — not after — when the work is
substantive and worth tracking.

```bash
bd create --id="sd-NNN" --title="..." --type=task|bug|feature --priority=2
```

Priority scale: `0`=critical, `1`=high, `2`=medium, `3`=low, `4`=backlog. Use
integers, not words.

For many issues at once, create them in parallel (multiple subagents or
concurrent calls).

**Substantive** means work involving code, schema, config, or docs changes. Do
**not** create a Beads issue for trivial git-only, push-only, branch-only, or
similar lightweight administrative tasks unless the user explicitly asked for
Beads tracking. If it is unclear whether the task is substantive enough, ask the
user before creating an issue.

Beads ID policy:

- Always create issues with an explicit numeric ID in the form `sd-NNN`.
- Never rely on Beads auto-generated mixed alphanumeric IDs such as `sd-db8`.
- Before `bd create`, inspect existing numeric `sd-NNN` IDs and choose the next
  available number.
- If the next numeric ID is ambiguous or there is collision risk, ask the user
  before creating the issue.

## Working an Issue

```bash
bd update <id> --status=in_progress   # Claim it before starting
bd show <id>                          # Review details and dependencies
bd update <id> --notes="..."          # Add notes while working
```

Prefer to batch status transitions with the main work commit. If a task will end
in a code or docs commit, update the Beads status before that commit so the
status change lands together with the substantive change.

## Closing Issues

```bash
bd close <id>                          # Mark complete
bd close <id1> <id2> <id3>            # Close multiple at once (preferred)
bd close <id> --reason="explanation"  # Close with reason (for cancelled/wontfix)
```

When possible, close or update the issue before creating the main commit so
`.beads/issues.jsonl` changes are included there instead of requiring a
follow-up Beads-only commit.

## Dependencies

```bash
bd dep add <issue> <depends-on>   # issue is blocked until depends-on is closed
bd blocked                        # Show all currently blocked issues
```

## Session End

Before declaring work complete:

```bash
bd sync --flush-only   # Export beads state to JSONL
```

## Reference

| Command                        | Purpose                     |
| ------------------------------ | --------------------------- |
| `bd prime`                     | Load session context        |
| `bd ready`                     | Find available work         |
| `bd list --status=open`        | All open issues             |
| `bd list --status=in_progress` | Active work                 |
| `bd show <id>`                 | Issue detail + dependencies |
| `bd stats`                     | Project health counts       |
| `bd blocked`                   | All blocked issues          |
| `bd sync --flush-only`         | Export to JSONL             |

## Rules

- **Never** use `bd edit` — it opens `$EDITOR` and blocks agents.
- **Never** use TodoWrite, TaskCreate, or markdown files for task tracking.
- Create issues before coding for substantive work, not as an afterthought.
- Skip issue creation for trivial administrative tasks unless the user
  explicitly requests tracking.
- If unsure whether tracking is warranted, ask the user before creating an
  issue.
- Use explicit numeric issue IDs in `sd-NNN` format whenever creating a new
  Beads issue.
- Fold Beads status updates into the main commit whenever practical.
- Close all finished issues before ending the session.
- Run `bd sync --flush-only` as the final step of every session.
