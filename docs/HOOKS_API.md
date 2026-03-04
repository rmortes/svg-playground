# SVG Playground — Hooks API Reference

These hooks are available inside the code editor. They are **not** imported; they are
injected into the user component's scope automatically.

---

## `useInput(label, defaultValue?)`

Registers a text input in the Tools panel and returns its current value.

**Signature:**

```ts
function useInput(label: string, defaultValue?: string): string
```

**Parameters:**

| Name | Type | Default | Description |
|---|---|---|---|
| `label` | `string` | *(required)* | Label displayed above the input control |
| `defaultValue` | `string` | `""` | Initial value used on first load |

**Returns:** `string` — the current input value. Updates live as the user types.

**Behavior:**

- On first render, the input is initialised to `defaultValue` (or the value restored
  from `localStorage` if the playground was previously saved).
- On subsequent renders (e.g. after a code recompile that leaves the hook in the same
  call-order position), the existing user-modified value is preserved.
- Changing the value in the Tools panel triggers a re-render of the SVG preview.

**Example:**

```jsx
const greeting = useInput("Greeting", "Hello");
const color    = useInput("Color", "steelblue");

return (
  <svg width="300" height="80">
    <text x="150" y="50" textAnchor="middle" fontSize="28" fill={color}>
      {greeting}
    </text>
  </svg>
);
```

---

## `useRange(label, min, max, defaultValue?, step?)`

Registers a range slider in the Tools panel and returns its current numeric value.

**Signature:**

```ts
function useRange(
  label: string,
  min: number,
  max: number,
  defaultValue?: number,
  step?: number
): number
```

**Parameters:**

| Name | Type | Default | Description |
|---|---|---|---|
| `label` | `string` | *(required)* | Label displayed above the slider |
| `min` | `number` | `0` | Minimum value |
| `max` | `number` | `100` | Maximum value |
| `defaultValue` | `number` | `min` | Initial value used on first load |
| `step` | `number` | `1` | Step increment between slider positions |

**Returns:** `number` — the current slider value. Updates live as the user drags.

**Behavior:**

- On first render, the slider is initialised to `defaultValue`, falling back to `min`
  if omitted.
- On subsequent renders, the existing user-modified position is preserved as long as the
  hook stays at the same call-order position and retains the `range` type.
- Changing the slider position triggers a re-render of the SVG preview.
- An **editable number input** is shown to the right of the slider. You can click it and
  type any number — including values outside `[min, max]` or between step increments.
  No clamping or rounding is applied. Blurring the field with a non-numeric value
  reverts it to the last valid number.

**Example:**

```jsx
const radius = useRange("Radius", 10, 140, 70);
const sides  = useRange("Sides", 3, 12, 6, 1);
const hue    = useRange("Hue", 0, 360, 200, 5);

// Regular polygon using polar coordinates
const points = Array.from({ length: sides }, (_, i) => {
  const angle = (i / sides) * 2 * Math.PI - Math.PI / 2;
  return [150 + radius * Math.cos(angle), 150 + radius * Math.sin(angle)];
}).map(([x, y]) => `${x},${y}`).join(" ");

return (
  <svg width="300" height="300">
    <polygon points={points} fill={`hsl(${hue}, 65%, 55%)`} />
  </svg>
);
```

---

## Call-order stability

These hooks follow the same rule as React's built-in hooks:

> **Call hooks at the top level, in the same order on every render. Do not call them
> inside conditions, loops, or nested functions.**

Internally, each hook call is identified by a zero-based **call-order index** that
increments across all hook calls in a single render. If the order changes between
renders, the value registered at each index may be mismatched.

```jsx
// ✅ Good — hooks always called in the same order
const label = useInput("Label", "Hello");
const size  = useRange("Size", 10, 100, 50);

// ❌ Bad — conditional hook; index 0 may flip between input and range
if (someCondition) {
  const label = useInput("Label", "Hello");
}
const size = useRange("Size", 10, 100, 50);
```

---

## Persistence

Both hooks participate in automatic `localStorage` persistence:

- The registered **value** (not `defaultValue`) is saved to `localStorage` whenever
  it changes.
- On page reload, `useToolsRegistry` restores the saved values. Each hook call then
  receives the matching saved value at its call-order index rather than `defaultValue`.
- Clicking **Reset to Defaults** in the Tools panel clears `localStorage` and reverts
  all values to their `defaultValue`.

Tool values are also included in the shareable URL (see [URL state serialisation](ARCHITECTURE.md#url-state-serialisation)
in the architecture guide). When a visitor opens a shared URL, `useUrlSync` calls
`setTools` on the registry before the first render, so each `useInput` / `useRange`
call receives the sender's values rather than the visitor's `localStorage` values.

---

## Adding a new hook

To add a hook (e.g. `useCheckbox`):

### 1. Add a type to `src/types.ts`

```ts
export interface CheckboxConfig {
  type: 'checkbox';
  defaultValue: boolean;
}

// Add 'checkbox' to ToolDef.type union and ToolDef.config union
```

### 2. Implement the hook in `src/engine/createComponent.ts`

Inside `createUserComponent()`, alongside `useInput` and `useRange`:

```ts
function useCheckbox(label: string, defaultValue = false): boolean {
  const { value } = register('checkbox', label, defaultValue, {
    type: 'checkbox',
    defaultValue,
  });
  return value as boolean;
}
```

Then thread it through the `new Function` call:

```ts
const factory = new Function(
  'React', 'useInput', 'useRange', 'useCheckbox', '__resetCallIndex__',
  wrappedCode
);
const component = factory(React, useInput, useRange, useCheckbox, resetCallIndex);
```

### 3. Render the control in `src/components/ToolsPanel.tsx`

Add a branch in the `tools.map(...)`:

```tsx
) : tool.type === 'checkbox' ? (
  <input
    type="checkbox"
    checked={tool.value as boolean}
    onChange={(e) => onToolValueChange(tool.index, e.target.checked)}
  />
```

### 4. Register autocomplete in `src/components/CodeEditor.tsx`

Append a `snippetCompletion` to `HOOK_COMPLETIONS`:

```ts
snippetCompletion('useCheckbox("${label}", ${false})', {
  label: 'useCheckbox',
  detail: '(label, defaultValue?) → boolean',
  info: 'Registers a checkbox in the Tools panel. Returns the current boolean value.',
  type: 'function',
  boost: 10,
}),
```

### 5. Write tests

- **Unit** (`tests/hooks/useToolsRegistry.test.ts`): register a `'checkbox'` type,
  verify `commitTools`, `setToolValue`, localStorage round-trip.
- **Component** (`tests/components/ToolsPanel.test.tsx`): render `ToolsPanel` with a
  `checkbox` tool and assert the `<input type="checkbox">` is present.
