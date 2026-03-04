import { useState, useRef, useCallback, useEffect } from 'react';
import type { ToolDef, RegisterFn } from '../types';

const STORAGE_KEY_TOOLS = 'svg-playground:tools';

function loadSavedTools(): ToolDef[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TOOLS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export interface ToolsRegistry {
  tools: ToolDef[];
  register: RegisterFn;
  setToolValue: (index: number, value: string | number) => void;
  /** Replaces the entire tools snapshot (used when loading state from URL). */
  setTools: (tools: ToolDef[]) => void;
  resetCallIndex: () => void;
  commitTools: () => void;
  clearTools: () => void;
}

export function useToolsRegistry(): ToolsRegistry {
  const [tools, setTools] = useState<ToolDef[]>(loadSavedTools);
  const callIndexRef = useRef(0);
  const pendingToolsRef = useRef<ToolDef[]>([]);
  // Keep a stable ref to current tools so register() can read values without deps
  const toolsRef = useRef<ToolDef[]>([]);
  toolsRef.current = tools;

  const resetCallIndex = useCallback(() => {
    callIndexRef.current = 0;
    pendingToolsRef.current = [];
  }, []);

  const register: RegisterFn = useCallback((type, label, defaultValue, config) => {
    const index = callIndexRef.current++;
    const currentTools = toolsRef.current;
    const existing = currentTools[index];

    // Keep the existing value if the tool type hasn't changed (user may have modified it)
    const value =
      existing && existing.type === type ? existing.value : defaultValue;

    const entry: ToolDef = {
      index,
      type,
      label,
      value,
      config: config as unknown as ToolDef['config'],
    };

    pendingToolsRef.current[index] = entry;

    return { index, value };
  }, []);

  const commitTools = useCallback(() => {
    const pending = [...pendingToolsRef.current];
    setTools((prev) => {
      // Avoid unnecessary re-renders if tools haven't changed
      if (
        prev.length === pending.length &&
        prev.every((t, i) => {
          const p = pending[i];
          return (
            t.index === p.index &&
            t.type === p.type &&
            t.label === p.label &&
            t.value === p.value
          );
        })
      ) {
        return prev;
      }
      return pending;
    });
  }, []);

  const setToolValue = useCallback((index: number, value: string | number) => {
    setTools((prev) => {
      if (!prev[index]) return prev;
      const next = [...prev];
      next[index] = { ...next[index], value };
      return next;
    });
  }, []);

  const clearTools = useCallback(() => {
    setTools([]);
    toolsRef.current = [];
    try { localStorage.removeItem(STORAGE_KEY_TOOLS); } catch { /* ignore */ }
  }, []);

  const replaceTools = useCallback((newTools: ToolDef[]) => {
    setTools(newTools);
  }, []);

  // Persist tool values to localStorage
  useEffect(() => {
    if (tools.length === 0) return;
    try {
      localStorage.setItem(STORAGE_KEY_TOOLS, JSON.stringify(tools));
    } catch { /* ignore */ }
  }, [tools]);

  return { tools, register, setToolValue, setTools: replaceTools, resetCallIndex, commitTools, clearTools };
}
