import { useEffect, useRef, useState } from 'react';
import {
  encodeState,
  decodeState,
  getEncodedStateFromUrl,
  setEncodedStateInUrl,
  type PlaygroundState,
} from '../lib/stateCodec';

/** How long to wait after the last change before writing to the URL. */
const WRITE_DEBOUNCE_MS = 800;

export interface UseUrlSyncOptions {
  /** Current editor code (used as-is, not the debounced value). */
  code: string;
  /** Current committed tool snapshot. */
  tools: PlaygroundState['tools'];
  /**
   * Called once on mount if a valid encoded state is found in the URL.
   * The caller should apply both `state.code` and `state.tools`.
   */
  onLoadState: (state: PlaygroundState) => void;
}

/**
 * Bidirectional sync between PlaygroundState and the URL `?s=` query param.
 *
 * - **On mount:** decodes the `?s=` param (if present) and calls `onLoadState`.
 * - **On change:** re-encodes and replaces the URL after WRITE_DEBOUNCE_MS.
 *
 * Encoding: JSON → deflate-raw (native CompressionStream) → Base64url.
 *
 * ## Why `initialized` is React state, not a ref
 *
 * The write effect is gated on `initialized` to avoid overwriting a
 * URL-supplied state before `onLoadState` has been called.  A `useRef` would
 * NOT work here: refs are mutable but not reactive — the write effect would
 * never know the ref flipped to `true` unless `code` or `tools` also changed
 * at exactly the same time (e.g. if decoded state == localStorage state, React
 * bails out of the setState and the write effect never re-runs → URL is never
 * updated).  Using `useState` makes the flip a proper dependency, guaranteeing
 * the effect re-evaluates as soon as initialization is complete.
 */
export function useUrlSync({ code, tools, onLoadState }: UseUrlSyncOptions): void {
  const [initialized, setInitialized] = useState(false);

  // Keep a stable ref to `onLoadState` so the mount effect never re-runs
  // just because the caller recreated the callback.
  const onLoadStateRef = useRef(onLoadState);
  onLoadStateRef.current = onLoadState;

  // ── Mount: read from URL ────────────────────────────────────────────────
  useEffect(() => {
    const encoded = getEncodedStateFromUrl();

    if (encoded) {
      decodeState(encoded)
        .then((state) => {
          onLoadStateRef.current(state);
        })
        .catch(() => {
          // Corrupt / outdated URL param — silently fall through to local state
        })
        .finally(() => {
          setInitialized(true);
        });
    } else {
      setInitialized(true);
    }
  }, []); // intentionally empty — run once on mount

  // ── Change: write to URL (debounced) ───────────────────────────────────
  //
  // `initialized` is listed as a dependency so this effect re-runs the moment
  // the read-from-URL phase completes, ensuring the first write happens even if
  // `code` and `tools` did not change (e.g. URL state == localStorage state).
  useEffect(() => {
    if (!initialized) return;

    const timer = setTimeout(async () => {
      try {
        const encoded = await encodeState({ code, tools });
        setEncodedStateInUrl(encoded);
      } catch {
        // Encoding failure (e.g., CompressionStream unavailable) — skip silently
      }
    }, WRITE_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [initialized, code, tools]);
}
