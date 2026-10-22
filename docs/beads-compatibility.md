# Beads compatibility

The compatibility target is **Beads (`bd`) 1.3.1**, the latest stable release
verified on 2026-10-22. Use Node.js 22 or later. CI runs the real CLI/Dolt
integration on Node.js 24 in addition to the regular unit suite on both
versions.

## Issue types

The UI supports the current built-in types: `bug`, `feature`, `task`, `epic`,
`chore`, `decision`, `spike`, `story` and `milestone`. They share one vocabulary
across UI controls, filter restoration, badges and create/update validation.
Custom types already present in read results remain visible as text; this does
not enable creation of arbitrary custom types without server-side validation. An
explicit unsupported create type is rejected instead of silently creating the
CLI's default type. Omitting the type retains the CLI default.

## Run the real integration suite

```sh
npm ci
npm install --global @beads/bd@1.3.1
npm run test:beads
```

Set `BD_BIN` if the exact binary is installed elsewhere. The runner refuses
other CLI versions. Git must be available. It always creates its own two
temporary git/Dolt workspaces and isolated home directory; it accepts no target
workspace. All mutations affect disposable fixtures, not the repository's
issues. It needs a local loopback socket but no external service or network.

The suite exercises the real WebSocket handlers and actual CLI rather than
mocking CLI output. It covers these existing UI contracts:

| UI behavior                   | CLI contract and verification                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------- |
| Workspace discovery/switching | Dolt metadata resolution, registered roots, isolated results                          |
| Issue creation/type changes   | `create -t`, `update --type`; all nine built-ins verified by `show`/`list`            |
| Invalid explicit types        | RPC rejection before mutation                                                         |
| Text editing                  | `update` title, description, acceptance, design and notes, read back by `show --json` |
| Priority/assignee             | `update --priority` and `--assignee`, persisted values                                |
| Statuses                      | Open, in progress, blocked, deferred and closed, persisted values                     |
| Labels                        | `label add/remove`, stored label presence                                             |
| Dependencies                  | `dep add/remove`, blocked-list membership changes                                     |
| Comments                      | `comments add`, `comments --json`, returned text                                      |
| Lists                         | `list`, `ready`, `blocked`, `epic status`; valid subscription snapshots               |
| Detail                        | `show --json --include-dependents`; requested issue in snapshot                       |
| External writer               | Independent CLI edit appears in an active subscription                                |
| Deletion                      | `delete --force`; issue absent from the database                                      |

The normal suite (`npm run all`) also verifies browser rendering, type filters,
filter persistence, custom-type escaping and RPC validation. Run date-sensitive
upstream tests with `TZ=UTC`, matching CI. `npm run build` verifies the browser
bundle separately.

## Boundaries

This is compatibility for the existing issue-tracker UI, not an interface for
every Beads feature (for example federation, formulas, molecules or agent
orchestration). Machine-managed statuses are not exposed as editable statuses.
SQLite-era resolution remains available; real integration coverage here targets
fresh embedded-Dolt workspaces, not every historical database or remote-server
deployment. No live data migrations are performed.

Deployment-specific read-only policies, URL prefixes, authentication and
infrastructure are separate from this portable compatibility change. The
ordinary upstream UI is writable; a deployment must enforce its chosen policy.
