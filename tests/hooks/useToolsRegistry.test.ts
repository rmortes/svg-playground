import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useToolsRegistry } from '../../src/hooks/useToolsRegistry';

describe('useToolsRegistry', () => {
  // --- register ---

  it('registers a tool and returns its index and default value', () => {
    const { result } = renderHook(() => useToolsRegistry());

    let output: { index: number; value: string | number };
    act(() => {
      result.current.resetCallIndex();
      output = result.current.register('input', 'Name', 'World', {
        type: 'input',
        defaultValue: 'World',
      });
    });

    expect(output!.index).toBe(0);
    expect(output!.value).toBe('World');
  });

  it('returns incrementing indices for successive register calls', () => {
    const { result } = renderHook(() => useToolsRegistry());

    const outputs: Array<{ index: number; value: string | number }> = [];
    act(() => {
      result.current.resetCallIndex();
      outputs.push(
        result.current.register('input', 'A', 'a', { type: 'input', defaultValue: 'a' })
      );
      outputs.push(
        result.current.register('input', 'B', 'b', { type: 'input', defaultValue: 'b' })
      );
      outputs.push(
        result.current.register('range', 'C', 0, { type: 'range', min: 0, max: 100, step: 1, defaultValue: 0 })
      );
    });

    expect(outputs[0].index).toBe(0);
    expect(outputs[1].index).toBe(1);
    expect(outputs[2].index).toBe(2);
  });

  // --- resetCallIndex ---

  it('resets the call index counter so subsequent registrations start at 0', () => {
    const { result } = renderHook(() => useToolsRegistry());

    act(() => {
      result.current.resetCallIndex();
      result.current.register('input', 'First', 'a', { type: 'input', defaultValue: 'a' });
    });

    let output: { index: number; value: string | number };
    act(() => {
      result.current.resetCallIndex();
      output = result.current.register('input', 'Again', 'b', {
        type: 'input',
        defaultValue: 'b',
      });
    });

    expect(output!.index).toBe(0);
  });

  // --- commitTools ---

  it('commits pending tools to state', () => {
    const { result } = renderHook(() => useToolsRegistry());

    act(() => {
      result.current.resetCallIndex();
      result.current.register('input', 'Name', 'World', {
        type: 'input',
        defaultValue: 'World',
      });
      result.current.commitTools();
    });

    expect(result.current.tools).toHaveLength(1);
    expect(result.current.tools[0].label).toBe('Name');
    expect(result.current.tools[0].value).toBe('World');
    expect(result.current.tools[0].type).toBe('input');
  });

  it('replaces the entire tools array on commit', () => {
    const { result } = renderHook(() => useToolsRegistry());

    // First commit: 2 tools
    act(() => {
      result.current.resetCallIndex();
      result.current.register('input', 'A', 'a', { type: 'input', defaultValue: 'a' });
      result.current.register('input', 'B', 'b', { type: 'input', defaultValue: 'b' });
      result.current.commitTools();
    });
    expect(result.current.tools).toHaveLength(2);

    // Second commit: 1 tool
    act(() => {
      result.current.resetCallIndex();
      result.current.register('input', 'C', 'c', { type: 'input', defaultValue: 'c' });
      result.current.commitTools();
    });
    expect(result.current.tools).toHaveLength(1);
    expect(result.current.tools[0].label).toBe('C');
  });

  // --- setToolValue ---

  it('updates the value of a tool by index', () => {
    const { result } = renderHook(() => useToolsRegistry());

    act(() => {
      result.current.resetCallIndex();
      result.current.register('input', 'Name', 'World', {
        type: 'input',
        defaultValue: 'World',
      });
      result.current.commitTools();
    });

    act(() => {
      result.current.setToolValue(0, 'Vitest');
    });

    expect(result.current.tools[0].value).toBe('Vitest');
  });

  it('does not modify tools when setToolValue targets a non-existent index', () => {
    const { result } = renderHook(() => useToolsRegistry());

    act(() => {
      result.current.resetCallIndex();
      result.current.register('input', 'Name', 'World', {
        type: 'input',
        defaultValue: 'World',
      });
      result.current.commitTools();
    });

    act(() => {
      result.current.setToolValue(999, 'nope');
    });

    expect(result.current.tools).toHaveLength(1);
    expect(result.current.tools[0].value).toBe('World');
  });

  // --- Preserving values across re-registrations ---

  it('preserves existing value when re-registering a tool of the same type', () => {
    const { result } = renderHook(() => useToolsRegistry());

    // First registration cycle
    act(() => {
      result.current.resetCallIndex();
      result.current.register('input', 'Name', 'Default', {
        type: 'input',
        defaultValue: 'Default',
      });
      result.current.commitTools();
    });

    // User changes the value
    act(() => {
      result.current.setToolValue(0, 'Changed');
    });
    expect(result.current.tools[0].value).toBe('Changed');

    // Re-registration cycle (simulating re-render)
    let output: { index: number; value: string | number };
    act(() => {
      result.current.resetCallIndex();
      output = result.current.register('input', 'Name', 'Default', {
        type: 'input',
        defaultValue: 'Default',
      });
      result.current.commitTools();
    });

    // The register call returns the persisted value, not the default
    expect(output!.value).toBe('Changed');
    expect(result.current.tools[0].value).toBe('Changed');
  });

  it('resets to default when the tool type changes', () => {
    const { result } = renderHook(() => useToolsRegistry());

    // Register as input
    act(() => {
      result.current.resetCallIndex();
      result.current.register('input', 'Tool', 'text', {
        type: 'input',
        defaultValue: 'text',
      });
      result.current.commitTools();
    });

    // Change value
    act(() => {
      result.current.setToolValue(0, 'modified');
    });

    // Re-register as range (different type)
    let output: { index: number; value: string | number };
    act(() => {
      result.current.resetCallIndex();
      output = result.current.register('range', 'Tool', 50, {
        type: 'range',
        min: 0,
        max: 100,
        step: 1,
        defaultValue: 50,
      });
      result.current.commitTools();
    });

    // Should get default because the type changed
    expect(output!.value).toBe(50);
    expect(result.current.tools[0].type).toBe('range');
  });

  // --- setTools (bulk replace) ---

  it('replaces the entire tools array via setTools', () => {
    const { result } = renderHook(() => useToolsRegistry());

    const newTools = [
      {
        index: 0,
        type: 'input' as const,
        label: 'Imported',
        value: 'FromURL',
        config: { type: 'input' as const, defaultValue: 'Default' },
      },
      {
        index: 1,
        type: 'range' as const,
        label: 'Slider',
        value: 75,
        config: { type: 'range' as const, min: 0, max: 100, step: 1, defaultValue: 50 },
      },
    ];

    act(() => {
      result.current.setTools(newTools);
    });

    expect(result.current.tools).toHaveLength(2);
    expect(result.current.tools[0].label).toBe('Imported');
    expect(result.current.tools[0].value).toBe('FromURL');
    expect(result.current.tools[1].label).toBe('Slider');
    expect(result.current.tools[1].value).toBe(75);
  });

  it('setTools values are preserved by subsequent register calls of same type', () => {
    const { result } = renderHook(() => useToolsRegistry());

    // Simulate loading state from URL
    act(() => {
      result.current.setTools([
        {
          index: 0,
          type: 'input',
          label: 'Name',
          value: 'URLValue',
          config: { type: 'input', defaultValue: 'World' },
        },
      ]);
    });

    // Simulate recompile: register should pick up the value set via setTools
    let output: { index: number; value: string | number };
    act(() => {
      result.current.resetCallIndex();
      output = result.current.register('input', 'Name', 'World', {
        type: 'input',
        defaultValue: 'World',
      });
      result.current.commitTools();
    });

    expect(output!.value).toBe('URLValue');
    expect(result.current.tools[0].value).toBe('URLValue');
  });

  it('setTools with empty array clears all tools', () => {
    const { result } = renderHook(() => useToolsRegistry());

    act(() => {
      result.current.resetCallIndex();
      result.current.register('input', 'Name', 'val', {
        type: 'input',
        defaultValue: 'val',
      });
      result.current.commitTools();
    });
    expect(result.current.tools).toHaveLength(1);

    act(() => {
      result.current.setTools([]);
    });

    expect(result.current.tools).toHaveLength(0);
  });

  // --- clearTools ---

  it('clears all tools and removes from localStorage', () => {
    const { result } = renderHook(() => useToolsRegistry());

    act(() => {
      result.current.resetCallIndex();
      result.current.register('input', 'Name', 'val', {
        type: 'input',
        defaultValue: 'val',
      });
      result.current.commitTools();
    });
    expect(result.current.tools).toHaveLength(1);

    act(() => {
      result.current.clearTools();
    });

    expect(result.current.tools).toHaveLength(0);
    expect(localStorage.getItem('svg-playground:tools')).toBeNull();
  });

  // --- localStorage persistence ---

  it('persists committed tools to localStorage', () => {
    const { result } = renderHook(() => useToolsRegistry());

    act(() => {
      result.current.resetCallIndex();
      result.current.register('input', 'Name', 'World', {
        type: 'input',
        defaultValue: 'World',
      });
      result.current.commitTools();
    });

    const stored = JSON.parse(localStorage.getItem('svg-playground:tools')!);
    expect(stored).toHaveLength(1);
    expect(stored[0].label).toBe('Name');
    expect(stored[0].value).toBe('World');
  });

  it('persists updated tool values to localStorage after setToolValue', () => {
    const { result } = renderHook(() => useToolsRegistry());

    act(() => {
      result.current.resetCallIndex();
      result.current.register('input', 'Name', 'World', {
        type: 'input',
        defaultValue: 'World',
      });
      result.current.commitTools();
    });

    act(() => {
      result.current.setToolValue(0, 'Changed');
    });

    const stored = JSON.parse(localStorage.getItem('svg-playground:tools')!);
    expect(stored[0].value).toBe('Changed');
  });

  it('loads saved tools from localStorage on initialization', () => {
    const savedTools = [
      {
        index: 0,
        type: 'input',
        label: 'Greeting',
        value: 'Saved Value',
        config: { type: 'input', defaultValue: 'Hello' },
      },
    ];
    localStorage.setItem('svg-playground:tools', JSON.stringify(savedTools));

    const { result } = renderHook(() => useToolsRegistry());

    expect(result.current.tools).toHaveLength(1);
    expect(result.current.tools[0].label).toBe('Greeting');
    expect(result.current.tools[0].value).toBe('Saved Value');
  });

  it('returns saved value from register when tools were loaded from localStorage', () => {
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

    let output: { index: number; value: string | number };
    act(() => {
      result.current.resetCallIndex();
      output = result.current.register('input', 'Name', 'Default', {
        type: 'input',
        defaultValue: 'Default',
      });
      result.current.commitTools();
    });

    // register() should return the persisted value, not the default
    expect(output!.value).toBe('Persisted');
    expect(result.current.tools[0].value).toBe('Persisted');
  });

  it('falls back to empty array when localStorage contains invalid JSON', () => {
    localStorage.setItem('svg-playground:tools', '{broken json!!!');

    const { result } = renderHook(() => useToolsRegistry());

    expect(result.current.tools).toHaveLength(0);
  });

  it('does not write to localStorage when tools array is empty', () => {
    const { result } = renderHook(() => useToolsRegistry());

    // Trigger a render without committing any tools
    act(() => {
      result.current.resetCallIndex();
    });

    expect(localStorage.getItem('svg-playground:tools')).toBeNull();
  });

  // --- commitTools avoids unnecessary updates ---

  it('does not trigger re-render when committing identical tools', () => {
    const { result } = renderHook(() => useToolsRegistry());

    act(() => {
      result.current.resetCallIndex();
      result.current.register('input', 'A', 'x', { type: 'input', defaultValue: 'x' });
      result.current.commitTools();
    });

    const toolsBefore = result.current.tools;

    act(() => {
      result.current.resetCallIndex();
      result.current.register('input', 'A', 'x', { type: 'input', defaultValue: 'x' });
      result.current.commitTools();
    });

    // The reference should be the same (setState returned prev)
    expect(result.current.tools).toBe(toolsBefore);
  });
});
