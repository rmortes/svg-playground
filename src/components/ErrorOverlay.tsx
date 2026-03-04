interface ErrorOverlayProps {
  message: string;
}

export function ErrorOverlay({ message }: ErrorOverlayProps) {
  return (
    <div className="error-overlay">
      <div className="error-overlay-header">⚠ Error</div>
      <pre className="error-overlay-message">{message}</pre>
    </div>
  );
}
