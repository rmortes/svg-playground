import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useUrlSync } from '../../src/hooks/useUrlSync';
import { STATE_PARAM } from '../../src/lib/stateCodec';
import type { PlaygroundState } from '../../src/lib/stateCodec';

// ─── Module mock ─────────────────────────────────────────────────────────────
// Mocking the codec keeps these tests fast and decoupled from CompressionStream.
// The codec itself is exercised by its own unit tests (tests/lib/stateCodec.test.ts).

vi.mock('../../src/lib/stateCodec', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/stateCodec')>();
  return {
    ...actual,                        // keep STATE_PARAM and other constants
    encodeState: vi.fn(),
    decodeState: vi.fn(),
    getEncodedStateFromUrl: vi.fn(),
    setEncodedStateInUrl: vi.fn(),
  };
});

// Import the now-mocked functions so each test can configure them
import {
  encodeState,
  decodeState,
  getEncodedStateFromUrl,
  setEncodedStateInUrl,
} from '../../src/lib/stateCodec';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const SAMPLE_STATE: PlaygroundState = {
  code: 'return <svg />;',
  tools: [
    {
      index: 0,
      type: 'input',
      label: 'Name',
      value: 'World',
      config: { type: 'input', defaultValue: 'World' },
    },
  ],
};

// ─── Shared setup ─────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no URL param, encode/decode work synchronously
  vi.mocked(getEncodedStateFromUrl).mockReturnValue(null);
  vi.mocked(encodeState).mockResolvedValue('mock-encoded');
  vi.mocked(setEncodedStateInUrl).mockImplementation(() => undefined);
});

// ─── Mount: read from URL ────────────────────────────────────────────────────

describe('useUrlSync — mount (read from URL)', () => {
  it('calls onLoadState with decoded state when URL has ?s= param', async () => {
    vi.mocked(getEncodedStateFromUrl).mockReturnValue('some-encoded-value');
    vi.mocked(decodeState).mockResolvedValue(SAMPLE_STATE);

    const onLoadState = vi.fn();
    renderHook(() => useUrlSync({ code: '', tools: [], onLoadState }));

    await waitFor(() => expect(onLoadState).toHaveBeenCalledTimes(1));
    expect(onLoadState).toHaveBeenCalledWith(SAMPLE_STATE);
  });

  it('does not call onLoadState when URL has no ?s= param', async () => {
    // getEncodedStateFromUrl already returns null via default mock
    const onLoadState = vi.fn();
    renderHook(() => useUrlSync({ code: 'return <svg />;', tools: [], onLoadState }));

    await act(async () => { }); // flush effects
    expect(onLoadState).not.toHaveBeenCalled();
  });

  it('silently ignores a corrupt ?s= param without calling onLoadState', async () => {
    vi.mocked(getEncodedStateFromUrl).mockReturnValue('corrupt-value');
    vi.mocked(decodeState).mockRejectedValue(new Error('invalid'));

    const onLoadState = vi.fn();
    renderHook(() => useUrlSync({ code: '', tools: [], onLoadState }));

    // Wait for the rejected decode to settle
    await waitFor(() => expect(decodeState).toHaveBeenCalledTimes(1));
    expect(onLoadState).not.toHaveBeenCalled();
  });

  it('writes to URL even when code/tools do not change after a URL-param load (the useState-init bug)', async () => {
    // This is the scenario that was BROKEN with the old useRef approach:
    // if the decoded state is identical to the current app state, React bails
    // out of the setState calls in onLoadState, so code/tools never change,
    // and the write effect (which only listed [code, tools] as deps) never ran.
    // With useState for `initialized`, the effect re-runs when initialized flips.
    vi.mocked(getEncodedStateFromUrl).mockReturnValue('some-encoded');
    vi.mocked(decodeState).mockResolvedValue(SAMPLE_STATE);

    renderHook(() =>
      // code and tools already match the decoded state
      useUrlSync({ code: SAMPLE_STATE.code, tools: SAMPLE_STATE.tools, onLoadState: vi.fn() })
    );

    // The write effect fires 800ms after initialization completes (real timers)
    await waitFor(
      () => expect(setEncodedStateInUrl).toHaveBeenCalledWith('mock-encoded'),
      { timeout: 2000 }
    );
  });
});

// ─── Change: write to URL ────────────────────────────────────────────────────
//
// Because `encodeState` is mocked to return a pre-resolved promise,
// the async setTimeout callback is effectively synchronous once the timer
// fires — fake timers + `vi.advanceTimersByTimeAsync` work cleanly.

describe('useUrlSync — change (write to URL)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('writes encoded state to the URL after the debounce period', async () => {
    const { rerender } = renderHook(
      ({ code, tools }) => useUrlSync({ code, tools, onLoadState: vi.fn() }),
      { initialProps: { code: 'v1', tools: SAMPLE_STATE.tools } }
    );

    // Let initialization complete (setInitialized(true) → re-render)
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    // Trigger a change
    rerender({ code: 'v2', tools: SAMPLE_STATE.tools });

    // Before debounce: no write yet
    expect(setEncodedStateInUrl).not.toHaveBeenCalled();

    // Advance past debounce
    await act(async () => { await vi.advanceTimersByTimeAsync(900); });

    expect(encodeState).toHaveBeenCalledWith({ code: 'v2', tools: SAMPLE_STATE.tools });
    expect(setEncodedStateInUrl).toHaveBeenCalledWith('mock-encoded');
  });

  it('debounces rapid changes — URL is updated only once after the final change', async () => {
    const { rerender } = renderHook(
      ({ code, tools }) => useUrlSync({ code, tools, onLoadState: vi.fn() }),
      { initialProps: { code: 'v1', tools: [] as PlaygroundState['tools'] } }
    );

    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    // Rapid-fire several changes — each one resets the debounce timer
    rerender({ code: 'v2', tools: [] });
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });

    rerender({ code: 'v3', tools: [] });
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });

    rerender({ code: 'v4-final', tools: [] });

    // Let the debounce settle from the last change
    await act(async () => { await vi.advanceTimersByTimeAsync(900); });

    // Exactly one write should have happened, with the LAST code value
    expect(encodeState).toHaveBeenLastCalledWith({ code: 'v4-final', tools: [] });
    // setEncodedStateInUrl was called at most once per debounce window
    // (previous timers were all cancelled before they fired)
    const calls = vi.mocked(setEncodedStateInUrl).mock.calls;
    expect(calls[calls.length - 1]).toEqual(['mock-encoded']);
  });

  it('does not write to URL before initialization completes', async () => {
    // Simulate a slow async decode
    let resolveDecode!: (state: PlaygroundState) => void;
    vi.mocked(getEncodedStateFromUrl).mockReturnValue('some-encoded');
    vi.mocked(decodeState).mockReturnValue(
      new Promise<PlaygroundState>((resolve) => { resolveDecode = resolve; })
    );

    renderHook(() =>
      useUrlSync({ code: 'code', tools: [], onLoadState: vi.fn() })
    );

    // Advance past the debounce period — decode has not resolved yet
    await act(async () => { await vi.advanceTimersByTimeAsync(900); });

    expect(setEncodedStateInUrl).not.toHaveBeenCalled();

    // Now let the decode resolve
    await act(async () => { resolveDecode(SAMPLE_STATE); });

    // Write happens only after 800ms debounce from initialization
    await act(async () => { await vi.advanceTimersByTimeAsync(900); });

    expect(setEncodedStateInUrl).toHaveBeenCalledTimes(1);
  });

  it('cancels the pending write on unmount', async () => {
    const { result: _result, unmount } = renderHook(() =>
      useUrlSync({ code: 'code', tools: [], onLoadState: vi.fn() })
    );

    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    // Unmount before the debounce fires
    act(() => { unmount(); });

    await act(async () => { await vi.advanceTimersByTimeAsync(900); });

    expect(setEncodedStateInUrl).not.toHaveBeenCalled();
  });
});
