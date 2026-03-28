---
name: work-with-git
description:
  Branch strategy and git safety rules for this project. Use when creating
  branches, preparing commits, or deciding how to structure git work.
---

## Branch Naming

| Prefix            | When to use                                        |
| ----------------- | -------------------------------------------------- |
| `feature/<name>`  | New features                                       |
| `fix/<name>`      | Bug fixes                                          |
| `chore/<name>`    | Maintenance, tooling, dependencies, config         |
| `refactor/<name>` | Internal restructuring without behavior change     |
| `docs/<name>`     | Documentation only                                 |
| `ai/<name>`       | AI-assisted development when no better prefix fits |

## Inspect First

Before suggesting any branch action, inspect the repo state first:

```bash
git status --short
git branch --show-current
git branch --list
git symbolic-ref refs/remotes/origin/HEAD
```

- Do not assume the correct base branch without checking the repo.
- Do not switch branches or pull automatically.
- If the worktree is dirty, do not silently continue with non-trivial work on
  `main` or the remote default branch.
- When a new branch is needed, suggest the repo's active integration branch or
  remote default branch as the base. In this repo that may be `main`, but do not
  hardcode it.
- If `refs/remotes/origin/HEAD` is unavailable locally, inspect the local
  branches and ask before fetching remote state.

## Branch Creation Example

Only suggest commands like these after the user approves branch creation or
switching:

```bash
git checkout <base-branch>
git pull origin <base-branch>
git checkout -b <prefix>/my-change
```

## Branch Decision Rule

- **Trivial** (typo, doc link, log wording, local rename): branch optional.
- **Non-trivial** (new feature, API change, multi-file, test or behavior
  change): branch required unless the user explicitly approves working on the
  current branch.

If the current branch is `main` or the remote default branch:

- Stop before editing and ask the user whether to create or switch to a branch.
- Do not merely suggest a branch and continue.
- If the worktree is dirty, ask whether to create a new branch from the current
  state, continue on `main` explicitly, or stop until the git state is cleaned
  up.

## Git Safety Rules

- `AGENTS.md`, `ORCHESTRATION.md`, and this skill may describe git workflow, but
  the stricter rule always wins.
- Never commit without explicit user permission.
- Never push without explicit user permission.
- Never create or switch branches without user approval.
- Never begin non-trivial edits on `main` or the remote default branch without
  explicit user approval.
- Never run `git pull` or `git checkout <branch>` just because a skill suggests
  it; inspect first and wait for approval.
- Never rewrite history, force-push, reset, or revert user changes without
  permission.
- If unexpected user edits overlap target files, stop and clarify before
  proceeding.
- Keep commits focused. Do not include unrelated files from a dirty worktree.
- Prefer `git status --short` and targeted `git diff -- <path>` before staging.
- If a task only updates skills or docs, keep the branch and commit scoped to
  those files.
- Direct pushes to `main` are not allowed; always open a PR.

## Session End

If the user explicitly asked for commit/push work or approved it, run this sequence before declaring that git portion complete:

```bash
git pull --rebase
bd sync
git push
git status  # must show "up to date with origin"
```

- Do not claim the git work is complete before the approved push is done.
- If push fails, resolve the conflict and retry until it succeeds.
- File Beads issues for any remaining follow-up work before closing the session.
