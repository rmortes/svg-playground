import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { SvgPreview } from '../../src/components/SvgPreview';

const mockZoomIn = vi.fn();
const mockZoomOut = vi.fn();
const mockResetTransform = vi.fn();

// Mock usePanZoom to avoid pointer-event complexity in component tests
vi.mock('../../src/hooks/usePanZoom', () => ({
  usePanZoom: () => ({
    containerCallbackRef: vi.fn(),
    canvasRef: createRef(),
    transform: 'translate(0px, 0px) scale(1)',
    scale: 1,
    resetTransform: mockResetTransform,
    zoomIn: mockZoomIn,
    zoomOut: mockZoomOut,
  }),
}));

describe('SvgPreview', () => {
  const defaultProps = {
    component: null,
    error: null,
    resetKey: 0,
    onAfterRender: vi.fn(),
  };

  beforeEach(() => {
    mockZoomIn.mockClear();
    mockZoomOut.mockClear();
    mockResetTransform.mockClear();
  });

  // --- Error state ---

  it('shows error overlay when error prop is set', () => {
    render(<SvgPreview {...defaultProps} error="compile error" />);

    expect(screen.getByText('compile error')).toBeInTheDocument();
  });

  it('does not render the component when error is present', () => {
    const Comp = () => <div data-testid="user-component" />;
    render(
      <SvgPreview {...defaultProps} component={Comp} error="some error" />
    );

    expect(screen.queryByTestId('user-component')).not.toBeInTheDocument();
    expect(screen.getByText('some error')).toBeInTheDocument();
  });

  // --- Empty state ---

  it('shows empty message when no component and no error', () => {
    render(<SvgPreview {...defaultProps} />);

    expect(screen.getByText(/write some code/i)).toBeInTheDocument();
  });

  // --- Component rendering ---

  it('renders the user component when provided', () => {
    const UserComp = () => <svg data-testid="user-svg" />;
    render(<SvgPreview {...defaultProps} component={UserComp} />);

    expect(screen.getByTestId('user-svg')).toBeInTheDocument();
  });

  it('calls onAfterRender when a component is rendered', async () => {
    const onAfterRender = vi.fn();
    const UserComp = () => <svg />;

    render(
      <SvgPreview
        {...defaultProps}
        component={UserComp}
        onAfterRender={onAfterRender}
      />
    );

    // useEffect runs after render
    expect(onAfterRender).toHaveBeenCalled();
  });

  it('does not call onAfterRender when there is no component', () => {
    const onAfterRender = vi.fn();

    render(
      <SvgPreview {...defaultProps} onAfterRender={onAfterRender} />
    );

    expect(onAfterRender).not.toHaveBeenCalled();
  });

  // --- Zoom controls ---

  it('renders zoom control buttons', () => {
    const UserComp = () => <svg />;
    render(<SvgPreview {...defaultProps} component={UserComp} />);

    expect(screen.getByTitle('Zoom in')).toBeInTheDocument();
    expect(screen.getByTitle('Zoom out')).toBeInTheDocument();
    expect(screen.getByTitle('Reset zoom')).toBeInTheDocument();
  });

  it('displays the current zoom percentage', () => {
    const UserComp = () => <svg />;
    render(<SvgPreview {...defaultProps} component={UserComp} />);

    expect(screen.getByTitle('Reset zoom')).toHaveTextContent('100%');
  });

  it('calls zoomIn when the + button is clicked', async () => {
    const user = userEvent.setup();
    const UserComp = () => <svg />;
    render(<SvgPreview {...defaultProps} component={UserComp} />);

    await user.click(screen.getByTitle('Zoom in'));

    expect(mockZoomIn).toHaveBeenCalledOnce();
  });

  it('calls zoomOut when the − button is clicked', async () => {
    const user = userEvent.setup();
    const UserComp = () => <svg />;
    render(<SvgPreview {...defaultProps} component={UserComp} />);

    await user.click(screen.getByTitle('Zoom out'));

    expect(mockZoomOut).toHaveBeenCalledOnce();
  });

  it('calls resetTransform when the zoom percentage label is clicked', async () => {
    const user = userEvent.setup();
    const UserComp = () => <svg />;
    render(<SvgPreview {...defaultProps} component={UserComp} />);

    await user.click(screen.getByTitle('Reset zoom'));

    expect(mockResetTransform).toHaveBeenCalledOnce();
  });

  it('does not render zoom controls when there is no component', () => {
    render(<SvgPreview {...defaultProps} />);

    expect(screen.queryByTitle('Zoom in')).not.toBeInTheDocument();
  });

  it('does not render zoom controls when there is an error', () => {
    render(<SvgPreview {...defaultProps} error="some error" />);

    expect(screen.queryByTitle('Zoom in')).not.toBeInTheDocument();
  });

  it('wraps the user component in a canvas element with a transform style', () => {
    const UserComp = () => <svg data-testid="user-svg" />;
    render(<SvgPreview {...defaultProps} component={UserComp} />);

    const svg = screen.getByTestId('user-svg');
    const canvas = svg.closest('.svg-preview-canvas');
    expect(canvas).toBeInTheDocument();
    expect(canvas).toHaveStyle({ transform: 'translate(0px, 0px) scale(1)' });
  });
});
