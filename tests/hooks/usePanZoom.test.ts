import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePanZoom } from '../../src/hooks/usePanZoom';

/**
 * Helper: renders the hook and wires up a real DOM container via the
 * containerCallbackRef, mirroring how SvgPreview uses the hook.
 */
function setupHook() {
  const container = document.createElement('div');
  document.body.appendChild(container);

  // Stub setPointerCapture / releasePointerCapture (not in jsdom)
  container.setPointerCapture = vi.fn();
  container.releasePointerCapture = vi.fn();

  // Give the container dimensions so zoom-center math has something to work with
  Object.defineProperty(container, 'getBoundingClientRect', {
    value: () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => { } }),
  });

  const hookResult = renderHook(() => usePanZoom());

  // Simulate the container div mounting by calling the callback ref with the element.
  // This triggers the state update inside usePanZoom that fires the event-listener effect.
  act(() => {
    hookResult.result.current.containerCallbackRef(container);
  });

  // Also give the canvasRef element dimensions
  const canvas = document.createElement('div');
  container.appendChild(canvas);
  Object.defineProperty(canvas, 'getBoundingClientRect', {
    value: () => ({ left: 0, top: 0, width: 400, height: 400, right: 400, bottom: 400, x: 0, y: 0, toJSON: () => { } }),
  });

  // Set the canvasRef.current to our canvas element
  (hookResult.result.current.canvasRef as React.MutableRefObject<HTMLDivElement>).current = canvas;

  function cleanup() {
    // Simulate unmount by calling the callback ref with null
    act(() => {
      hookResult.result.current.containerCallbackRef(null);
    });
    document.body.removeChild(container);
  }

  return { hookResult, container, canvas, cleanup };
}

function firePointerDown(el: HTMLElement, { clientX = 0, clientY = 0, button = 0, pointerId = 1 } = {}) {
  el.dispatchEvent(new PointerEvent('pointerdown', { clientX, clientY, button, pointerId, bubbles: true }));
}

function firePointerMove(el: HTMLElement, { clientX = 0, clientY = 0, pointerId = 1 } = {}) {
  el.dispatchEvent(new PointerEvent('pointermove', { clientX, clientY, pointerId, bubbles: true }));
}

function firePointerUp(el: HTMLElement, { pointerId = 1 } = {}) {
  el.dispatchEvent(new PointerEvent('pointerup', { pointerId, bubbles: true }));
}

function fireWheel(el: HTMLElement, { clientX = 0, clientY = 0, deltaY = 0 } = {}) {
  el.dispatchEvent(new WheelEvent('wheel', { clientX, clientY, deltaY, bubbles: true, cancelable: true }));
}

function parseTransform(transform: string) {
  const translateMatch = transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
  const scaleMatch = transform.match(/scale\(([-\d.]+)\)/);
  return {
    x: translateMatch ? parseFloat(translateMatch[1]) : 0,
    y: translateMatch ? parseFloat(translateMatch[2]) : 0,
    scale: scaleMatch ? parseFloat(scaleMatch[1]) : 1,
  };
}

describe('usePanZoom', () => {
  // --- Initial state ---

  it('starts with identity transform (no translation, scale 1)', () => {
    const { hookResult, cleanup } = setupHook();

    expect(hookResult.result.current.scale).toBe(1);
    const t = parseTransform(hookResult.result.current.transform);
    expect(t.x).toBe(0);
    expect(t.y).toBe(0);
    expect(t.scale).toBe(1);

    cleanup();
  });

  it('returns a canvasRef for attaching to the zoomable element', () => {
    const { hookResult, cleanup } = setupHook();

    expect(hookResult.result.current.canvasRef).toBeDefined();
    expect(hookResult.result.current.canvasRef.current).toBeInstanceOf(HTMLDivElement);

    cleanup();
  });

  // --- Panning ---

  it('pans when the user drags with the left mouse button', () => {
    const { hookResult, container, cleanup } = setupHook();

    act(() => {
      firePointerDown(container, { clientX: 100, clientY: 100, button: 0, pointerId: 1 });
      firePointerMove(container, { clientX: 150, clientY: 120, pointerId: 1 });
    });

    const t = parseTransform(hookResult.result.current.transform);
    expect(t.x).toBe(50);
    expect(t.y).toBe(20);

    cleanup();
  });

  it('accumulates panning over multiple move events', () => {
    const { hookResult, container, cleanup } = setupHook();

    act(() => {
      firePointerDown(container, { clientX: 0, clientY: 0, pointerId: 1 });
      firePointerMove(container, { clientX: 10, clientY: 5, pointerId: 1 });
      firePointerMove(container, { clientX: 30, clientY: 15, pointerId: 1 });
    });

    const t = parseTransform(hookResult.result.current.transform);
    expect(t.x).toBe(30);
    expect(t.y).toBe(15);

    cleanup();
  });

  it('stops panning after pointer up', () => {
    const { hookResult, container, cleanup } = setupHook();

    act(() => {
      firePointerDown(container, { clientX: 100, clientY: 100, pointerId: 1 });
      firePointerMove(container, { clientX: 150, clientY: 120, pointerId: 1 });
      firePointerUp(container, { pointerId: 1 });
      firePointerMove(container, { clientX: 200, clientY: 200, pointerId: 1 });
    });

    // Should only reflect movement before pointer up
    const t = parseTransform(hookResult.result.current.transform);
    expect(t.x).toBe(50);
    expect(t.y).toBe(20);

    cleanup();
  });

  it('does not pan with right mouse button', () => {
    const { hookResult, container, cleanup } = setupHook();

    act(() => {
      firePointerDown(container, { clientX: 100, clientY: 100, button: 2, pointerId: 1 });
      firePointerMove(container, { clientX: 150, clientY: 120, pointerId: 1 });
    });

    const t = parseTransform(hookResult.result.current.transform);
    expect(t.x).toBe(0);
    expect(t.y).toBe(0);

    cleanup();
  });

  it('does not pan when pointer starts on a data-no-pan element', () => {
    const { hookResult, container, cleanup } = setupHook();

    const noPanEl = document.createElement('button');
    noPanEl.setAttribute('data-no-pan', '');
    container.appendChild(noPanEl);

    act(() => {
      firePointerDown(noPanEl, { clientX: 100, clientY: 100, button: 0, pointerId: 1 });
      firePointerMove(container, { clientX: 150, clientY: 120, pointerId: 1 });
    });

    const t = parseTransform(hookResult.result.current.transform);
    expect(t.x).toBe(0);
    expect(t.y).toBe(0);

    cleanup();
  });

  it('ignores pointer move events from a different pointerId', () => {
    const { hookResult, container, cleanup } = setupHook();

    act(() => {
      firePointerDown(container, { clientX: 100, clientY: 100, pointerId: 1 });
      // Move from a different pointer — should be ignored
      firePointerMove(container, { clientX: 200, clientY: 200, pointerId: 2 });
    });

    const t = parseTransform(hookResult.result.current.transform);
    expect(t.x).toBe(0);
    expect(t.y).toBe(0);

    cleanup();
  });

  // --- Zooming via scroll ---

  it('zooms in on scroll up (negative deltaY)', () => {
    const { hookResult, container, cleanup } = setupHook();

    act(() => {
      fireWheel(container, { deltaY: -100, clientX: 200, clientY: 200 });
    });

    expect(hookResult.result.current.scale).toBeGreaterThan(1);

    cleanup();
  });

  it('zooms out on scroll down (positive deltaY)', () => {
    const { hookResult, container, cleanup } = setupHook();

    act(() => {
      fireWheel(container, { deltaY: 100, clientX: 200, clientY: 200 });
    });

    expect(hookResult.result.current.scale).toBeLessThan(1);

    cleanup();
  });

  it('does not zoom below the minimum scale', () => {
    const { hookResult, container, cleanup } = setupHook();

    // Scroll down aggressively many times
    act(() => {
      for (let i = 0; i < 50; i++) {
        fireWheel(container, { deltaY: 500, clientX: 200, clientY: 200 });
      }
    });

    expect(hookResult.result.current.scale).toBeGreaterThanOrEqual(0.1);

    cleanup();
  });

  it('does not zoom above the maximum scale', () => {
    const { hookResult, container, cleanup } = setupHook();

    // Scroll up aggressively many times
    act(() => {
      for (let i = 0; i < 50; i++) {
        fireWheel(container, { deltaY: -500, clientX: 200, clientY: 200 });
      }
    });

    expect(hookResult.result.current.scale).toBeLessThanOrEqual(20);

    cleanup();
  });

  // --- Zoom buttons ---

  it('zoomIn increases the scale', () => {
    const { hookResult, cleanup } = setupHook();

    act(() => {
      hookResult.result.current.zoomIn();
    });

    expect(hookResult.result.current.scale).toBeGreaterThan(1);

    cleanup();
  });

  it('zoomOut decreases the scale', () => {
    const { hookResult, cleanup } = setupHook();

    act(() => {
      hookResult.result.current.zoomOut();
    });

    expect(hookResult.result.current.scale).toBeLessThan(1);

    cleanup();
  });

  it('zoomIn followed by zoomOut returns close to the original scale', () => {
    const { hookResult, cleanup } = setupHook();

    act(() => {
      hookResult.result.current.zoomIn();
    });
    act(() => {
      hookResult.result.current.zoomOut();
    });

    // 1.3 * (1/1.3) = 1
    expect(hookResult.result.current.scale).toBeCloseTo(1, 5);

    cleanup();
  });

  // --- Reset ---

  it('resetTransform restores identity transform', () => {
    const { hookResult, container, cleanup } = setupHook();

    // Pan and zoom first
    act(() => {
      firePointerDown(container, { clientX: 0, clientY: 0, pointerId: 1 });
      firePointerMove(container, { clientX: 50, clientY: 30, pointerId: 1 });
      firePointerUp(container, { pointerId: 1 });
    });
    act(() => {
      hookResult.result.current.zoomIn();
    });

    // Verify we've moved and zoomed
    expect(hookResult.result.current.scale).not.toBe(1);
    const before = parseTransform(hookResult.result.current.transform);
    expect(before.x).not.toBe(0);

    // Reset
    act(() => {
      hookResult.result.current.resetTransform();
    });

    expect(hookResult.result.current.scale).toBe(1);
    const after = parseTransform(hookResult.result.current.transform);
    expect(after.x).toBe(0);
    expect(after.y).toBe(0);

    cleanup();
  });

  // --- Transform string format ---

  it('produces a valid CSS transform string with translate and scale', () => {
    const { hookResult, cleanup } = setupHook();

    const t = hookResult.result.current.transform;
    expect(t).toMatch(/^translate\([-\d.]+px,\s*[-\d.]+px\)\s+scale\([-\d.]+\)$/);

    cleanup();
  });

  // --- Combined pan + zoom ---

  it('supports panning after zooming', () => {
    const { hookResult, container, cleanup } = setupHook();

    // Zoom in first
    act(() => {
      hookResult.result.current.zoomIn();
    });

    const scaledScale = hookResult.result.current.scale;

    // Now pan
    act(() => {
      firePointerDown(container, { clientX: 100, clientY: 100, pointerId: 1 });
      firePointerMove(container, { clientX: 160, clientY: 130, pointerId: 1 });
      firePointerUp(container, { pointerId: 1 });
    });

    const t = parseTransform(hookResult.result.current.transform);
    // Scale should be unchanged
    expect(t.scale).toBe(scaledScale);
    // Translation should reflect the 60px / 30px drag (translation is in screen pixels)
    expect(t.x).not.toBe(0);
    expect(t.y).not.toBe(0);

    cleanup();
  });

  // --- Deferred mount / conditional rendering regression tests ---
  // These tests guard against the bug where the container div is not in the DOM
  // on initial render (e.g. SvgPreview shows an empty/error state first, then
  // switches to the component branch). If usePanZoom uses a plain ref instead of
  // a callback ref, the event-listener effect captures null on mount and never
  // re-runs — silently breaking pan and zoom while zoom buttons still work.

  it('supports pan when the container element is attached after initial render', () => {
    // Render the hook WITHOUT wiring up a container first
    const hookResult = renderHook(() => usePanZoom());

    // At this point, no container is connected — simulates the empty/error branch
    const t0 = parseTransform(hookResult.result.current.transform);
    expect(t0.x).toBe(0);

    // Now simulate the component branch mounting: create a container and call
    // the callback ref (just like React does when the ref'd div mounts)
    const container = document.createElement('div');
    document.body.appendChild(container);
    container.setPointerCapture = vi.fn();
    container.releasePointerCapture = vi.fn();

    act(() => {
      hookResult.result.current.containerCallbackRef(container);
    });

    // Pan — this MUST work after deferred attachment
    act(() => {
      firePointerDown(container, { clientX: 0, clientY: 0, pointerId: 1 });
      firePointerMove(container, { clientX: 40, clientY: 25, pointerId: 1 });
      firePointerUp(container, { pointerId: 1 });
    });

    const t1 = parseTransform(hookResult.result.current.transform);
    expect(t1.x).toBe(40);
    expect(t1.y).toBe(25);

    // Cleanup
    act(() => { hookResult.result.current.containerCallbackRef(null); });
    document.body.removeChild(container);
  });

  it('supports scroll zoom when the container element is attached after initial render', () => {
    const hookResult = renderHook(() => usePanZoom());

    const container = document.createElement('div');
    document.body.appendChild(container);
    container.setPointerCapture = vi.fn();

    // Attach a canvas for zoom math
    const canvas = document.createElement('div');
    container.appendChild(canvas);
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 400, height: 400, right: 400, bottom: 400, x: 0, y: 0, toJSON: () => { } }),
    });

    act(() => {
      hookResult.result.current.containerCallbackRef(container);
    });
    (hookResult.result.current.canvasRef as React.MutableRefObject<HTMLDivElement>).current = canvas;

    // Scroll zoom MUST work after deferred attachment
    act(() => {
      fireWheel(container, { deltaY: -100, clientX: 200, clientY: 200 });
    });

    expect(hookResult.result.current.scale).toBeGreaterThan(1);

    act(() => { hookResult.result.current.containerCallbackRef(null); });
    document.body.removeChild(container);
  });

  it('removes event listeners when the container element is detached', () => {
    const { hookResult, container, cleanup } = setupHook();

    // Detach the container (simulates switching from component to error/empty state)
    act(() => {
      hookResult.result.current.containerCallbackRef(null);
    });

    // Fire pointer events on the old container — they should NOT update position
    act(() => {
      firePointerDown(container, { clientX: 0, clientY: 0, pointerId: 1 });
      firePointerMove(container, { clientX: 100, clientY: 100, pointerId: 1 });
    });

    const t = parseTransform(hookResult.result.current.transform);
    expect(t.x).toBe(0);
    expect(t.y).toBe(0);

    cleanup();
  });

  it('re-attaches event listeners when container is re-mounted after unmount', () => {
    const hookResult = renderHook(() => usePanZoom());

    const container1 = document.createElement('div');
    document.body.appendChild(container1);
    container1.setPointerCapture = vi.fn();

    // Mount first container
    act(() => {
      hookResult.result.current.containerCallbackRef(container1);
    });

    // Unmount (null callback, like React does on unmount)
    act(() => {
      hookResult.result.current.containerCallbackRef(null);
    });

    // Mount a SECOND container (simulates: error → component → error → component)
    const container2 = document.createElement('div');
    document.body.appendChild(container2);
    container2.setPointerCapture = vi.fn();

    act(() => {
      hookResult.result.current.containerCallbackRef(container2);
    });

    // Pan on the new container must work
    act(() => {
      firePointerDown(container2, { clientX: 0, clientY: 0, pointerId: 1 });
      firePointerMove(container2, { clientX: 30, clientY: 20, pointerId: 1 });
      firePointerUp(container2, { pointerId: 1 });
    });

    const t = parseTransform(hookResult.result.current.transform);
    expect(t.x).toBe(30);
    expect(t.y).toBe(20);

    // Old container events should NOT work
    act(() => {
      firePointerDown(container1, { clientX: 0, clientY: 0, pointerId: 2 });
      firePointerMove(container1, { clientX: 50, clientY: 50, pointerId: 2 });
    });

    const t2 = parseTransform(hookResult.result.current.transform);
    // Only reflects the 30/20 from container2, not the 50/50 from container1
    expect(t2.x).toBe(30);
    expect(t2.y).toBe(20);

    act(() => { hookResult.result.current.containerCallbackRef(null); });
    document.body.removeChild(container1);
    document.body.removeChild(container2);
  });
});
