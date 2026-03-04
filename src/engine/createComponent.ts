import React from 'react';
import { compileJSX } from './compiler';
import type { RegisterFn } from '../types';

export interface CreateComponentSuccess {
  component: React.ComponentType;
}

export interface CreateComponentError {
  error: string;
}

export type CreateComponentResult = CreateComponentSuccess | CreateComponentError;

export function createUserComponent(
  rawCode: string,
  register: RegisterFn,
  resetCallIndex: () => void
): CreateComponentResult {
  // Step 1: Transform JSX → JS
  const compiled = compileJSX(rawCode);
  if ('error' in compiled) {
    return { error: compiled.error };
  }

  // Step 2: Derive hook functions from register
  function useInput(label: string, defaultValue = ''): string {
    const { value } = register('input', label, defaultValue, {
      type: 'input',
      defaultValue,
    });
    return value as string;
  }

  function useRange(
    label: string,
    min = 0,
    max = 100,
    defaultValue?: number,
    step = 1
  ): number {
    const resolvedDefault = defaultValue ?? min;
    const { value } = register('range', label, resolvedDefault, {
      type: 'range',
      min,
      max,
      step,
      defaultValue: resolvedDefault,
    });
    return value as number;
  }

  // Step 3: Wrap compiled code into a named React component
  // The user code IS the function body; it must contain a return statement
  const wrappedCode = `"use strict";\nreturn function UserSVGComponent() {\n__resetCallIndex__();\n${compiled.code}\n};`;

  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const factory = new Function(
      'React',
      'useInput',
      'useRange',
      '__resetCallIndex__',
      wrappedCode
    ) as (
      r: typeof React,
      ui: typeof useInput,
      ur: typeof useRange,
      reset: () => void
    ) => React.ComponentType;

    const component = factory(React, useInput, useRange, resetCallIndex);
    return { component };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Runtime error creating component';
    return { error: message };
  }
}
