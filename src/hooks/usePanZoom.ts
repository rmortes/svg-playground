import { useState, useCallback, useRef, useEffect } from 'react';

interface PanZoomState {
  x: number;
  y: number;
  scale: number;
}

const MIN_SCALE = 0.1;
const MAX_SCALE = 20;
const ZOOM_SENSITIVITY = 0.002;

const INITIAL_STATE: PanZoomState = { x: 0, y: 0, scale: 1 };

export function usePanZoom() {
  const [state, setState] = useState<PanZoomState>(INITIAL_STATE);

  // Use state (not a ref) for the container element so that when the div
  // mounts for the first time the event-listener effect re-runs.
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);
  const containerCallbackRef = useCallback((el: HTMLDivElement | null) => setContainerEl(el), []);

  const canvasRef = useRef<HTMLDivElement>(null);

  // Track drag state in refs to avoid re-renders on every move
  const isDragging = useRef(false);
  const lastPointer = useRef({ x: 0, y: 0 });
  const activePointerId = useRef<number | null>(null);

  const handlePointerDown = useCallback((e: PointerEvent) => {
    // Only pan with left button or single touch
    if (e.button !== 0) return;

    const target = e.target as HTMLElement;
    // Don't capture if the user is interacting with something inside the SVG
    // that has its own pointer handling (e.g. an interactive element)
    if (target.closest('[data-no-pan]')) return;

    isDragging.current = true;
    activePointerId.current = e.pointerId;
    lastPointer.current = { x: e.clientX, y: e.clientY };

    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  }, []);

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (!isDragging.current || e.pointerId !== activePointerId.current) return;

    const dx = e.clientX - lastPointer.current.x;
    const dy = e.clientY - lastPointer.current.y;
    lastPointer.current = { x: e.clientX, y: e.clientY };

    setState((prev) => ({
      ...prev,
      x: prev.x + dx,
      y: prev.y + dy,
    }));
  }, []);

  const handlePointerUp = useCallback((e: PointerEvent) => {
    if (e.pointerId !== activePointerId.current) return;
    isDragging.current = false;
    activePointerId.current = null;
  }, []);

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();

    const canvas = canvasRef.current;
    if (!canvas) return;

    // Cursor position relative to the canvas element's top-left.
    // With transform-origin: 0 0, getBoundingClientRect().left/top gives us
    // the canvas's actual top-left on screen (unaffected by scale).
    const canvasRect = canvas.getBoundingClientRect();
    const dx = e.clientX - canvasRect.left;
    const dy = e.clientY - canvasRect.top;

    setState((prev) => {
      const delta = -e.deltaY * ZOOM_SENSITIVITY;
      const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev.scale * (1 + delta)));
      const ratio = newScale / prev.scale;

      // Zoom toward cursor: the point under the cursor stays fixed
      const newX = dx * (1 - ratio) + prev.x;
      const newY = dy * (1 - ratio) + prev.y;

      return { x: newX, y: newY, scale: newScale };
    });
  }, []);

  const resetTransform = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  const zoomIn = useCallback(() => {
    setState((prev) => {
      const container = containerEl;
      if (!container) return prev;
      const rect = container.getBoundingClientRect();
      const cx = rect.width / 2;
      const cy = rect.height / 2;

      const newScale = Math.min(MAX_SCALE, prev.scale * 1.3);
      const ratio = newScale / prev.scale;
      return { x: cx - ratio * (cx - prev.x), y: cy - ratio * (cy - prev.y), scale: newScale };
    });
  }, [containerEl]);

  const zoomOut = useCallback(() => {
    setState((prev) => {
      const container = containerEl;
      if (!container) return prev;
      const rect = container.getBoundingClientRect();
      const cx = rect.width / 2;
      const cy = rect.height / 2;

      const newScale = Math.max(MIN_SCALE, prev.scale / 1.3);
      const ratio = newScale / prev.scale;
      return { x: cx - ratio * (cx - prev.x), y: cy - ratio * (cy - prev.y), scale: newScale };
    });
  }, [containerEl]);

  // Attach native events (need { passive: false } for wheel).
  // containerEl is in state (not a ref), so this effect re-runs whenever the
  // container div mounts or unmounts — solving the conditional-render problem.
  useEffect(() => {
    if (!containerEl) return;

    containerEl.addEventListener('pointerdown', handlePointerDown);
    containerEl.addEventListener('pointermove', handlePointerMove);
    containerEl.addEventListener('pointerup', handlePointerUp);
    containerEl.addEventListener('pointercancel', handlePointerUp);
    containerEl.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      containerEl.removeEventListener('pointerdown', handlePointerDown);
      containerEl.removeEventListener('pointermove', handlePointerMove);
      containerEl.removeEventListener('pointerup', handlePointerUp);
      containerEl.removeEventListener('pointercancel', handlePointerUp);
      containerEl.removeEventListener('wheel', handleWheel);
    };
  }, [containerEl, handlePointerDown, handlePointerMove, handlePointerUp, handleWheel]);

  return {
    containerCallbackRef,
    canvasRef,
    transform: `translate(${state.x}px, ${state.y}px) scale(${state.scale})`,
    scale: state.scale,
    resetTransform,
    zoomIn,
    zoomOut,
  };
}
