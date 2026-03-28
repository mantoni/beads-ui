---
name: explain-code
description:
  Explains how code and design flow work in this repository. Use when teaching
  the codebase, tracing server/client execution, explaining WebSocket protocol
  or subscription flows, or answering "how does this work?" about implemented
  code or the design docs.
---

When explaining code:

1. Start from the code that matters most to the question.
2. Explain the real control flow, data flow, and status transitions before
   discussing abstractions.
3. When code is incomplete or missing, use the design docs to explain intended
   behavior and label it clearly as design intent rather than implementation.
4. Include a small ASCII diagram when it clarifies ownership, lifecycle, task
   fan-out, or call flow.
5. Call out assumptions, extension points, or failure modes when they are
   relevant.

## Default Structure

1. **What it is** - one or two sentences describing the module, view, route,
   CLI path, or subsystem role.
2. **Entry points** - which route, WebSocket message, CLI command, or function
   starts the behavior.
3. **How it flows** - step-by-step execution path with file references.
4. **Key collaborators** - which modules, protocol definitions, stores, and
   server/client boundaries it depends on.
5. **Gotchas** - common misunderstandings, hidden state, lifecycle rules, async
   boundaries, or failure modes.

## Style Rules

- Use analogies only when they simplify the explanation; do not force them.
- Do not invent behavior that is not visible in the code. If something is
  inferred, label it as an inference.
- Prefer concrete file, function, task, and route references over generic
  commentary.
- In this repo, explicitly separate implemented behavior from design-doc
  behavior when they differ.
- Keep diagrams compact and ASCII-only.
