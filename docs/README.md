# SVG Playground — User Guide

A browser-based playground for drawing SVG with React/JSX. Write code in the editor,
see a live preview, and wire up interactive controls (text inputs, sliders) using
built-in hooks.

---

## Running the project

```bash
npm install
npm run dev        # starts Vite dev server at http://localhost:5173
```

Other commands:

| Command | Purpose |
|---|---|
| `npm run build` | Production build to `dist/` |
| `npm test` | Run the full test suite (Vitest) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run lint:docs` | Lint all `docs/` markdown files |

---

## Layout

The app is a three-panel horizontal layout:

```text
┌──────────────────┬──────────────────┬──────────────┐
│                  │                  │              │
│   Code Editor    │   SVG Preview    │  Tools Panel │
│   (CodeMirror)   │   (live output)  │  (300 px)    │
│                  │                  │              │
└──────────────────┴──────────────────┴──────────────┘
```

- **Code Editor** — Write JSX. The editor debounces changes by 500 ms before recompiling.
  - **Autocompletion** for `useInput`, `useRange`, `React.*` members, and common SVG elements. Completions include parameter snippets with tab stops.
  - **Inline error markers** — syntax/compile errors are underlined directly in the editor with a gutter icon, in addition to the error overlay in the preview panel.
  - **Ctrl+S / Cmd+S — Autoformat** — pressing the save shortcut re-indents the entire document using the JS/JSX language grammar. The browser's native save dialog is suppressed.
- **SVG Preview** — Renders the compiled component inside a React ErrorBoundary. Supports
  pan (drag) and zoom (scroll or the ±/% buttons in the corner).
- **Tools Panel** — Displays controls registered by `useInput()` and `useRange()` calls in
  your code. Changes to controls update the preview in real time. For range sliders,
  the current value is shown as an **editable number input** to the right of the slider —
  click it to type an exact value. No min/max/step validation is applied to the typed
  value, so you can enter numbers outside the slider's configured range.

---

## Writing code

Your code is the **body of a React function component**. It must end with a `return`
statement that returns JSX.

```jsx
// Simple example
return <svg width="200" height="200">
  <circle cx="100" cy="100" r="80" fill="coral" />
</svg>;
```

The following identifiers are available in scope (the editor provides autocompletion for all of them):

| Identifier | Description |
|---|---|
| `React` | React 18 — required for JSX. Type `React.` to autocomplete hooks and utilities. |
| `useInput(label, defaultValue?)` | Registers a text input in the Tools panel |
| `useRange(label, min, max, defaultValue?, step?)` | Registers a range slider |

Any other JavaScript is fine: variables, helper functions, template literals, destructuring, etc.

### Safety limits

The editor guards against code patterns that would permanently freeze the browser tab.
The following loop constructs are **rejected at compile time** and will show an error
in the preview panel instead of executing:

```js
while(true) { … }      // rejected
while(1)    { … }      // rejected
do { } while(true);    // rejected
for(;;)     { … }      // rejected
for(let i = 0; ; i++)  // rejected — empty condition slot
```

Finite loops with a real termination condition work normally:

```js
for (let i = 0; i < 10; i++) { … }   // ✓ fine
while (x < maxSize) { … }             // ✓ fine
```

Infinite **recursion** (stack overflow) is not a freeze — it throws a `RangeError`
that is caught by the preview's error boundary and displayed as a regular error message.

---

## `useInput(label, defaultValue?)`

Registers a text input in the Tools panel and returns its current value.

**Parameters:**

| Name | Type | Default | Description |
|---|---|---|---|
| `label` | `string` | — | Label shown above the input |
| `defaultValue` | `string` | `""` | Initial value |

**Returns:** `string` — updates live as the user types.

**Example:**

```jsx
const name = useInput("Name", "World");

return (
  <svg width="300" height="100">
    <text x="150" y="60" textAnchor="middle" fontSize="32">{name}</text>
  </svg>
);
```

---

## `useRange(label, min, max, defaultValue?, step?)`

Registers a range slider in the Tools panel and returns its current numeric value.

**Parameters:**

| Name | Type | Default | Description |
|---|---|---|---|
| `label` | `string` | — | Label shown above the slider |
| `min` | `number` | `0` | Minimum value |
| `max` | `number` | `100` | Maximum value |
| `defaultValue` | `number` | `min` | Initial value |
| `step` | `number` | `1` | Slider step increment |

**Returns:** `number` — updates live as the user drags the slider or types in the value input.

**Example:**

```jsx
const radius = useRange("Radius", 10, 150, 80);
const hue    = useRange("Hue", 0, 360, 200, 5);

return (
  <svg width="300" height="300">
    <circle
      cx="150" cy="150"
      r={radius}
      fill={`hsl(${hue}, 70%, 55%)`}
    />
  </svg>
);
```

---

## Persistence

Your work is automatically saved to `localStorage` and restored on next load:

- **Code** is saved on every keystroke under the key `svg-playground:code`.
- **Tool values** (slider positions, text input contents) are saved whenever they change
  under `svg-playground:tools`.

### Sharing

The full playground state (code + tool values) is also encoded in the URL as a `?s=`
query parameter. The URL updates automatically 800 ms after the last change.

To share your work: **copy the current browser URL** and send it. When someone opens the
link, both the code and their saved tool values are restored from the URL — regardless
of what is in their `localStorage`.

The encoded value is compact: the state is serialised as JSON, compressed with
`deflate-raw` (native `CompressionStream`), and encoded as Base64url. A typical 20-line
sketch encodes to roughly 200–300 characters.

### Resetting to defaults

Click **Reset to Defaults** at the bottom of the Tools panel to clear all saved state and
restore the built-in example code.

---

## Default example

When no saved code exists the editor loads this example:

```jsx
const name = useInput("Name", "World");
const size = useRange("Size", 10, 200, 100);
const hue  = useRange("Hue", 0, 360, 200);

return (
  <svg width="400" height="400" viewBox="0 0 400 400">
    <rect width="400" height="400" fill={`hsl(${hue}, 70%, 95%)`} />
    <circle cx="200" cy="200" r={size} fill={`hsl(${hue}, 70%, 50%)`} />
    <text
      x="200" y="200"
      textAnchor="middle" dominantBaseline="central"
      fill="white" fontSize="24"
    >
      {name}
    </text>
  </svg>
);
```
