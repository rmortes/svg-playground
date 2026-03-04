# SVG Playground — Architecture

## High-level diagram

```text
┌────────────────────────────────────────────────────────────┐
│                          App.tsx                           │
│                                                            │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ CodeEditor  │  │  SvgPreview  │  │    ToolsPanel     │  │
│  │ (CodeMirror)│  │              │  │                   │  │
│  │             │  │ ErrorBoundary│  │ inputs, sliders   │  │
│  │ emits code  │  │ + UserComp   │  │ + Reset button    │  │
│  └──────┬──────┘  └──────▲───────┘  └────────▲──────────┘  │
│         │                │                   │             │
│         │ (debounced)    │ component         │ tools[]     │
│         ▼                │                   │             │
│  ┌──────────────────────┬┘       ┌───────────┴──────────┐  │
│  │   Execution Engine   │        │   useToolsRegistry   │  │
│  │                      │        │                      │  │
│  │  compileJSX()        │        │  tools: ToolDef[]    │  │
│  │  createUserComponent │        │  register()          │  │
│  │                      │        │  commitTools()       │  │
│  └──────────────────────┘        │  setToolValue()      │  │
│                                  │  clearTools()        │  │
│                                  │  localStorage ↔ state│  │
│                                  └──────────────────────┘  │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  .mobile-tab-bar  (rendered in DOM; hidden ≥ 769 px) │  │
│  │  [ Code ]  [ Tools ]  ← drives mobileTab state       │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

---

## Compilation pipeline

Every time the debounced code string changes (500 ms after the last keystroke),
`App.tsx` calls `createUserComponent()`. The pipeline has three stages:

### Stage 1 — Static analysis + JSX transform (`compiler.ts`)

`compileJSX(rawCode)` runs two steps:

**Step 1a — Infinite loop guard (`detectInfiniteLoops`).**  
Before any compilation, the raw source string is checked against a set of regex
patterns that match obviously-infinite loop constructs:

| Pattern | Example |
|---|---|
| `while(true)` / `while(1)` | `while(true) { … }`, `do { } while(1)` |
| `for` loop with empty condition | `for(;;)`, `for(let i = 0; ; i++)` |

If a match is found, `compileJSX` immediately returns `{ error: "Infinite loop detected: …" }`
without invoking Sucrase. This prevents a component that would permanently freeze the
browser main thread from ever being created.

Finite loops with a real termination condition (e.g. `for (let i = 0; i < 10; i++)`) are
unaffected.

**Step 1b — JSX transform.**  
If no infinite-loop pattern is found, the code is passed through **Sucrase** with the
`jsx` transform enabled. Sucrase converts JSX syntax to `React.createElement(...)` calls.
No TypeScript stripping is performed; the editor accepts plain JS/JSX.

Returns `{ code: string }` on success or `{ error: string }` on failure.

### Stage 2 — Hook binding (`createComponent.ts`)

`createUserComponent()` builds two thin hook wrappers — `useInput` and `useRange` —
that close over the `register` function from `useToolsRegistry`. These wrappers are
what get injected into the user component's scope.

### Stage 3 — `new Function()` factory

The transpiled code is wrapped as the body of a named React function component and
evaluated via `new Function(...)`:

```js
"use strict";
return function UserSVGComponent() {
  __resetCallIndex__();
  /* user code here */
};
```

`React`, `useInput`, `useRange`, and `__resetCallIndex__` are passed as formal
parameters so they are available in the component's scope without touching `window`.
The resulting component is stored in `App` state and rendered by `SvgPreview`.

---

## Tools registry lifecycle

`useToolsRegistry` manages the relationship between hook calls inside the user
component and the control widgets rendered in `ToolsPanel`.

```text
Per render cycle:
  1. resetCallIndex()     — called by UserSVGComponent on every render
                            resets the call-order counter to 0 and clears
                            the pending buffer
  2. register(...)        — called once per useInput / useRange call
                            looks up existing value by call-order index,
                            appends entry to pendingToolsRef
  3. commitTools()        — called by SvgPreview.onAfterRender after the
                            component render finishes; moves pendingToolsRef
                            into React state (setTools)
```

A shallow-equality check inside `commitTools` prevents a re-render when the
tools array did not change structurally (same length, type, label, and value).

### Value preservation

`register()` checks whether a tool already exists at the same call-order index
**with the same type**. If so it returns the existing `value` rather than the
`defaultValue`. This is how user-modified slider/input values survive code
recompiles that don't change the hook's position.

If the type at a given index changes (e.g. `useInput` replaced by `useRange`),
the tool reverts to the new default.

---

## Pan/zoom (`usePanZoom`)

`SvgPreview` wraps the user component in two nested `<div>` elements:

```text
<div class="svg-preview"  ref={containerRef}>    ← event target, flex container
  <div class="svg-preview-canvas" ref={canvasRef}
       style={{ transform: "translate(Xpx, Ypx) scale(S)" }}>  ← transformed element
    <UserComponent />
  </div>
  <div class="svg-preview-controls" data-no-pan>  ← zoom buttons
    …
  </div>
</div>
```

All pointer and wheel events are registered on `containerRef` (the outer div) as
**native listeners** (not React synthetic events) so that:

- `wheel` can be registered with `{ passive: false }` to call `preventDefault()` and
  suppress page scroll.
- `pointerdown` can call `setPointerCapture` to keep receiving `pointermove` even when
  the cursor leaves the container.

### Zoom-origin math

Zooming toward the cursor requires keeping the content point under the cursor fixed
before and after the scale change. With `transform-origin: 0 0` on the canvas div, the
transform is:

```text
content_point = (screen_point - translate) / scale
```

For the same content point to map to the same screen position after a scale change from
`S` to `S'`:

```text
newX = dx * (1 - ratio) + prevX
newY = dy * (1 - ratio) + prevY
```

where `dx/dy` is the cursor position **relative to the canvas element's own
`getBoundingClientRect()`**, and `ratio = S' / S`.

Using the **canvas** rect (not the container rect) is critical: the container uses
`align-items: center` and `justify-content: center`, which offsets the canvas from the
container's top-left by an amount equal to half the difference in their sizes. Using
the container rect as the origin introduces a systematic offset to the zoom point equal
to that flex centering offset.

### SVG crispness

Applying `will-change: transform` to the canvas div would promote it to a GPU
compositing layer and rasterize the SVG content at its original pixel size, causing
pixelation when zoomed in. The canvas div intentionally omits `will-change` so the
browser repaints from the vector source at the correct resolution on every frame.

---

## localStorage persistence

Two keys are stored:

| Key | Contents | Written by | Read by |
|---|---|---|---|
| `svg-playground:code` | Raw code string | `App.tsx` `useEffect([code])` | `App.tsx` initial state |
| `svg-playground:tools` | `JSON.stringify(ToolDef[])` | `useToolsRegistry` `useEffect([tools])` | `useToolsRegistry` initial state via `loadSavedTools()` |

### Write rules

- **Code** — written on every `code` state change.
- **Tools** — written whenever `tools` state changes; skipped when the array is
  empty to avoid overwriting valid stored data with an empty snapshot.

### Read rules — the reload-safe guard

On page load the `tools` state is initialised from `localStorage` before the user
component has compiled. Because `SvgPreview` receives `component={null}` during
this window, it deliberately **skips** calling `onAfterRender` (and therefore
`commitTools`) until a real component is present. This prevents the empty pending
buffer from wiping the restored tools state before the first render.

```tsx
// SvgPreview.tsx
useEffect(() => {
  if (UserComponent) {     // ← guard: only commit when hooks actually ran
    onAfterRender();
  }
});
```

### Reset flow

The **Reset to Defaults** button in `ToolsPanel` calls `handleReset` in `App.tsx`:

1. `localStorage.removeItem('svg-playground:code')`
2. `clearTools()` — sets `tools` to `[]` and removes `svg-playground:tools`
3. `setCode(DEFAULT_CODE)` — restores the built-in example

---

## Mobile responsive layout

On viewports ≤ 768 px the desktop CSS grid is replaced by a flex column
(`App.css` `@media (max-width: 768px)`).

### DOM order vs. visual order

The desktop layout uses named `grid-template-areas` so that the markup order (editor →
preview → tools) is independent of the three-column visual order. On mobile the same
DOM order plus `order` properties produces:

| `order` | Element | Height |
|---|---|---|
| 1 | `.svg-preview` | `56vw`, min `180px` |
| 2 | `.mobile-tab-bar` | intrinsic (~42 px) |
| 3 | `.code-editor` | `100vh` |
| 4 | `.tools-panel` | `100vh` |

### Natural keyboard scroll

The `.app` container switches from `height: 100vh; overflow: hidden` (desktop) to
`height: auto; overflow: visible` (mobile). This means the total page height is
`56vw + ~42px + 100vh`, which is greater than `100vh`, so a natural scroll range
exists. When the user taps the editor and the soft keyboard opens, the browser
automatically scrolls the page so the focused element is visible — the SVG preview
slides off the top of the viewport without any JavaScript.

### Tab switching

`App.tsx` holds a `mobileTab: 'editor' | 'tools'` state value (default `'editor'`).
It is written as a `data-mobile-tab` attribute on the root `.app` div. Two CSS
attribute selectors in the mobile media query hide the inactive panel:

```css
.app[data-mobile-tab="tools"]  .code-editor  { display: none; }
.app[data-mobile-tab="editor"] .tools-panel  { display: none; }
```

The tab bar itself is a `role="tablist"` div with two `role="tab"` buttons. It is
rendered in the DOM at all times but hidden on desktop via `display: none`.

---

## File structure

```text
svg-playground/
├── src/
│   ├── App.tsx                  # Root: layout, state, persistence wiring, mobileTab
│   ├── types.ts                 # ToolDef, RegisterFn, CompilationResult
│   │
│   ├── components/
│   │   ├── CodeEditor.tsx       # CodeMirror 6 wrapper; Ctrl/Cmd+S autoformat keymap
│   │   ├── SvgPreview.tsx       # Renders user component; pan/zoom; onAfterRender guard
│   │   ├── ToolsPanel.tsx       # Control widgets + Reset button; RangeValueInput (editable number field)
│   │   └── ErrorOverlay.tsx     # Compile/runtime error display
│   │
│   ├── engine/
│   │   ├── compiler.ts          # Sucrase JSX → JS transform
│   │   ├── createComponent.ts   # Hook injection + new Function() factory
│   │   └── ErrorBoundary.tsx    # React error boundary for preview panel
│   │
│   └── hooks/
│       ├── useToolsRegistry.ts  # Tools state, localStorage persistence
│       └── usePanZoom.ts        # Pan/zoom interaction for SVG preview
│
└── tests/
    ├── setup.ts                 # localStorage mock + afterEach cleanup
    ├── engine/
    │   ├── compiler.test.ts
    │   └── createComponent.test.ts
    ├── hooks/
    │   ├── useToolsRegistry.test.ts
    │   └── usePanZoom.test.ts
    ├── components/
    │   ├── CodeEditor.test.tsx
    │   ├── ToolsPanel.test.tsx
    │   ├── SvgPreview.test.tsx
    │   └── ErrorOverlay.test.tsx
    └── integration/
        ├── pipeline.test.tsx
        └── freezeProtection.test.tsx
```

---

## Test suite

The project uses **Vitest** with **@testing-library/react** in a jsdom environment.
The test setup (`tests/setup.ts`) stubs `localStorage` with an in-memory store and
clears it in `afterEach` so tests are isolated.

### Coverage summary (162 tests)

| File | Tests | Areas covered |
|---|---|---|
| `engine/compiler.test.ts` | 12 | Sucrase transform, error cases, infinite-loop guard (patterns + finite-loop pass-through) |
| `engine/createComponent.test.ts` | 9 | Component factory, hook injection |
| `hooks/useToolsRegistry.test.ts` | 17 | register, commitTools, setToolValue, clearTools, localStorage read/write/reload |
| `hooks/usePanZoom.test.ts` | 18 | Pan (drag, accumulation, pointer up, no-pan guard, pointerId isolation), scroll zoom (in/out, min/max clamp), zoomIn/zoomOut buttons, reset, combined pan+zoom |
| `components/CodeEditor.test.tsx` | 21 | Rendering, initial content, external value sync, lint diagnostics (set/clear), TSX/JSX syntax, lint gutter, autocompletion extension, cleanup, Ctrl+S autoformat (re-indent, no-op guard, `preventDefault`, JSX nesting) |
| `components/ToolsPanel.test.tsx` | 19 | Rendering, interactions, Reset button; `RangeValueInput` — typing a value, out-of-range values (above max, below min, off-step), empty-string no-op, blur revert, decimal input, prop-driven sync, absence of min/max/step attributes |
| `components/SvgPreview.test.tsx` | 14 | States (empty/error/component), onAfterRender guard, zoom control rendering, button interactions, canvas transform wrapper |
| `components/ErrorOverlay.test.tsx` | 4 | Error display |
| `integration/pipeline.test.tsx` | 11 | Full compile → render → tools pipeline; localStorage round-trips |
| `integration/freezeProtection.test.tsx` | 8 | Infinite loop detection (`while(true)`, `for(;;)`, `while(1)`, empty-condition `for`, `do-while(true)`); finite loops pass-through; infinite recursion produces a catchable throw |

### Persistence-specific tests

The persistence feature is exercised across two test files:

**`useToolsRegistry.test.ts` — unit level:**

- `persists committed tools to localStorage` — verifies `setItem` is called with correct JSON
- `persists updated tool values to localStorage after setToolValue` — verifies writes after value changes
- `loads saved tools from localStorage on initialization` — verifies `loadSavedTools()` at init
- `returns saved value from register when tools were loaded from localStorage` — end-to-end
  value restoration through `register()`
- `falls back to empty array when localStorage contains invalid JSON` — error resilience
- `does not write to localStorage when tools array is empty` — write guard
- `clears all tools and removes from localStorage` — `clearTools()` contract

**`integration/pipeline.test.tsx` — integration level:**

- `tool values survive a simulated reload (unmount → remount hook)` — full round-trip
- `register returns persisted value after simulated reload` — range value round-trip
- `clearTools resets tools and subsequent reload starts empty` — reset + reload
- `code is persisted to and loaded from localStorage` — code key contract
- `commitTools does not overwrite saved tools when called with empty pending list` — reload guard

---

## How to add a new hook

1. **Define the hook signature** in `src/types.ts` if it needs a new config shape.

2. **Implement the hook function** inside `createUserComponent()` in
   `src/engine/createComponent.ts`. The hook should call `register()` and return
   the value:

   ```ts
   function useCheckbox(label: string, defaultValue = false): boolean {
     const { value } = register('checkbox', label, defaultValue, {
       type: 'checkbox',
       defaultValue,
     });
     return value as boolean;
   }
   ```

3. **Pass it into the `new Function` factory** — add it as a parameter and argument:

   ```ts
   const factory = new Function(
     'React', 'useInput', 'useRange', 'useCheckbox', '__resetCallIndex__',
     wrappedCode
   );
   const component = factory(React, useInput, useRange, useCheckbox, resetCallIndex);
   ```

4. **Render the control** — add a new branch in `ToolsPanel.tsx` for the new `type`.

5. **Write tests** — add unit tests in `tests/hooks/useToolsRegistry.test.ts` for
   the new type and a rendering test in `tests/components/ToolsPanel.test.tsx`.

---

## Documentation linting

All files under `docs/` are linted with
[**markdownlint-cli2**](https://github.com/DavidAnson/markdownlint-cli2)
(`markdownlint-cli2` dev dependency, `npm run lint:docs`).

Project-level rules are defined in [`.markdownlint.jsonc`](../.markdownlint.jsonc)
at the repo root:

| Rule | Setting | Reason |
|---|---|---|
| MD013 (line length) | disabled | 80-char limit is too restrictive for tables and long code comments |
| MD060 (table separators) | disabled | Allows compact separator rows without padding spaces on each side |

All other markdownlint defaults remain active. Run `npm run lint:docs` to
check docs locally before committing.

---

## Key design decisions

| Decision | Rationale |
|---|---|
| Call-order index (like React hooks rules) | Avoids needing unique keys in user code; keeps the API minimal |
| `commitTools` inside `onAfterRender`, not during render | Calling `setState` during render would require a second pass; deferring to an effect is safe and synchronous to the paint |
| `new Function()` instead of `eval` | Allows explicit control over the injected scope; avoids leaking host globals |
| Sucrase instead of Babel | ~15 KB vs ~300 KB; does only what's needed (JSX transform) |
| Skip `commitTools` when `component` is null | Prevents an empty `pendingToolsRef` from overwriting the localStorage-restored tools on the first render after a page reload |
| Guard writes when `tools.length === 0` | Avoids a flash-write of `[]` to localStorage during the brief window between page load and first component render |
| Zoom origin uses `canvasRef.getBoundingClientRect()`, not `containerRef` | The container uses flex centering, which offsets the canvas from the container's origin; measuring the canvas directly eliminates that offset |
| No `will-change: transform` on the canvas div | Prevents GPU rasterisation of the SVG at its original pixel dimensions; the browser repaints from vector source at the correct resolution on every frame, keeping SVGs crisp at any zoom level |
| Static regex analysis for infinite loops rather than loop-counter injection | A regex pre-pass is simple, zero-overhead at runtime, and covers the common accidental patterns. Loop-counter injection (transforming every loop body) would be more complete but adds AST complexity and runtime cost on every render. Infinite recursion is not guarded this way because it throws a catchable `RangeError` rather than freezing — the `ErrorBoundary` and `new Function` wrapper already handle it. |
| Mobile layout uses `height: auto` + natural page scroll instead of a fixed viewport | Lets the browser's built-in scroll-to-focused-element behaviour move the SVG preview out of the way when the soft keyboard opens — zero JavaScript required |
| Tab switching driven by a `data-mobile-tab` attribute + CSS attribute selectors | Keeps tab logic in CSS; React only manages a single string state value and sets the attribute |
| Tab bar rendered in DOM on all breakpoints, hidden via `display: none` on desktop | Simpler than conditional rendering; avoids remounting the panels when resizing across the breakpoint |
