# SVG Playground — Implementation Plan

## 1. Project Overview

A browser-based playground for drawing SVG using React/JSX code. Users write code in an editor (treated as the body of a React component), see a live SVG preview, and can register interactive controls (inputs, sliders) via custom hooks that render in a dedicated tools panel.

---

## 2. Tech Stack

| Concern | Choice | Rationale |
|---|---|---|
| Framework | React 18+ | Required |
| Build tool | Vite | Required |
| Language | TypeScript | Type safety for the host app |
| Code editor | **CodeMirror 6** (`@codemirror/view`, `@codemirror/lang-javascript`) | Lighter than Monaco (~50KB vs ~2MB), modular, modern architecture. Alternatively, Monaco can be used via `@monaco-editor/react` if preferred. |
| JSX transform | **Sucrase** (browser build) | Fast, lightweight JSX → `React.createElement` transform (~15KB). No need for full Babel. |
| Styling | CSS Modules or plain CSS | Keep it simple; no heavy CSS framework needed |
| State management | React Context + `useRef`/`useState` | Sufficient for this scope; no external lib needed |

### Dependencies to install

```bash
npm create vite@latest svg-playground -- --template react-ts
cd svg-playground
npm install @codemirror/view @codemirror/state @codemirror/lang-javascript @codemirror/theme-one-dark codemirror sucrase
```

---

## 3. Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                        App.tsx                          │
│                                                         │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │             │  │              │  │               │  │
│  │ CodeEditor  │  │  SvgPreview  │  │  ToolsPanel   │  │
│  │             │  │              │  │               │  │
│  │ (CodeMirror │  │ (Renders the │  │ (Renders      │  │
│  │  instance)  │  │  dynamic     │  │  registered   │  │
│  │             │  │  component   │  │  useInput &   │  │
│  │ Emits code  │  │  inside an   │  │  useRange     │  │
│  │ on change   │  │  ErrorBound- │  │  controls)    │  │
│  │ (debounced) │  │  ary + <svg> │  │               │  │
│  └──────┬──────┘  └──────▲───────┘  └───────▲───────┘  │
│         │               │                  │           │
│         │        userCode (string)          │           │
│         ▼               │                  │           │
│  ┌──────────────────────┴──────────────────┴────────┐  │
│  │              Execution Engine                     │  │
│  │                                                   │  │
│  │  1. Sucrase transforms JSX → createElement calls  │  │
│  │  2. new Function() wraps code into a component    │  │
│  │  3. Injects React, useInput, useRange into scope  │  │
│  │  4. Returns the component to SvgPreview           │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │              ToolsRegistry (Context)              │  │
│  │                                                   │  │
│  │  tools: Array<ToolDef>                            │  │
│  │  toolValues: Map<index, value>                    │  │
│  │  setToolValue(index, value)                       │  │
│  │  resetRegistry() — called before each render      │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## 4. File Structure

```
svg-playground/
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
└── src/
    ├── main.tsx                    # Entry point: renders <App />
    ├── App.tsx                     # Root: layout + state orchestration
    ├── App.css                     # Global + layout styles
    │
    ├── components/
    │   ├── CodeEditor.tsx          # CodeMirror wrapper
    │   ├── SvgPreview.tsx          # Renders dynamic user component
    │   ├── ToolsPanel.tsx          # Renders registered tool controls
    │   └── ErrorOverlay.tsx        # Error display overlay for preview
    │
    ├── engine/
    │   ├── compiler.ts             # JSX transform via Sucrase
    │   ├── createComponent.ts      # Wraps transpiled code into React component
    │   └── ErrorBoundary.tsx       # React ErrorBoundary for safe rendering
    │
    ├── hooks/
    │   ├── useToolsRegistry.ts     # The tools registry: state, register, reset
    │   └── createUserHooks.ts      # Factory: creates useInput & useRange bound to registry
    │
    └── types.ts                    # Shared type definitions
```

---

## 5. Detailed Component Specifications

### 5.1 `types.ts` — Shared Types

```typescript
export interface ToolDef {
  index: number;         // Call-order based index (stable across re-renders)
  type: 'input' | 'range';
  label: string;
  value: string | number;
  config: InputConfig | RangeConfig;
}

export interface InputConfig {
  type: 'input';
  defaultValue: string;
}

export interface RangeConfig {
  type: 'range';
  min: number;
  max: number;
  step: number;
  defaultValue: number;
}

export interface ToolsRegistryState {
  tools: ToolDef[];
  setToolValue: (index: number, value: string | number) => void;
}

export interface CompilationResult {
  success: true;
  component: React.ComponentType;
} | {
  success: false;
  error: string;
}
```

---

### 5.2 `App.tsx` — Root Component & State Orchestration

**Responsibilities:**
- Holds the user code string in state (initialized with a default example)
- Holds the tools registry state
- Coordinates compilation: when code changes (debounced ~500ms) or tool values change, recompile and re-render
- Manages the three-panel layout

**State:**
```typescript
const [code, setCode] = useState<string>(DEFAULT_CODE);
const { tools, setToolValue, registryRef, resetRegistry } = useToolsRegistry();
const [compilationResult, setCompilationResult] = useState<CompilationResult | null>(null);
const [error, setError] = useState<string | null>(null);
```

**Layout:** A CSS Grid or Flexbox horizontal split:
```
┌──────────────┬──────────────┬──────────────┐
│              │              │              │
│  CodeEditor  │  SvgPreview  │  ToolsPanel  │
│   (flex: 1)  │   (flex: 1)  │  (300px)     │
│              │              │              │
└──────────────┴──────────────┴──────────────┘
```

**Key logic (in `useEffect` or `useMemo`):**
```typescript
// Debounce code changes
const debouncedCode = useDebounce(code, 500);

// Compile when code changes
useEffect(() => {
  const result = compileUserCode(debouncedCode, registryRef, resetRegistry);
  if (result.success) {
    setCompilationResult(result);
    setError(null);
  } else {
    setError(result.error);
  }
}, [debouncedCode]);
```

**Default example code:**
```javascript
const DEFAULT_CODE = `\
const name = useInput("Name", "World");
const size = useRange("Size", 10, 200, 100);
const hue = useRange("Hue", 0, 360, 200);

return (
  <svg width="400" height="400" viewBox="0 0 400 400">
    <rect width="400" height="400" fill={\`hsl(\${hue}, 70%, 95%)\`} />
    <circle
      cx="200"
      cy="200"
      r={size}
      fill={\`hsl(\${hue}, 70%, 50%)\`}
    />
    <text
      x="200"
      y="200"
      textAnchor="middle"
      dominantBaseline="central"
      fill="white"
      fontSize="24"
    >
      {name}
    </text>
  </svg>
);`;
```

---

### 5.3 `components/CodeEditor.tsx`

**Props:**
```typescript
interface CodeEditorProps {
  value: string;
  onChange: (code: string) => void;
}
```

**Responsibilities:**
- Renders a CodeMirror 6 editor instance
- Configured for JSX/JavaScript syntax highlighting via `@codemirror/lang-javascript` with `jsx: true`
- Uses a dark theme (`@codemirror/theme-one-dark` or similar)
- Calls `onChange` on every document change
- The parent handles debouncing, not this component

**Implementation notes:**
- Use `useRef` for the editor container div
- Create the `EditorView` in a `useEffect` on mount
- Use a `ViewPlugin` or `EditorView.updateListener` to emit changes
- Update the editor content when `value` prop changes externally (avoid infinite loops — compare with current doc content before dispatching)
- Configure extensions: `javascript({ jsx: true })`, theme, line numbers, bracket matching, auto-close brackets

**Skeleton:**
```typescript
import { useRef, useEffect } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorState } from '@codemirror/state';

export function CodeEditor({ value, onChange }: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          javascript({ jsx: true }),
          oneDark,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChange(update.state.doc.toString());
            }
          }),
        ],
      }),
      parent: containerRef.current,
    });
    viewRef.current = view;
    return () => view.destroy();
  }, []); // Mount only once

  return <div ref={containerRef} className="code-editor" />;
}
```

---

### 5.4 `engine/compiler.ts` — JSX Transformation

**Responsibilities:**
- Takes raw user code (JSX/JS) and transforms it to plain JS using Sucrase
- Returns the transformed code string or an error

```typescript
import { transform } from 'sucrase';

export function compileJSX(code: string): { code: string } | { error: string } {
  try {
    const result = transform(code, {
      transforms: ['jsx'],
      jsxRuntime: 'classic',  // Uses React.createElement
      production: true,
    });
    return { code: result.code };
  } catch (e: any) {
    return { error: e.message ?? 'Compilation error' };
  }
}
```

**Why `jsxRuntime: 'classic'`:** Because we inject `React` into the function scope. The classic runtime uses `React.createElement` which is available via the injected `React` variable.

---

### 5.5 `engine/createComponent.ts` — Component Factory

**Responsibilities:**
- Takes transpiled JS code and creates a React component
- Injects `React`, `useInput`, `useRange` into the function's scope
- Resets the tool call index before each render

**This is the most critical file.** The approach:

```typescript
import React from 'react';
import { compileJSX } from './compiler';

export function createUserComponent(
  rawCode: string,
  userHooks: { useInput: Function; useRange: Function },
  resetCallIndex: () => void
): { component: React.ComponentType } | { error: string } {

  // Step 1: Transform JSX
  const compiled = compileJSX(rawCode);
  if ('error' in compiled) return { error: compiled.error };

  // Step 2: Wrap into a component function body
  // The user code IS the function body; it must end with a return statement
  const wrappedCode = `
    "use strict";
    return function UserSVGComponent() {
      __resetCallIndex__();
      ${compiled.code}
    };
  `;

  // Step 3: Create the component via new Function
  try {
    const factory = new Function(
      'React',
      'useInput',
      'useRange',
      '__resetCallIndex__',
      wrappedCode
    );

    const component = factory(
      React,
      userHooks.useInput,
      userHooks.useRange,
      resetCallIndex
    );

    return { component };
  } catch (e: any) {
    return { error: e.message ?? 'Runtime error' };
  }
}
```

**Key design decisions:**
- `__resetCallIndex__()` is called at the top of every render so the hook call-index starts from 0, just like React's internal hook index
- `"use strict"` for better error messages
- The component is re-created whenever the code changes, but NOT when tool values change (only the values change, triggering a re-render of the same component)

**Important:** The component must be memoized by code string. Only create a new component when the code text changes. When tool values change, the same component instance re-renders and the hooks return updated values. Use a `useRef` or `useMemo` keyed on the code string for this.

---

### 5.6 `hooks/useToolsRegistry.ts` — Tools Registry

**Responsibilities:**
- Manages the list of registered tools and their current values
- Provides a `register` function that hooks call to register themselves
- Provides a `setToolValue` function for the ToolsPanel
- Provides a `resetCallIndex` to reset the hook counter before each render
- Handles the case where the number of tools changes between renders (code edit)

**Data model:**
```typescript
interface RegistryEntry {
  index: number;
  type: 'input' | 'range';
  label: string;
  value: string | number;
  config: Record<string, any>; // min, max, step, etc.
}
```

**Implementation:**
```typescript
export function useToolsRegistry() {
  const [tools, setTools] = useState<RegistryEntry[]>([]);
  const callIndexRef = useRef(0);
  const pendingToolsRef = useRef<RegistryEntry[]>([]);

  const resetCallIndex = useCallback(() => {
    callIndexRef.current = 0;
    pendingToolsRef.current = [];
  }, []);

  const register = useCallback((
    type: 'input' | 'range',
    label: string,
    defaultValue: string | number,
    config: Record<string, any>
  ): { index: number; value: string | number } => {
    const index = callIndexRef.current++;

    // Check if this tool was already registered (from a previous render)
    const existing = tools[index];

    const entry: RegistryEntry = {
      index,
      type,
      label,
      // Keep existing value if tool already registered, otherwise use default
      value: existing && existing.type === type ? existing.value : defaultValue,
      config,
    };

    pendingToolsRef.current[index] = entry;

    return { index, value: entry.value };
  }, [tools]);

  // After user component renders, sync pendingTools → tools state
  const commitTools = useCallback(() => {
    const pending = pendingToolsRef.current;
    setTools((prev) => {
      if (JSON.stringify(prev) === JSON.stringify(pending)) return prev;
      return [...pending];
    });
  }, []);

  const setToolValue = useCallback((index: number, value: string | number) => {
    setTools((prev) => {
      const next = [...prev];
      if (next[index]) next[index] = { ...next[index], value };
      return next;
    });
  }, []);

  return { tools, register, setToolValue, resetCallIndex, commitTools };
}
```

**Sync mechanism:** After the user component renders, `commitTools()` is called (via `useEffect` in the `SvgPreview`) to update the tools list. This avoids setting state during render.

---

### 5.7 `hooks/createUserHooks.ts` — Hook Factory

**Responsibilities:**
- Creates `useInput` and `useRange` functions bound to the registry
- These are NOT standard React hooks (they don't call `useState` etc.) — they are synchronous functions that read from/write to the registry during render
- They look like hooks to the user and follow the same call-order contract

```typescript
export function createUserHooks(register: RegisterFn) {
  function useInput(label: string, defaultValue: string = ''): string {
    const { value } = register('input', label, defaultValue, {
      defaultValue,
    });
    return value as string;
  }

  function useRange(
    label: string,
    min: number = 0,
    max: number = 100,
    defaultValue?: number,
    step: number = 1
  ): number {
    const { value } = register('range', label, defaultValue ?? min, {
      min,
      max,
      step,
      defaultValue: defaultValue ?? min,
    });
    return value as number;
  }

  return { useInput, useRange };
}
```

**Signature visible to the user:**
- `useInput(label: string, defaultValue?: string) → string`
- `useRange(label: string, min: number, max: number, defaultValue?: number, step?: number) → number`

---

### 5.8 `components/SvgPreview.tsx`

**Props:**
```typescript
interface SvgPreviewProps {
  component: React.ComponentType | null;
  error: string | null;
  onRender: () => void;   // Called after render to commit tools
}
```

**Responsibilities:**
- Renders the dynamic user component inside an `ErrorBoundary`
- Shows compilation/runtime errors in an `ErrorOverlay`
- Calls `onRender` after successful render (to commit tool registrations)
- Has a white/checkered background suitable for SVG preview

**Implementation notes:**
- When `component` changes (new code), the ErrorBoundary must reset. Use a `key` prop on ErrorBoundary tied to the component reference or a version counter.
- The rendered SVG should be contained/scaled if it overflows the panel. Use `overflow: auto` on the container.

```tsx
export function SvgPreview({ component: UserComponent, error, onRender }: SvgPreviewProps) {
  useEffect(() => {
    if (UserComponent) onRender();
  });

  if (error) return <ErrorOverlay message={error} />;
  if (!UserComponent) return <div className="preview-empty">Write some code…</div>;

  return (
    <div className="svg-preview">
      <ErrorBoundary fallback={(err) => <ErrorOverlay message={err.message} />}>
        <UserComponent />
      </ErrorBoundary>
    </div>
  );
}
```

---

### 5.9 `engine/ErrorBoundary.tsx`

A standard React error boundary that catches render errors and displays them.

```typescript
interface Props {
  children: React.ReactNode;
  fallback: (error: Error) => React.ReactNode;
  resetKey?: any; // When this changes, reset the error state
}
```

- Uses `componentDidCatch` and `getDerivedStateFromError`
- Resets when `resetKey` prop changes (via `componentDidUpdate`)

---

### 5.10 `components/ToolsPanel.tsx`

**Props:**
```typescript
interface ToolsPanelProps {
  tools: ToolDef[];
  onToolValueChange: (index: number, value: string | number) => void;
}
```

**Responsibilities:**
- Renders a list of tool controls based on registered tools
- For `type: 'input'`: renders a labeled text `<input>`
- For `type: 'range'`: renders a labeled `<input type="range">` with min/max/step and a numeric display of the current value
- Calls `onToolValueChange` when any control changes

**Layout:** Vertical stack of labeled controls:
```
┌─────────────────────┐
│  🔧 Tools           │
│─────────────────────│
│  Name                │
│  [World         ]   │
│                     │
│  Size                │
│  ●──────────── 100  │
│                     │
│  Hue                 │
│  ────●──────── 200  │
└─────────────────────┘
```

**Implementation:**
```tsx
export function ToolsPanel({ tools, onToolValueChange }: ToolsPanelProps) {
  return (
    <div className="tools-panel">
      <h3>Tools</h3>
      {tools.length === 0 && <p className="tools-empty">No tools registered. Use useInput() or useRange() in your code.</p>}
      {tools.map((tool) => (
        <div key={tool.index} className="tool-control">
          <label>{tool.label}</label>
          {tool.type === 'input' ? (
            <input
              type="text"
              value={tool.value as string}
              onChange={(e) => onToolValueChange(tool.index, e.target.value)}
            />
          ) : (
            <div className="range-control">
              <input
                type="range"
                min={tool.config.min}
                max={tool.config.max}
                step={tool.config.step}
                value={tool.value as number}
                onChange={(e) => onToolValueChange(tool.index, Number(e.target.value))}
              />
              <span className="range-value">{tool.value}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
```

---

### 5.11 `components/ErrorOverlay.tsx`

Simple error display component:

```tsx
export function ErrorOverlay({ message }: { message: string }) {
  return (
    <div className="error-overlay">
      <pre>{message}</pre>
    </div>
  );
}
```

Red-tinted background, monospace font, scrollable if the error is long.

---

## 6. Data Flow & Execution Lifecycle

### 6.1 On Code Change

```
User types in editor
       │
       ▼
CodeEditor calls onChange(newCode)
       │
       ▼
App.tsx sets code state → debounce (500ms)
       │
       ▼
compileUserCode(code) is called:
  1. Sucrase transforms JSX → JS
  2. new Function() wraps code into component
  3. useInput/useRange are injected into scope
       │
       ▼
New component is set in state → SvgPreview re-renders
       │
       ▼
User component renders:
  - resetCallIndex() resets counter to 0
  - Each useInput()/useRange() call:
      a. Gets current index, increments counter
      b. Calls register() to record the tool
      c. Returns existing value (if tool existed) or default
       │
       ▼
After render, commitTools() syncs pending tools → ToolsPanel
       │
       ▼
ToolsPanel renders controls
```

### 6.2 On Tool Value Change

```
User moves slider in ToolsPanel
       │
       ▼
onToolValueChange(index, newValue)
       │
       ▼
setToolValue(index, newValue) updates tools state
       │
       ▼
Component re-renders (tools state changed → register returns new value)
       │
       ▼
SVG preview updates with new value
```

**Important:** Changing a tool value does NOT recompile the code. It only triggers a re-render of the existing component. The `register` function reads the current value from the `tools` state array.

---

## 7. Styling Plan

### Layout (CSS Grid)
```css
.app {
  display: grid;
  grid-template-columns: 1fr 1fr 300px;
  height: 100vh;
  overflow: hidden;
}

.code-editor {
  overflow: hidden;
  border-right: 1px solid #2a2a2a;
}
.code-editor .cm-editor {
  height: 100%;
}

.svg-preview {
  display: flex;
  align-items: center;
  justify-content: center;
  background: white;
  /* Optional: checkered background for transparency */
  background-image:
    linear-gradient(45deg, #f0f0f0 25%, transparent 25%),
    linear-gradient(-45deg, #f0f0f0 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #f0f0f0 75%),
    linear-gradient(-45deg, transparent 75%, #f0f0f0 75%);
  background-size: 20px 20px;
  background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
  overflow: auto;
}

.tools-panel {
  background: #1e1e1e;
  color: #ccc;
  padding: 16px;
  overflow-y: auto;
  border-left: 1px solid #2a2a2a;
}
```

### Dark theme throughout, matching the code editor.

---

## 8. Edge Cases & Error Handling

| Scenario | Handling |
|---|---|
| Syntax error in user code | Sucrase returns error → shown in ErrorOverlay in preview panel. Last good render stays visible or is replaced by error. |
| Runtime error (e.g. undefined variable) | `new Function()` wrapped in try/catch → error shown in ErrorOverlay |
| Render error (e.g. invalid JSX structure) | `ErrorBoundary` catches → shows error. Resets when code changes (via `resetKey`). |
| Hook call order changes | `resetCallIndex()` + re-registration handles this. If a tool is removed (fewer hooks), extra tools are trimmed on `commitTools()`. If a tool is added, it gets its default value. |
| User returns non-SVG elements | Allow it. Preview renders whatever React elements the user returns. |
| Infinite loop in user code | Not handled in v1. Could add a timeout wrapper or Web Worker in a future iteration. |
| Empty editor | Show placeholder message in preview |

---

## 9. Implementation Order

Implement in this order to enable incremental testing:

### Phase 1: Project Scaffold
1. `npm create vite@latest` with `react-ts` template
2. Install dependencies (codemirror, sucrase)
3. Clean up boilerplate, set up basic file structure
4. Create `types.ts`

### Phase 2: Code Editor
5. Implement `CodeEditor.tsx` with CodeMirror 6
6. Wire up in `App.tsx` with basic state for code string
7. Verify: typing in editor updates state

### Phase 3: Compilation Engine
8. Implement `compiler.ts` (Sucrase JSX transform)
9. Implement `createComponent.ts` (wrapping + `new Function`)
10. Implement `ErrorBoundary.tsx`
11. Verify: simple JSX code compiles and creates a component

### Phase 4: SVG Preview
12. Implement `SvgPreview.tsx`
13. Implement `ErrorOverlay.tsx`
14. Wire preview into `App.tsx`
15. Verify: writing `return <svg><circle cx="50" cy="50" r="40" fill="red"/></svg>` shows a red circle

### Phase 5: Tools System
16. Implement `useToolsRegistry.ts`
17. Implement `createUserHooks.ts` (useInput, useRange)
18. Implement `ToolsPanel.tsx`
19. Inject hooks into the component factory scope
20. Wire tools panel into `App.tsx`
21. Verify: `useInput("Name", "World")` shows an input in the tools panel, changing it updates the SVG

### Phase 6: Styling & Polish
22. Implement three-panel CSS Grid layout
23. Style tools panel controls
24. Style error overlay
25. Add the default example code
26. Final testing of the full loop

---

## 10. API Reference for User Code

The code editor scope provides the following:

### `React`
The full React object — users can use `React.useState`, `React.useEffect`, etc. if needed.

### `useInput(label, defaultValue?) → string`
Registers a text input control in the Tools panel.
- `label` (string): The label shown above the input
- `defaultValue` (string, optional): Initial value. Defaults to `""`
- **Returns:** The current value of the input

### `useRange(label, min, max, defaultValue?, step?) → number`
Registers a range slider control in the Tools panel.
- `label` (string): The label shown above the slider
- `min` (number): Minimum value
- `max` (number): Maximum value
- `defaultValue` (number, optional): Initial value. Defaults to `min`
- `step` (number, optional): Step increment. Defaults to `1`
- **Returns:** The current numeric value

### Execution context
- User code is the **body** of a React function component
- Must contain a `return` statement returning JSX (typically an `<svg>` element)
- All standard JavaScript is available
- `console.log` works (outputs to browser DevTools)

---

## 11. Future Enhancements (Out of Scope for v1)

- `useColor(label, defaultValue)` — color picker tool
- `useSelect(label, options, defaultValue)` — dropdown selector tool
- `useCheckbox(label, defaultValue)` — boolean toggle tool
- Export SVG as file
- Share playground via URL (encode code in hash/query param)
- Web Worker execution for infinite loop protection
- Multiple "tabs" / saved sketches
- `useAnimation(fps)` — `requestAnimationFrame`-based animation hook
- Resizable panels (drag handles)
