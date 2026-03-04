# Building an SVG Playground with AI Agents: A Workflow Report

This document describes the process of building **SVG Playground** — a browser-based tool for live-coding SVG with React/JSX — using a team of specialized AI agents orchestrated by a human developer acting as product owner.

The goal isn't to catalog every feature. It's to describe a workflow: how the project was designed, delegated, tested, documented, and iterated using AI agents as collaborators — and what that felt like in practice.

---

## The starting point: a conversation, not a spec

The project began with a single request: *build a playground for drawing SVG*. The requirements were intentionally loose — a code editor, a live preview, and "user-defined tools" powered by custom hooks like `useInput` and `useRange`. No wireframes, no Figma, no Jira tickets.

The first thing the AI did was **not** write code. It asked clarifying questions, then produced a detailed implementation plan — an architecture document covering the tech stack decisions, component hierarchy, data flow diagrams, type definitions, and a phased build order. This plan became the project's north star: every subsequent agent received it as context.

This step turned out to be crucial. The plan wasn't just documentation — it was the *shared language* between all the agents that would work on the project later.

---

## Phase 1: Scaffolding with subagents

With the plan in hand, the AI shifted into project manager mode. Rather than implementing everything itself in one shot, it broke the work into six phases and delegated each to a **subagent** — a stateless, autonomous worker that receives a detailed prompt, executes it, and reports back.

The phases were:

1. **Project scaffold** — Vite + React-TS template, dependency installation, directory structure, shared types
2. **Code editor** — CodeMirror 6 wrapper component with JSX highlighting
3. **Compilation engine** — Sucrase JSX transform, `new Function()` component factory, ErrorBoundary
4. **SVG preview** — Live rendering of the user's component with error display
5. **Tools system** — `useToolsRegistry` hook, `useInput`/`useRange` hook factory, ToolsPanel component
6. **App wiring + styling** — Connecting everything in `App.tsx`, CSS grid layout, default example code

Each subagent received a prompt that included:
- The exact files to create, with full implementations
- The existing project context (what's already been built)
- Commands to run for verification (`npx tsc --noEmit`, `npm run build`)
- A checklist of what to report back

This was intentional: **subagents are stateless**. They don't remember previous conversations. The quality of their output is entirely determined by the quality of the prompt they receive. Over-specifying beats under-specifying every time.

After each phase completed, the project manager verified the report, checked for errors, and moved to the next phase. The entire initial build — from empty directory to working application — happened in a single continuous session.

---

## Creating the agent team

With the application working, the next step was to set up the infrastructure for ongoing development. Three specialized agents were created in `.github/agents/`:

### `@dev-agent` — The implementer
A senior frontend engineer persona. Knows the full architecture, the compilation pipeline, the tools registry lifecycle, and the code style conventions. Can run dev server, type checker, linter, and tests. Instructions include a step-by-step guide for adding new hooks.

### `@test-agent` — The QA engineer
Writes and maintains tests using Vitest + Testing Library. Has a distinctive philosophy baked into its instructions: **tests encode semantics, not implementation**. If a test fails, the test is right and the implementation needs fixing. The agent is explicitly forbidden from weakening or deleting a failing test to make the suite pass.

### `@docs-agent` — The technical writer
Reads source code and writes documentation in `docs/`. Never touches `src/`. Produces three deliverables: a user guide, an architecture reference, and a hooks API reference.

Each agent file follows a consistent structure:
- **Persona** — who the agent is and what it specializes in
- **Tech stack** — specific versions and dependencies
- **Project structure** — what lives where
- **Commands** — what the agent can run, with exact flags
- **Code style examples** — what good output looks like (and what bad output looks like)
- **Three-tier boundaries** — what to always do, what to ask about first, what to never do

The key insight: **specificity is everything**. "You are a helpful test writer" produces generic output. "You are a QA engineer who tests behavioral contracts, writes to `tests/`, uses Vitest with renderHook, and never modifies source code" produces consistently useful output.

---

## Handoffs: connecting the agents into workflows

The agents don't work in isolation. Each one has **handoff buttons** defined in its frontmatter — suggested next steps that appear after a response completes, letting the developer transition to the next agent with a pre-filled prompt.

The handoff topology:

```
┌─────────────┐     Write Tests     ┌──────────────┐
│             │ ──────────────────→ │              │
│  @dev-agent │                     │ @test-agent  │
│             │ ←────────────────── │              │
└──────┬──────┘   Fix Implementation└──────┬───────┘
       │                                   │
       │         Update Docs               │  Update Docs
       ▼                                   ▼
┌──────────────────────────────────────────────────┐
│                   @docs-agent                     │
└──────────────────────────────────────────────────┘
```

This creates two natural workflows:

**Feature development:** Dev builds a feature → hands off to Test to write tests → if tests fail, Test writes a handoff report and sends back to Dev → once green, either agent hands off to Docs.

**Test-first development:** Test writes behavioral tests that define what the feature should do → hands off to Dev to make them pass → back to Test to verify → then to Docs.

The handoff prompts are pre-filled but not auto-submitted (`send: false`), so the developer always reviews what's being passed between agents. This is a deliberate control point — the human approves each transition.

---

## The dev → test → dev loop in practice

The most interesting dynamic emerged in the interaction between `@dev-agent` and `@test-agent`. Here's how a typical feature cycle worked:

### 1. Dev implements a feature

For example: localStorage persistence for code and tool values, a pan/zoom system for the SVG preview, or a "Reset to Defaults" button. The dev agent produces the implementation, modifies the relevant files, runs the type checker, and verifies the build passes.

### 2. Test writes behavioral tests

The test agent receives the conversation context and writes tests that describe *what the feature should do*. For persistence, that means tests like "tool values survive a simulated reload" and "clearTools resets tools and subsequent reload starts empty." For pan/zoom, tests like "drag events accumulate translation" and "zoom toward the cursor keeps the target point fixed."

The test agent runs `npx vitest run`. If everything passes, it suggests a handoff to docs.

### 3. When tests fail: the handoff report

This is where the workflow gets interesting. The test agent is **philosophically committed** to its tests. If `useToolsRegistry > preserves user-modified values when code re-compiles` fails, the test agent doesn't weaken the assertion. Instead, it writes a structured handoff report:

- Which tests failed
- What behavior each test encodes
- Why it believes the test is correct
- What the implementation appears to be doing wrong
- Concrete suggestions for the dev agent

Then it suggests the "Fix Implementation" handoff. The developer clicks it, the dev agent receives the report, and fixes the implementation to match the spec (the tests).

This inverts the usual dynamic. Normally, developers write tests that pass. Here, the test agent writes tests that *should* pass, and the dev agent makes them pass. The tests become the specification.

---

## Documentation as a downstream artifact

The `@docs-agent` sits at the end of the pipeline. After features are implemented and tested, it reads the source code and produces documentation that accurately reflects what was built.

This ordering matters. Documentation written before the implementation settles tends to be wrong. Documentation written after the tests pass tends to be accurate.

The docs agent produced three files:
- **`docs/README.md`** — User guide: how to run the project, how to write code, hook API reference with examples
- **`docs/ARCHITECTURE.md`** — Developer guide: compilation pipeline, tools registry lifecycle, pan/zoom math, localStorage persistence, design decisions table
- **`docs/HOOKS_API.md`** — Hook reference: full signatures, behavioral descriptions, call-order stability rules, and a step-by-step template for adding new hooks

The docs agent has strict boundaries: it reads `src/` and `tests/` but only writes to `docs/`. It never invents API signatures that don't exist in the code. This prevents documentation drift — a common problem when docs and code are maintained by different processes.

---

## What the project looks like now

The SVG Playground has grown from the initial three-panel layout into a polished tool:

- **95 tests** across 8 test files covering the engine, hooks, components, and full integration pipeline
- **localStorage persistence** for both code and tool values, with a Reset button
- **Pan and zoom** on the SVG preview (drag to pan, scroll to zoom, with buttons) with careful math to zoom toward the cursor and keep SVGs crisp at any zoom level
- **Three documentation files** totaling ~700 lines of well-structured Markdown
- **Markdown linting** via markdownlint-cli2 with project-specific rule overrides
- **Three specialized agents** with handoff workflows connecting them

All of this was built without the developer writing a single line of application code directly.

---

## Observations on the workflow

**The implementation plan was the highest-leverage artifact.** Everything flowed from it: the subagent prompts, the agent persona definitions, and the documentation. Investing time in design before code paid off disproportionately.

**Agents work best as specialists.** The dev agent doesn't write tests. The test agent doesn't modify source code. The docs agent doesn't implement features. These boundaries prevent the kind of tangled, inconsistent output you get from a "do everything" assistant.

**Handoff reports are surprisingly effective.** When the test agent writes "this test encodes the requirement that slider values survive recompilation, the implementation resets them, here's exactly what to change," the dev agent almost always fixes it correctly on the first try. The structured format eliminates ambiguity.

**`send: false` is the right default.** Auto-submitting handoffs would be faster but removes the developer's ability to review, edit, or abort the transition. The developer remains the decision-maker at every step.

**Stateless agents require explicit context.** Subagents and agent personas don't share memory. The project structure, tech stack, and conventions need to be repeated in every agent definition. This feels redundant but is necessary — and it forces you to be precise about things you'd otherwise leave implicit.

**The test-first loop is the most valuable pattern.** Having the test agent write behavioral specs before (or independently of) the implementation creates a productive tension. The tests become a contract that the dev agent must fulfill, not rubber-stamp.

---

## The agent team today

```
.github/agents/
├── dev-agent.md      # Implements features, runs build + type check
├── test-agent.md     # Writes behavioral tests, produces handoff reports on failure
└── docs-agent.md     # Reads code, writes documentation
```

The developer's role: product owner, reviewer, and the human in the loop at every handoff. The agents do the typing. The human does the thinking.
