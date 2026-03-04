import { useState, useEffect } from 'react';
import type { ToolDef, RangeConfig } from '../types';

interface RangeValueInputProps {
  value: number;
  onChange: (v: number) => void;
}

function RangeValueInput({ value, onChange }: RangeValueInputProps) {
  const [text, setText] = useState(String(value));

  useEffect(() => {
    setText(String(value));
  }, [value]);

  return (
    <input
      type="number"
      className="range-value-input"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value !== '' && !isNaN(n)) onChange(n);
      }}
      onBlur={() => {
        const n = Number(text);
        if (text === '' || isNaN(n)) setText(String(value));
      }}
    />
  );
}

interface ToolsPanelProps {
  tools: ToolDef[];
  onToolValueChange: (index: number, value: string | number) => void;
  onReset: () => void;
}

export function ToolsPanel({ tools, onToolValueChange, onReset }: ToolsPanelProps) {
  return (
    <div className="tools-panel">
      <div className="tools-panel-header">Tools</div>
      {tools.length === 0 ? (
        <p className="tools-empty">
          No tools registered. Use <code>useInput()</code> or <code>useRange()</code> in
          your code.
        </p>
      ) : (
        <div className="tools-list">
          {tools.map((tool) => (
            <div key={tool.index} className="tool-control">
              <label className="tool-label">{tool.label}</label>
              {tool.type === 'input' ? (
                <input
                  type="text"
                  className="tool-input"
                  value={(tool.value as string)}
                  onChange={(e) => onToolValueChange(tool.index, e.target.value)}
                />
              ) : (
                <div className="range-control">
                  <input
                    type="range"
                    className="tool-range"
                    min={(tool.config as RangeConfig).min}
                    max={(tool.config as RangeConfig).max}
                    step={(tool.config as RangeConfig).step}
                    value={(tool.value as number)}
                    onChange={(e) =>
                      onToolValueChange(tool.index, Number(e.target.value))
                    }
                  />
                  <RangeValueInput
                    value={tool.value as number}
                    onChange={(v) => onToolValueChange(tool.index, v)}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <button className="tools-reset-button" onClick={onReset}>
        Reset to Defaults
      </button>
    </div>
  );
}
