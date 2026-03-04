import type { ToolDef } from '../types';

export interface PlaygroundState {
  code: string;
  tools: ToolDef[];
}

/** URL query-param key that holds the encoded state */
export const STATE_PARAM = 's';

// ─── Base64url helpers ──────────────────────────────────────────────────────

function arrayBufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64urlToUint8Array(str: string): Uint8Array {
  // Re-add standard Base64 padding and convert URL-safe chars back
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ─── Codec ──────────────────────────────────────────────────────────────────

/**
 * Serialises PlaygroundState → JSON → deflate-raw → Base64url.
 *
 * deflate-raw on JSX code typically achieves 60–80 % compression, making it
 * far more effective than switching to a binary serialisation format (BSON,
 * MessagePack, etc.) alone.
 */
export async function encodeState(state: PlaygroundState): Promise<string> {
  const json = JSON.stringify(state);
  const bytes = new TextEncoder().encode(json);

  // Start consuming the readable side BEFORE awaiting writer.close().
  // If the readable is not drained concurrently, writer.close() never resolves
  // because a TransformStream backpressures until its output is consumed.
  const cs = new CompressionStream('deflate-raw');
  const writer = cs.writable.getWriter();
  const compressedPromise = new Response(cs.readable).arrayBuffer();
  await writer.write(bytes);
  await writer.close();
  const compressed = await compressedPromise;

  return arrayBufferToBase64url(compressed);
}

/**
 * Reverses encodeState.  Throws if the input is malformed or the decoded
 * value doesn't match the expected PlaygroundState shape.
 */
export async function decodeState(encoded: string): Promise<PlaygroundState> {
  const bytes = base64urlToUint8Array(encoded);

  const ds = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  const decompressedPromise = new Response(ds.readable).arrayBuffer();
  await writer.write(bytes);
  await writer.close();
  const decompressed = await decompressedPromise;
  const json = new TextDecoder().decode(decompressed);
  const parsed: unknown = JSON.parse(json);

  if (
    typeof (parsed as Record<string, unknown>).code !== 'string' ||
    !Array.isArray((parsed as Record<string, unknown>).tools)
  ) {
    throw new Error('Invalid PlaygroundState shape');
  }

  return parsed as PlaygroundState;
}

// ─── URL helpers ─────────────────────────────────────────────────────────────

/** Returns the raw encoded value of STATE_PARAM from the current URL, or null. */
export function getEncodedStateFromUrl(): string | null {
  try {
    return new URLSearchParams(window.location.search).get(STATE_PARAM);
  } catch {
    return null;
  }
}

/** Writes an encoded state string into the current URL without triggering navigation. */
export function setEncodedStateInUrl(encoded: string): void {
  const url = new URL(window.location.href);
  url.searchParams.set(STATE_PARAM, encoded);
  window.history.replaceState(null, '', url.toString());
}
