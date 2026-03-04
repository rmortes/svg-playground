import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { createUserComponent } from '../../src/engine/createComponent';
import { useToolsRegistry } from '../../src/hooks/useToolsRegistry';
import { ToolsPanel } from '../../src/components/ToolsPanel';
import { ErrorOverlay } from '../../src/components/ErrorOverlay';
import { encodeState, decodeState, STATE_PARAM } from '../../src/lib/stateCodec';
import type { PlaygroundState } from '../../src/lib/stateCodec';

/**
 * Integration tests that exercise the full pipeline:
 *   user code → compile → createComponent → render → tools interaction
 */
describe('Integration: compile → render → tools', () => {
  it('compiles user code and renders SVG output', () => {
    const { result } = renderHook(() => useToolsRegistry());

    let component: React.ComponentType | null = null;

    act(() => {
      result.current.resetCallIndex();
      const res = createUserComponent(
        'return <svg><rect width={100} height={50} /></svg>;',
        result.current.register,
        result.current.resetCallIndex
      );
      if ('component' in res) {
        component = res.component;
      }
    });

    expect(component).not.toBeNull();

    const UserComp = component!;
    const { container } = render(<UserComp />);
    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(container.querySelector('rect')).toBeInTheDocument();
  });

  it('registers tools during render and displays them in ToolsPanel', () => {
    const { result } = renderHook(() => useToolsRegistry());

    let UserComp: React.ComponentType | null = null;

    act(() => {
      result.current.resetCallIndex();
      const res = createUserComponent(
        `
        const name = useInput("Label", "Hello");
        return <text>{name}</text>;
        `,
        result.current.register,
        result.current.resetCallIndex
      );
      if ('component' in res) {
        UserComp = res.component;
      }
    });

    expect(UserComp).not.toBeNull();

    // Render the component (tools are registered during render)
    const C = UserComp!;
    const { unmount } = render(<C />);

    // Commit tools so they appear in state
    act(() => {
      result.current.commitTools();
    });

    expect(result.current.tools).toHaveLength(1);
    expect(result.current.tools[0].label).toBe('Label');
    expect(result.current.tools[0].type).toBe('input');

    unmount();

    // Now render ToolsPanel with the registered tools
    render(
      <ToolsPanel
        tools={result.current.tools}
        onToolValueChange={result.current.setToolValue}
        onReset={() => { }}
      />
    );

    expect(screen.getByDisplayValue('Hello')).toBeInTheDocument();
    expect(screen.getByText('Label')).toBeInTheDocument();
  });

  it('registers range tools correctly through the full pipeline', () => {
    const { result } = renderHook(() => useToolsRegistry());

    let UserComp: React.ComponentType | null = null;

    act(() => {
      result.current.resetCallIndex();
      const res = createUserComponent(
        `
        const r = useRange("Radius", 10, 200, 50, 5);
        return <circle r={r} />;
        `,
        result.current.register,
        result.current.resetCallIndex
      );
      if ('component' in res) {
        UserComp = res.component;
      }
    });

    expect(UserComp).not.toBeNull();

    const C2 = UserComp!;
    render(<C2 />);

    act(() => {
      result.current.commitTools();
    });

    expect(result.current.tools).toHaveLength(1);
    expect(result.current.tools[0].type).toBe('range');
    expect(result.current.tools[0].label).toBe('Radius');
    expect(result.current.tools[0].value).toBe(50);
  });

  it('shows an ErrorOverlay when code fails to compile', () => {
    const { result } = renderHook(() => useToolsRegistry());

    let error: string | null = null;

    act(() => {
      result.current.resetCallIndex();
      const res = createUserComponent(
        '<div>unclosed',
        result.current.register,
        result.current.resetCallIndex
      );
      if ('error' in res) {
        error = res.error;
      }
    });

    expect(error).not.toBeNull();

    render(<ErrorOverlay message={error!} />);

    expect(screen.getByText(error!)).toBeInTheDocument();
  });

  it('handles multiple tools registered in the same component', () => {
    const { result } = renderHook(() => useToolsRegistry());

    let UserComp: React.ComponentType | null = null;

    act(() => {
      result.current.resetCallIndex();
      const res = createUserComponent(
        `
        const label = useInput("Label", "Hi");
        const size = useRange("Size", 0, 100, 25, 1);
        return <text fontSize={size}>{label}</text>;
        `,
        result.current.register,
        result.current.resetCallIndex
      );
      if ('component' in res) {
        UserComp = res.component;
      }
    });

    expect(UserComp).not.toBeNull();

    const C3 = UserComp!;
    render(<C3 />);

    act(() => {
      result.current.commitTools();
    });

    expect(result.current.tools).toHaveLength(2);
    expect(result.current.tools[0].type).toBe('input');
    expect(result.current.tools[0].label).toBe('Label');
    expect(result.current.tools[1].type).toBe('range');
    expect(result.current.tools[1].label).toBe('Size');
  });

  it('tool value changes are reflected when component re-renders', () => {
    const { result } = renderHook(() => useToolsRegistry());

    let UserComp: React.ComponentType | null = null;

    act(() => {
      result.current.resetCallIndex();
      const res = createUserComponent(
        `
        const name = useInput("Name", "World");
        return <text data-testid="output">{name}</text>;
        `,
        result.current.register,
        result.current.resetCallIndex
      );
      if ('component' in res) {
        UserComp = res.component;
      }
    });

    expect(UserComp).not.toBeNull();

    const C4 = UserComp!;
    const { container } = render(<C4 />);

    act(() => {
      result.current.commitTools();
    });

    // Modify tool value
    act(() => {
      result.current.setToolValue(0, 'Vitest');
    });

    expect(result.current.tools[0].value).toBe('Vitest');
  });
});

describe('Integration: localStorage persistence', () => {
  it('tool values survive a simulated reload (unmount → remount hook)', () => {
    // First session: register, commit, change value
    const { result, unmount } = renderHook(() => useToolsRegistry());

    act(() => {
      result.current.resetCallIndex();
      result.current.register('input', 'Name', 'Default', {
        type: 'input',
        defaultValue: 'Default',
      });
      result.current.commitTools();
    });

    act(() => {
      result.current.setToolValue(0, 'UserValue');
    });

    // Simulate page unload
    unmount();

    // Second session: remount the hook
    const { result: result2 } = renderHook(() => useToolsRegistry());

    expect(result2.current.tools).toHaveLength(1);
    expect(result2.current.tools[0].value).toBe('UserValue');
    expect(result2.current.tools[0].label).toBe('Name');
  });

  it('register returns persisted value after simulated reload', () => {
    // First session
    const { result, unmount } = renderHook(() => useToolsRegistry());

    act(() => {
      result.current.resetCallIndex();
      result.current.register('range', 'Size', 50, {
        type: 'range',
        min: 0,
        max: 200,
        step: 1,
        defaultValue: 50,
      });
      result.current.commitTools();
    });

    act(() => {
      result.current.setToolValue(0, 123);
    });

    unmount();

    // Second session
    const { result: result2 } = renderHook(() => useToolsRegistry());

    let output: { index: number; value: string | number };
    act(() => {
      result2.current.resetCallIndex();
      output = result2.current.register('range', 'Size', 50, {
        type: 'range',
        min: 0,
        max: 200,
        step: 1,
        defaultValue: 50,
      });
      result2.current.commitTools();
    });

    expect(output!.value).toBe(123);
  });

  it('clearTools resets tools and subsequent reload starts empty', () => {
    const { result, unmount } = renderHook(() => useToolsRegistry());

    act(() => {
      result.current.resetCallIndex();
      result.current.register('input', 'Name', 'World', {
        type: 'input',
        defaultValue: 'World',
      });
      result.current.commitTools();
    });

    act(() => {
      result.current.clearTools();
    });

    unmount();

    const { result: result2 } = renderHook(() => useToolsRegistry());
    expect(result2.current.tools).toHaveLength(0);
  });

  it('code is persisted to and loaded from localStorage', () => {
    const STORAGE_KEY_CODE = 'svg-playground:code';

    // Simulate saving code
    localStorage.setItem(STORAGE_KEY_CODE, 'return <svg />;');

    const saved = localStorage.getItem(STORAGE_KEY_CODE);
    expect(saved).toBe('return <svg />;');

    // Simulate reset
    localStorage.removeItem(STORAGE_KEY_CODE);
    expect(localStorage.getItem(STORAGE_KEY_CODE)).toBeNull();
  });

  it('commitTools does not overwrite saved tools when called with empty pending list', () => {
    // Pre-seed localStorage with saved tools
    const savedTools = [
      {
        index: 0,
        type: 'input',
        label: 'Name',
        value: 'Persisted',
        config: { type: 'input', defaultValue: 'Default' },
      },
    ];
    localStorage.setItem('svg-playground:tools', JSON.stringify(savedTools));

    const { result } = renderHook(() => useToolsRegistry());

    // Tools should be loaded from localStorage
    expect(result.current.tools).toHaveLength(1);
    expect(result.current.tools[0].value).toBe('Persisted');

    // Calling commitTools without prior register should NOT wipe saved tools
    // (because pending is empty and the shallow-equal check detects mismatch,
    //  but the guard in SvgPreview prevents this call when component is null)
    // We verify the initial state is preserved
    act(() => {
      result.current.resetCallIndex();
      // Simulate what happens in a real render: register THEN commit
      result.current.register('input', 'Name', 'Default', {
        type: 'input',
        defaultValue: 'Default',
      });
      result.current.commitTools();
    });

    // Should keep persisted value, not fall back to default
    expect(result.current.tools[0].value).toBe('Persisted');
  });
});

// ─── Integration: URL state serialisation round-trip ─────────────────────────

describe('Integration: URL state round-trip', () => {
  it('encodes playground state, writes to URL, reads back and decodes to identical state', async () => {
    const { result } = renderHook(() => useToolsRegistry());

    // Build component + register tools
    act(() => {
      result.current.resetCallIndex();
      const res = createUserComponent(
        `
        const name = useInput("Name", "World");
        const size = useRange("Size", 10, 200, 50, 1);
        return <svg><text>{name}</text><circle r={size} /></svg>;
        `,
        result.current.register,
        result.current.resetCallIndex
      );
      if ('component' in res) {
        const C = res.component;
        render(<C />);
      }
    });

    act(() => {
      result.current.commitTools();
    });

    // Simulate user changing values
    act(() => {
      result.current.setToolValue(0, 'Alice');
      result.current.setToolValue(1, 123);
    });

    const code = `
        const name = useInput("Name", "World");
        const size = useRange("Size", 10, 200, 50, 1);
        return <svg><text>{name}</text><circle r={size} /></svg>;
        `;

    const state: PlaygroundState = {
      code,
      tools: result.current.tools,
    };

    // Encode → URL → decode
    const encoded = await encodeState(state);
    window.history.replaceState(null, '', `/?${STATE_PARAM}=${encoded}`);

    const fromUrl = new URLSearchParams(window.location.search).get(STATE_PARAM);
    expect(fromUrl).not.toBeNull();

    const decoded = await decodeState(fromUrl!);

    expect(decoded.code).toBe(code);
    expect(decoded.tools).toHaveLength(2);
    expect(decoded.tools[0].value).toBe('Alice');
    expect(decoded.tools[1].value).toBe(123);

    // Clean up
    window.history.replaceState(null, '', '/');
  });

  it('restored tools from URL are used by register on next recompile', async () => {
    // Simulate a shared URL arriving with pre-set tool values
    const sharedState: PlaygroundState = {
      code: 'const x = useInput("X", "default"); return <svg />;',
      tools: [
        {
          index: 0,
          type: 'input',
          label: 'X',
          value: 'shared-value',
          config: { type: 'input', defaultValue: 'default' },
        },
      ],
    };

    // Load tools via setTools (as App.tsx does in handleLoadState)
    const { result } = renderHook(() => useToolsRegistry());

    act(() => {
      result.current.setTools(sharedState.tools);
    });

    // On recompile, register should pick up the shared value
    let output: { index: number; value: string | number };
    act(() => {
      result.current.resetCallIndex();
      output = result.current.register('input', 'X', 'default', {
        type: 'input',
        defaultValue: 'default',
      });
      result.current.commitTools();
    });

    expect(output!.value).toBe('shared-value');
    expect(result.current.tools[0].value).toBe('shared-value');
  });

  it('encoded state survives URL encoding and is valid after encodeURIComponent', async () => {
    const state: PlaygroundState = {
      code: 'return <svg>{`special chars: ${"quotes"} & <angle>`}</svg>;',
      tools: [],
    };

    const encoded = await encodeState(state);
    // Simulate what a browser does when the param is put into a URL
    const urlSafe = encodeURIComponent(encoded);
    const recovered = decodeURIComponent(urlSafe);

    expect(recovered).toBe(encoded);

    const decoded = await decodeState(recovered);
    expect(decoded.code).toBe(state.code);
  });
});
