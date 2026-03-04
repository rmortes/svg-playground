import type React from 'react';

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

export interface ToolDef {
  index: number;
  type: 'input' | 'range';
  label: string;
  value: string | number;
  config: InputConfig | RangeConfig;
}

export interface ToolsRegistryState {
  tools: ToolDef[];
  setToolValue: (index: number, value: string | number) => void;
}

export type CompilationResult =
  | { success: true; component: React.ComponentType }
  | { success: false; error: string };

export type RegisterFn = (
  type: 'input' | 'range',
  label: string,
  defaultValue: string | number,
  config: Record<string, unknown>
) => { index: number; value: string | number };
