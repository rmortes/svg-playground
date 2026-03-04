import { transform } from 'sucrase';

export interface CompileSuccess {
  code: string;
}

export interface CompileError {
  error: string;
}

export type CompileResult = CompileSuccess | CompileError;

/**
 * Patterns that indicate an obviously-infinite loop in user code.
 * These are checked statically, before Sucrase runs, so we can return a
 * clear error instead of creating a component that freezes the browser.
 *
 * Covered cases:
 *   - while(true) / while(1) — includes do { } while(true|1)
 *   - for(;;) / for(init ; ; update) — for loop with an empty condition
 */
const INFINITE_LOOP_PATTERNS: ReadonlyArray<{ pattern: RegExp; message: string }> = [
  {
    pattern: /while\s*\(\s*(true|1)\s*\)/,
    message: 'Infinite loop detected: while(true) or while(1) is not allowed.',
  },
  {
    // Matches any `for` whose condition slot (second semicolon-separated part)
    // is empty: for(init ; ; update) or for( ; ; )
    pattern: /for\s*\([^;]*;\s*;/,
    message: 'Infinite loop detected: for loop with no termination condition is not allowed.',
  },
];

function detectInfiniteLoops(code: string): string | null {
  for (const { pattern, message } of INFINITE_LOOP_PATTERNS) {
    if (pattern.test(code)) return message;
  }
  return null;
}

export function compileJSX(code: string): CompileResult {
  const loopError = detectInfiniteLoops(code);
  if (loopError) return { error: loopError };

  try {
    const result = transform(code, {
      transforms: ['jsx'],
      jsxRuntime: 'classic', // uses React.createElement injected in scope
      production: true,
    });
    return { code: result.code };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Compilation error';
    return { error: message };
  }
}
