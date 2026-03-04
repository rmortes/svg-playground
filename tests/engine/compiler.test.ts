import { describe, it, expect } from 'vitest';
import { compileJSX } from '../../src/engine/compiler';

describe('compileJSX', () => {
  // --- Happy paths ---

  it('transforms valid JSX into React.createElement calls', () => {
    const result = compileJSX('<div>hello</div>');

    expect('code' in result).toBe(true);
    if ('code' in result) {
      expect(result.code).toContain('React.createElement');
    }
  });

  it('compiles a self-closing JSX element', () => {
    const result = compileJSX('<br />');

    expect('code' in result).toBe(true);
    if ('code' in result) {
      expect(result.code).toContain('React.createElement');
    }
  });

  it('compiles JSX with props', () => {
    const result = compileJSX('<rect width={100} height={50} fill="red" />');

    expect('code' in result).toBe(true);
    if ('code' in result) {
      expect(result.code).toContain('width');
      expect(result.code).toContain('height');
      expect(result.code).toContain('fill');
    }
  });

  it('compiles nested JSX elements', () => {
    const result = compileJSX('<svg><circle cx={10} cy={10} r={5} /></svg>');

    expect('code' in result).toBe(true);
    if ('code' in result) {
      expect(result.code).toContain('React.createElement');
    }
  });

  it('handles arrow functions with JSX', () => {
    const code = 'const el = () => <div>arrow</div>;';
    const result = compileJSX(code);

    expect('code' in result).toBe(true);
    if ('code' in result) {
      expect(result.code).toContain('React.createElement');
    }
  });

  it('handles template literals alongside JSX', () => {
    const code = 'const msg = `hello ${name}`;\nreturn <div>{msg}</div>;';
    const result = compileJSX(code);

    expect('code' in result).toBe(true);
    if ('code' in result) {
      expect(result.code).toContain('React.createElement');
      expect(result.code).toContain('`hello ${name}`');
    }
  });

  it('handles JSX fragments', () => {
    const result = compileJSX('<><div /><span /></>');

    expect('code' in result).toBe(true);
    if ('code' in result) {
      expect(result.code).toContain('React.createElement');
    }
  });

  // --- Error cases ---

  it('returns an error for unclosed tags', () => {
    const result = compileJSX('<div>unclosed');

    expect('error' in result).toBe(true);
  });

  it('returns an error for completely invalid syntax', () => {
    const result = compileJSX('const x = {{{');

    expect('error' in result).toBe(true);
  });

  it('returns an error object with a descriptive message', () => {
    const result = compileJSX('<div>unclosed');

    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(typeof result.error).toBe('string');
      expect(result.error.length).toBeGreaterThan(0);
    }
  });

  // --- Edge cases ---

  it('compiles an empty string without error', () => {
    const result = compileJSX('');

    expect('code' in result).toBe(true);
    if ('code' in result) {
      expect(result.code).toBe('');
    }
  });

  it('compiles plain JavaScript without JSX', () => {
    const result = compileJSX('const x = 42;');

    expect('code' in result).toBe(true);
    if ('code' in result) {
      expect(result.code).toContain('const x = 42');
    }
  });
});
