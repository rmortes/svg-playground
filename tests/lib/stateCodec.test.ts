import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  encodeState,
  decodeState,
  getEncodedStateFromUrl,
  setEncodedStateInUrl,
  STATE_PARAM,
} from '../../src/lib/stateCodec';
import type { PlaygroundState } from '../../src/lib/stateCodec';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const MINIMAL_STATE: PlaygroundState = {
  code: 'return <svg />;',
  tools: [],
};

const RICH_STATE: PlaygroundState = {
  code: `const name = useInput("Name", "World");
const size = useRange("Size", 10, 200, 100);

return (
  <svg width="400" height="400">
    <circle cx="200" cy="200" r={size} />
    <text x="200" y="200">{name}</text>
  </svg>
);`,
  tools: [
    {
      index: 0,
      type: 'input',
      label: 'Name',
      value: 'Alice',
      config: { type: 'input', defaultValue: 'World' },
    },
    {
      index: 1,
      type: 'range',
      label: 'Size',
      value: 42,
      config: { type: 'range', min: 10, max: 200, step: 1, defaultValue: 100 },
    },
  ],
};

// ─── encode / decode ─────────────────────────────────────────────────────────

describe('encodeState / decodeState', () => {
  it('round-trips a minimal state', async () => {
    const encoded = await encodeState(MINIMAL_STATE);
    const decoded = await decodeState(encoded);
    expect(decoded).toEqual(MINIMAL_STATE);
  });

  it('round-trips a rich state with multiple tools', async () => {
    const encoded = await encodeState(RICH_STATE);
    const decoded = await decodeState(encoded);
    expect(decoded).toEqual(RICH_STATE);
  });

  it('produces a Base64url-safe string (no +, /, or = chars)', async () => {
    const encoded = await encodeState(RICH_STATE);
    expect(encoded).not.toMatch(/[+/=]/);
  });

  it('compresses: encoded length is smaller than the raw JSON', async () => {
    const encoded = await encodeState(RICH_STATE);
    const rawJson = JSON.stringify(RICH_STATE);
    // Base64url adds ~33% overhead to compressed bytes, but deflate on code
    // text should still beat the raw JSON length for a realistic payload.
    expect(encoded.length).toBeLessThan(rawJson.length);
  });

  it('throws on invalid base64url input', async () => {
    await expect(decodeState('not-valid-base64url!!!')).rejects.toThrow();
  });

  it('throws when decoded JSON is missing required fields', async () => {
    // Encode a valid payload but with wrong shape
    const partial = { code: 'return null;' }; // missing `tools`
    const bytes = new TextEncoder().encode(JSON.stringify(partial));
    const cs = new CompressionStream('deflate-raw');
    const writer = cs.writable.getWriter();
    const compressedPromise = new Response(cs.readable).arrayBuffer();
    await writer.write(bytes);
    await writer.close();
    const compressed = await compressedPromise;
    // Manually base64url-encode the compressed bytes
    const uint8 = new Uint8Array(compressed);
    let binary = '';
    for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
    const encoded = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    await expect(decodeState(encoded)).rejects.toThrow('Invalid PlaygroundState shape');
  });
});

// ─── URL helpers ─────────────────────────────────────────────────────────────

describe('getEncodedStateFromUrl', () => {
  beforeEach(() => {
    // Reset to a clean URL
    window.history.replaceState(null, '', '/');
  });

  it('returns null when the param is absent', () => {
    expect(getEncodedStateFromUrl()).toBeNull();
  });

  it('returns the encoded value when the param is present', () => {
    window.history.replaceState(null, '', `/?${STATE_PARAM}=abc123`);
    expect(getEncodedStateFromUrl()).toBe('abc123');
  });
});

describe('setEncodedStateInUrl', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('writes the encoded value into the URL', () => {
    setEncodedStateInUrl('xyz789');
    expect(new URLSearchParams(window.location.search).get(STATE_PARAM)).toBe('xyz789');
  });

  it('overwrites an existing param value', () => {
    window.history.replaceState(null, '', `/?${STATE_PARAM}=old`);
    setEncodedStateInUrl('new');
    expect(new URLSearchParams(window.location.search).get(STATE_PARAM)).toBe('new');
  });

  it('does not push a new history entry', () => {
    const spy = vi.spyOn(window.history, 'replaceState');
    setEncodedStateInUrl('somevalue');
    expect(spy).toHaveBeenCalledWith(null, '', expect.stringContaining('somevalue'));
    spy.mockRestore();
  });
});
