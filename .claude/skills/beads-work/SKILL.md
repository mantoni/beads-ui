---
name: beads-work
description:
  Task and issue tracking using Beads (bd CLI). Use when the user explicitly
  asks for tracking or when implementation work is substantive enough to need
  multi-step or cross-session coordination. Replaces TodoWrite, TaskCreate,
  and markdown task lists.
---

This project uses **Beads** for issue tracking when the work is substantive
enough to merit a tracked task. Never use TodoWrite, TaskCreate, or markdown
files to track tasks. The `bd` CLI is the only sanctioned tool.

## When This Skill Applies

Use this skill when at least one of these is true:

- The user explicitly asks for Beads tracking, status updates, or issue
  management
- The work is implementation-oriented and spans multiple steps, files, or
  sessions
- The work needs dependency tracking, follow-up tracking, or linkage to an
  existing issue/epic

Do **not** create or update Beads issues by default for:

- Design-only Pencil work covered by the `designer` skill
- Trivial fixes, wording changes, or narrow one-shot edits
- Review-only, planning-only, advisory, or repo-exploration tasks
- Git-only or administrative actions such as branch creation, sync, or push

## Session Start

At the start of any session where Beads-tracked work is involved, orient
yourself:

```bash
bd prime        # Load project context and active issues (run after clear/compaction/new session)
bd ready        # Show issues available to work (no blockers)
bd list --status=in_progress  # Check what is already claimed
```

## Creating Issues

Create an issue **before** writing code, not after, only when the work is
substantive and worth tracking.

```bash
bd create --id="bd-NNN" --title="..." --type=task|bug|feature --priority=2
```

Priority scale: `0`=critical, `1`=high, `2`=medium, `3`=low, `4`=backlog. Use
integers, not words.

For many issues at once, create them in parallel (multiple subagents or
concurrent calls).

See **When This Skill Applies** above for criteria on when to create vs. skip.

Beads ID policy:

- Always create issues with an explicit numeric ID in the form `bd-NNN`.
- Never rely on Beads auto-generated mixed alphanumeric IDs such as `bd-db8`.
- Before `bd create`, inspect existing numeric `bd-NNN` IDs and choose the next available number.
- If the next numeric ID is ambiguous or there is collision risk, ask the user before creating the issue.
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

If this task used Beads tracking, before declaring work complete:

```bash
bd sync   # Commit and push beads state
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
| `bd sync`                      | Commit and push beads state |

## Rules

- **Never** use `bd edit` — it opens `$EDITOR` and blocks agents.
- **Never** use TodoWrite, TaskCreate, or markdown files for task tracking.
- Create issues before coding for substantive tracked work, not as an
  afterthought.
- Do not auto-create issues for design-only Pencil work, trivial edits, or
  review-only tasks.
- Skip issue creation for trivial administrative tasks unless the user
  explicitly requests tracking.
- If unsure whether tracking is warranted, ask the user before creating an
  issue.
- Fold Beads status updates into the main commit whenever practical.
- Close all finished issues before ending a Beads-tracked session.
- Run `bd sync` as the final step of a Beads-tracked session.
