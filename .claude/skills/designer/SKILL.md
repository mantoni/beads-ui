---
name: designer
description: Creating, updating, or editing UI/UX designs using the Pencil MCP. Use when the user asks to design, redesign, rework, or update screens, pages, or UI components in a .pen file.
---

## When This Skill Applies

Trigger on prompts like:
- "Design the upload page"
- "Rework the current dashboard layout"
- "Update the modal to match the new style"
- "Create a design for the settings screen"

If the target screen or file is ambiguous, ask before proceeding.

## Hard Rule

If the user request is design-only, for approval, or otherwise does not explicitly authorize implementation:

- Use Pencil only.
- Never fall back to editing application code, HTML, CSS, or JS.
- If no matching `.pen` file exists, create a new one under `.pencil/`.
- Return design artifacts and stop.

Only edit code when the user explicitly starts a separate implementation task or explicitly asks to implement the approved design.

## Repo UI References

When working in this repo, check the project UI references before making design decisions:

1. `docs/ui-brand.md` for the written source-of-truth order, visual tokens, and reuse rules
2. `.pencil/DesignSystem.pen` for shared visual language and reusable UI atoms
3. the relevant approved screen `.pen` file, such as `.pencil/UploadPage.pen`

These references are project-specific and take precedence over generic style instincts.

If code and approved Pencil artifacts disagree visually, treat the approved `.pen` artifact as correct.

## Stage 1 - Understand the Editor State

Always start here:

```
get_editor_state(include_schema=true)
```

This tells you which `.pen` file is active, what is selected, and the current canvas state. If no document is open:

```
open_document(filePathOrTemplate="new")            # new blank file
open_document(filePathOrTemplate="<path>")         # open specific .pen file
```

All `.pen` file output goes in `.pencil/`. Never use `Read`, `Write`, `Grep`, `Glob`, or shell file reads on `.pen` files; they must be accessed through Pencil MCP tools.

## Stage 2 - Read the Current Design

Use `batch_get` to inspect existing nodes before making changes:

```
batch_get(filePath="<active .pen file>", readDepth=1)
batch_get(filePath="<active .pen file>", nodeIds=["<id>", "..."], readDepth=2)
batch_get(filePath="<active .pen file>", patterns=[{"reusable": true}], readDepth=2, searchDepth=3)
```

Start with a shallow overview or the current selection. Read more only for the specific nodes you need.

Do not guess node IDs. Read them from `get_editor_state` or `batch_get` results.

For this repo, if the task is not a tiny local tweak inside an already-open file:

1. open or inspect `.pencil/DesignSystem.pen`
2. inspect the target approved screen `.pen` file
3. keep the work aligned with `docs/ui-brand.md`

## Stage 3 - Get Design Guidelines

Fetch the relevant guideline topic for the type of work:

| Work type | Topic |
|---|---|
| Web app / dashboard | `web-app` |
| Mobile screen | `mobile-app` |
| Landing page | `landing-page` |
| Design system component | `design-system` |
| Data table | `table` |

```
get_guidelines(topic="web-app")
```

Then get style inspiration when the task benefits from creative direction:

```
get_style_guide_tags()
get_style_guide(tags=[...])
```

Only call these once per session unless the scope changes. Skip style-guide lookup for small compositional edits inside an existing design system.

## Stage 4 - Design

Apply changes using `batch_design`. Follow the format and constraints returned by `get_guidelines` exactly.

```
batch_design(
  filePath="<active .pen file>",
  operations="
container=I(\"parentId\",{type:\"frame\",layout:\"vertical\",gap:24})
title=I(container,{type:\"text\",content:\"Screen title\"})
"
)
```

- Scope changes to what the user asked for. Do not restyle unrelated screens or components.
- Prefer modifying existing nodes over deleting and recreating.
- If structural changes are large, describe the plan to the user before executing.
- Use the exact node IDs or bindings returned by Pencil tools; do not invent paths.

## Stage 5 - Verify

After applying changes:

```
get_screenshot(filePath="<active .pen file>", nodeId="<screen-or-frame-id>")
batch_get(filePath="<active .pen file>", nodeIds=["<id>", "..."], readDepth=2)
```

Show the user what changed. If it does not match intent, iterate.

## Rules

- **Never** read `.pen` files with `Read`, `Grep`, `Glob`, or shell file access; use Pencil MCP tools.
- **Never** invent node IDs; always derive them from tool output.
- Always call `get_editor_state(include_schema=true)` before Pencil reads or writes in a new conversation.
- In this repo, consult `docs/ui-brand.md`, `.pencil/DesignSystem.pen`, and the relevant approved screen `.pen` file before broad UI changes.
- Scope edits to what was requested. Do not expand to adjacent screens unless asked.
- Store all design files under `.pencil/`.
- If the request is ambiguous (which page? which component?), ask before touching anything.
- If a UI request could mean either design or implementation, ask one short clarification question before proceeding.
- When this skill matches and implementation permission is not explicit, default to a Pencil-only design task.
