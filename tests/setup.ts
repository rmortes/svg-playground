import '@testing-library/jest-dom/vitest';

// ── Web Streams Compression API polyfill ─────────────────────────────────────
// jsdom does not ship CompressionStream / DecompressionStream.  They are
// available in Node 18+ via `node:stream/web`, so we shim them onto globalThis
// for tests that exercise stateCodec.ts.
if (typeof globalThis.CompressionStream === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const streamWeb = require('node:stream/web') as {
    CompressionStream: typeof CompressionStream;
    DecompressionStream: typeof DecompressionStream;
  };
  Object.assign(globalThis, {
    CompressionStream: streamWeb.CompressionStream,
    DecompressionStream: streamWeb.DecompressionStream,
  });
}

// Stub localStorage for jsdom
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
  };
})();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

// Reset localStorage between tests
afterEach(() => {
  localStorage.clear();
});
