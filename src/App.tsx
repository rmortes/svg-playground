import { useState, useEffect, useRef, useCallback } from 'react';
import { CodeEditor } from './components/CodeEditor';
import { SvgPreview } from './components/SvgPreview';
import { ToolsPanel } from './components/ToolsPanel';
import { createUserComponent } from './engine/createComponent';
import { useToolsRegistry } from './hooks/useToolsRegistry';
import { useUrlSync } from './hooks/useUrlSync';
import type { ComponentType } from 'react';
import type { PlaygroundState } from './lib/stateCodec';
import './App.css';

const STORAGE_KEY_CODE = 'svg-playground:code';

function loadSavedCode(): string {
  try {
    return localStorage.getItem(STORAGE_KEY_CODE) ?? '';
  } catch {
    return '';
  }
}

const DEFAULT_CODE = `const name = useInput("Name", "World");
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

export function App() {
  const [code, setCode] = useState(() => loadSavedCode() || DEFAULT_CODE);
  const [debouncedCode, setDebouncedCode] = useState(code);
  const [compiledComponent, setCompiledComponent] = useState<ComponentType | null>(null);
  const [compileError, setCompileError] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);

  const { tools, register, setToolValue, setTools, resetCallIndex, commitTools, clearTools } =
    useToolsRegistry();

  // Keep stable refs to register and resetCallIndex (they're already stable from useCallback)
  const registerRef = useRef(register);
  const resetCallIndexRef = useRef(resetCallIndex);
  useEffect(() => {
    registerRef.current = register;
    resetCallIndexRef.current = resetCallIndex;
  });

  // Persist code to localStorage
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY_CODE, code); } catch { /* ignore */ }
  }, [code]);

  // Debounce code changes
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedCode(code), 500);
    return () => clearTimeout(timer);
  }, [code]);

  // Recompile when debounced code changes
  useEffect(() => {
    const result = createUserComponent(
      debouncedCode,
      registerRef.current,
      resetCallIndexRef.current
    );
    if ('error' in result) {
      setCompileError(result.error);
      setCompiledComponent(null);
    } else {
      setCompiledComponent(() => result.component);
      setCompileError(null);
      setResetKey((k) => k + 1);
    }
  }, [debouncedCode]);

  const handleAfterRender = useCallback(() => {
    commitTools();
  }, [commitTools]);

  // Apply state loaded from a shared URL (fires once on mount if ?s= is present)
  const handleLoadState = useCallback((state: PlaygroundState) => {
    setCode(state.code);
    setTools(state.tools);
  }, [setTools]);

  useUrlSync({ code, tools, onLoadState: handleLoadState });

  const handleReset = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY_CODE);
    } catch { /* ignore */ }
    clearTools();
    setCode(DEFAULT_CODE);
  }, [clearTools]);

  return (
    <div className="app">
      <CodeEditor value={code} onChange={setCode} compilationError={compileError} />
      <SvgPreview
        component={compiledComponent}
        error={compileError}
        resetKey={resetKey}
        onAfterRender={handleAfterRender}
      />
      <ToolsPanel tools={tools} onToolValueChange={setToolValue} onReset={handleReset} />
    </div>
  );
}

export default App;
