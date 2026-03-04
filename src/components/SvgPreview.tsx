import { useEffect, type ComponentType } from 'react';
import { ErrorBoundary } from '../engine/ErrorBoundary';
import { ErrorOverlay } from './ErrorOverlay';
import { usePanZoom } from '../hooks/usePanZoom';

interface SvgPreviewProps {
  component: ComponentType | null;
  error: string | null;
  resetKey: number;
  /** Called after every render — used to commit tool registrations */
  onAfterRender: () => void;
}

export function SvgPreview({ component: UserComponent, error, resetKey, onAfterRender }: SvgPreviewProps) {
  const { containerCallbackRef, canvasRef, transform, scale, resetTransform, zoomIn, zoomOut } = usePanZoom();

  // Call onAfterRender only after a real component render (hooks ran)
  useEffect(() => {
    if (UserComponent) {
      onAfterRender();
    }
  });

  if (error) {
    return (
      <div className="svg-preview">
        <ErrorOverlay message={error} />
      </div>
    );
  }

  if (!UserComponent) {
    return (
      <div className="svg-preview svg-preview-empty">
        <span>Write some code to see a preview…</span>
      </div>
    );
  }

  return (
    <div className="svg-preview" ref={containerCallbackRef}>
      <div className="svg-preview-canvas" ref={canvasRef} style={{ transform }}>
        <ErrorBoundary
          resetKey={resetKey}
          fallback={(err) => <ErrorOverlay message={err.message} />}
        >
          <UserComponent />
        </ErrorBoundary>
      </div>

      <div className="svg-preview-controls" data-no-pan>
        <button className="zoom-btn" onClick={zoomIn} title="Zoom in">+</button>
        <button className="zoom-btn zoom-label" onClick={resetTransform} title="Reset zoom">
          {Math.round(scale * 100)}%
        </button>
        <button className="zoom-btn" onClick={zoomOut} title="Zoom out">−</button>
      </div>
    </div>
  );
}
