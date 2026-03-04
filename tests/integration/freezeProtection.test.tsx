import { describe, it, expect } from 'vitest';
import { createUserComponent } from '../../src/engine/createComponent';
import type { RegisterFn } from '../../src/types';

/**
 * These tests verify that the system protects users from browser freezes
 * when they (accidentally or otherwise) write code containing infinite loops
 * or infinite recursion.
 *
 * The user's experience: writing bad code in the editor causes the browser
 * tab to become completely unresponsive — requiring a forced stop of JS
 * execution via DevTools, manually clearing localStorage, and starting over.
 *
 * Expected behavior: the system should detect or limit dangerous execution
 * patterns and surface an error instead of freezing.
 */

function makeRegister(): RegisterFn {
  let callIndex = 0;
  return (_type, _label, defaultValue, _config) => {
    return { index: callIndex++, value: defaultValue };
  };
}

const noopReset = () => { };

// ---------------------------------------------------------------------------
// Infinite loops
// ---------------------------------------------------------------------------
// These tests assert that obvious infinite loops are caught BEFORE they can
// execute and freeze the browser.  Since a real `while(true)` would freeze
// the test runner too, we can only safely test at the creation/compilation
// level.  The implementation may use static analysis, AST transforms
// (loop-counter injection), or another strategy — the tests are agnostic to
// approach; they only care that the result is `{ error }` instead of a
// component that will hang.
// ---------------------------------------------------------------------------

describe('Freeze protection: infinite loops', () => {
  it('should return an error for code containing while(true)', () => {
    const result = createUserComponent(
      'while(true) {}\nreturn <svg />;',
      makeRegister(),
      noopReset,
    );

    expect('error' in result).toBe(true);
  });

  it('should return an error for code containing for(;;)', () => {
    const result = createUserComponent(
      'for(;;) {}\nreturn <svg />;',
      makeRegister(),
      noopReset,
    );

    expect('error' in result).toBe(true);
  });

  it('should return an error for code containing while(1)', () => {
    const result = createUserComponent(
      'while(1) { console.log("spin"); }\nreturn <svg />;',
      makeRegister(),
      noopReset,
    );

    expect('error' in result).toBe(true);
  });

  it('should return an error for a for loop with no termination condition', () => {
    const result = createUserComponent(
      'for(let i = 0; ; i++) {}\nreturn <svg />;',
      makeRegister(),
      noopReset,
    );

    expect('error' in result).toBe(true);
  });

  it('should return an error for code with a do-while(true) loop', () => {
    const result = createUserComponent(
      'do {} while(true);\nreturn <svg />;',
      makeRegister(),
      noopReset,
    );

    expect('error' in result).toBe(true);
  });

  it('should allow finite loops that terminate normally', () => {
    const result = createUserComponent(
      'let sum = 0;\nfor (let i = 0; i < 10; i++) { sum += i; }\nreturn <svg><text>{sum}</text></svg>;',
      makeRegister(),
      noopReset,
    );

    expect('component' in result).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Infinite recursion
// ---------------------------------------------------------------------------
// Unlike infinite loops (which block forever), infinite recursion blows the
// call stack and throws a RangeError.  These tests verify the system handles
// this gracefully by producing an error rather than crashing.
//
// We call the component function directly (not through React.render) to
// avoid stack overflow escaping React's error handling in the test env.
// The key semantic: the error is *throwable* and *catchable*, not a freeze.
// ---------------------------------------------------------------------------

describe('Freeze protection: infinite recursion', () => {
  it('should produce an error for a function that calls itself indefinitely', () => {
    const result = createUserComponent(
      'function f(n) { return f(n + 1); }\nconst x = f(0);\nreturn <svg><text>{x}</text></svg>;',
      makeRegister(),
      noopReset,
    );

    // Best case: caught at creation time
    if ('error' in result) {
      expect(typeof result.error).toBe('string');
      return;
    }

    // Otherwise the component was created. Calling it must throw (stack
    // overflow), NOT hang forever like an infinite loop would.
    const Comp = result.component as unknown as () => unknown;
    expect(() => Comp()).toThrow();
  });

  it('should produce an error for mutually recursive functions', () => {
    const code = [
      'function a() { return b(); }',
      'function b() { return a(); }',
      'a();',
      'return <svg />;',
    ].join('\n');

    const result = createUserComponent(code, makeRegister(), noopReset);

    if ('error' in result) {
      expect(typeof result.error).toBe('string');
      return;
    }

    const Comp = result.component as unknown as () => unknown;
    expect(() => Comp()).toThrow();
  });
});
