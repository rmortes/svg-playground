import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToolsPanel } from '../../src/components/ToolsPanel';
import type { ToolDef } from '../../src/types';

describe('ToolsPanel', () => {
  const noop = () => { };

  // --- Empty state ---

  it('renders an empty-state message when no tools are registered', () => {
    render(<ToolsPanel tools={[]} onToolValueChange={noop} onReset={noop} />);

    expect(screen.getByText(/no tools registered/i)).toBeInTheDocument();
  });

  it('mentions useInput and useRange in the empty-state message', () => {
    render(<ToolsPanel tools={[]} onToolValueChange={noop} onReset={noop} />);

    expect(screen.getByText(/useInput/)).toBeInTheDocument();
    expect(screen.getByText(/useRange/)).toBeInTheDocument();
  });

  // --- Input tool rendering ---

  it('renders a text input for a tool of type "input"', () => {
    const tools: ToolDef[] = [
      {
        index: 0,
        type: 'input',
        label: 'Name',
        value: 'Hello',
        config: { type: 'input', defaultValue: 'Hello' },
      },
    ];

    render(<ToolsPanel tools={tools} onToolValueChange={noop} onReset={noop} />);

    const input = screen.getByDisplayValue('Hello');
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('type', 'text');
  });

  it('renders the label for an input tool', () => {
    const tools: ToolDef[] = [
      {
        index: 0,
        type: 'input',
        label: 'Greeting',
        value: 'Hi',
        config: { type: 'input', defaultValue: 'Hi' },
      },
    ];

    render(<ToolsPanel tools={tools} onToolValueChange={noop} onReset={noop} />);

    expect(screen.getByText('Greeting')).toBeInTheDocument();
  });

  // --- Range tool rendering ---

  it('renders a range slider for a tool of type "range"', () => {
    const tools: ToolDef[] = [
      {
        index: 0,
        type: 'range',
        label: 'Radius',
        value: 50,
        config: { type: 'range', min: 0, max: 100, step: 1, defaultValue: 50 },
      },
    ];

    render(<ToolsPanel tools={tools} onToolValueChange={noop} onReset={noop} />);

    const slider = screen.getByRole('slider');
    expect(slider).toBeInTheDocument();
    expect(slider).toHaveAttribute('min', '0');
    expect(slider).toHaveAttribute('max', '100');
    expect(slider).toHaveAttribute('step', '1');
  });

  it('displays the current range value in an editable number input', () => {
    const tools: ToolDef[] = [
      {
        index: 0,
        type: 'range',
        label: 'Size',
        value: 42,
        config: { type: 'range', min: 0, max: 100, step: 1, defaultValue: 42 },
      },
    ];

    render(<ToolsPanel tools={tools} onToolValueChange={noop} onReset={noop} />);

    const valueInput = screen.getByRole('spinbutton');
    expect(valueInput).toBeInTheDocument();
    expect(valueInput).toHaveValue(42);
  });

  // --- Interactions ---

  it('calls onToolValueChange with string value when input changes', () => {
    const onChange = vi.fn();
    const tools: ToolDef[] = [
      {
        index: 0,
        type: 'input',
        label: 'Name',
        value: 'World',
        config: { type: 'input', defaultValue: 'World' },
      },
    ];

    render(<ToolsPanel tools={tools} onToolValueChange={onChange} onReset={noop} />);

    const input = screen.getByDisplayValue('World');
    fireEvent.change(input, { target: { value: 'Vitest' } });

    expect(onChange).toHaveBeenCalledWith(0, 'Vitest');
  });

  it('calls onToolValueChange with numeric value when slider changes', () => {
    const onChange = vi.fn();
    const tools: ToolDef[] = [
      {
        index: 0,
        type: 'range',
        label: 'R',
        value: 50,
        config: { type: 'range', min: 0, max: 100, step: 1, defaultValue: 50 },
      },
    ];

    render(<ToolsPanel tools={tools} onToolValueChange={onChange} onReset={noop} />);

    const slider = screen.getByRole('slider');
    fireEvent.change(slider, { target: { value: '75' } });

    expect(onChange).toHaveBeenCalledWith(0, 75);
  });

  it('calls onReset when the reset button is clicked', () => {
    const onReset = vi.fn();

    render(<ToolsPanel tools={[]} onToolValueChange={noop} onReset={onReset} />);

    const btn = screen.getByRole('button', { name: /reset to defaults/i });
    fireEvent.click(btn);

    expect(onReset).toHaveBeenCalledTimes(1);
  });

  // --- Multiple tools ---

  it('renders multiple tools of mixed types', () => {
    const tools: ToolDef[] = [
      {
        index: 0,
        type: 'input',
        label: 'Label',
        value: 'hi',
        config: { type: 'input', defaultValue: 'hi' },
      },
      {
        index: 1,
        type: 'range',
        label: 'Count',
        value: 10,
        config: { type: 'range', min: 0, max: 50, step: 1, defaultValue: 10 },
      },
    ];

    render(<ToolsPanel tools={tools} onToolValueChange={noop} onReset={noop} />);

    expect(screen.getByDisplayValue('hi')).toBeInTheDocument();
    expect(screen.getByRole('slider')).toBeInTheDocument();
    expect(screen.getByText('Label')).toBeInTheDocument();
    expect(screen.getByText('Count')).toBeInTheDocument();
  });

  // --- Range value number input ---

  it('calls onToolValueChange when a value is typed into the range number input', () => {
    const onChange = vi.fn();
    const tools: ToolDef[] = [
      {
        index: 0,
        type: 'range',
        label: 'Size',
        value: 50,
        config: { type: 'range', min: 0, max: 100, step: 1, defaultValue: 50 },
      },
    ];

    render(<ToolsPanel tools={tools} onToolValueChange={onChange} onReset={noop} />);

    const valueInput = screen.getByRole('spinbutton');
    fireEvent.change(valueInput, { target: { value: '75' } });

    expect(onChange).toHaveBeenCalledWith(0, 75);
  });

  it('allows typing a value larger than the range max', () => {
    const onChange = vi.fn();
    const tools: ToolDef[] = [
      {
        index: 0,
        type: 'range',
        label: 'Size',
        value: 50,
        config: { type: 'range', min: 0, max: 100, step: 1, defaultValue: 50 },
      },
    ];

    render(<ToolsPanel tools={tools} onToolValueChange={onChange} onReset={noop} />);

    const valueInput = screen.getByRole('spinbutton');
    fireEvent.change(valueInput, { target: { value: '999' } });

    expect(onChange).toHaveBeenCalledWith(0, 999);
  });

  it('allows typing a value smaller than the range min', () => {
    const onChange = vi.fn();
    const tools: ToolDef[] = [
      {
        index: 0,
        type: 'range',
        label: 'Size',
        value: 50,
        config: { type: 'range', min: 0, max: 100, step: 1, defaultValue: 50 },
      },
    ];

    render(<ToolsPanel tools={tools} onToolValueChange={onChange} onReset={noop} />);

    const valueInput = screen.getByRole('spinbutton');
    fireEvent.change(valueInput, { target: { value: '-20' } });

    expect(onChange).toHaveBeenCalledWith(0, -20);
  });

  it('allows typing a value not aligned to the range step', () => {
    const onChange = vi.fn();
    const tools: ToolDef[] = [
      {
        index: 0,
        type: 'range',
        label: 'Size',
        value: 50,
        config: { type: 'range', min: 0, max: 100, step: 10, defaultValue: 50 },
      },
    ];

    render(<ToolsPanel tools={tools} onToolValueChange={onChange} onReset={noop} />);

    const valueInput = screen.getByRole('spinbutton');
    fireEvent.change(valueInput, { target: { value: '37' } });

    expect(onChange).toHaveBeenCalledWith(0, 37);
  });

  it('does not call onToolValueChange when typing an empty string', () => {
    const onChange = vi.fn();
    const tools: ToolDef[] = [
      {
        index: 0,
        type: 'range',
        label: 'Size',
        value: 50,
        config: { type: 'range', min: 0, max: 100, step: 1, defaultValue: 50 },
      },
    ];

    render(<ToolsPanel tools={tools} onToolValueChange={onChange} onReset={noop} />);

    const valueInput = screen.getByRole('spinbutton');
    fireEvent.change(valueInput, { target: { value: '' } });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('reverts to the last valid value on blur when the input is empty', () => {
    const tools: ToolDef[] = [
      {
        index: 0,
        type: 'range',
        label: 'Size',
        value: 50,
        config: { type: 'range', min: 0, max: 100, step: 1, defaultValue: 50 },
      },
    ];

    render(<ToolsPanel tools={tools} onToolValueChange={noop} onReset={noop} />);

    const valueInput = screen.getByRole('spinbutton');
    fireEvent.change(valueInput, { target: { value: '' } });
    fireEvent.blur(valueInput);

    expect(valueInput).toHaveValue(50);
  });

  it('updates the number input when the slider value changes via props', () => {
    const tools: ToolDef[] = [
      {
        index: 0,
        type: 'range',
        label: 'Size',
        value: 50,
        config: { type: 'range', min: 0, max: 100, step: 1, defaultValue: 50 },
      },
    ];

    const { rerender } = render(
      <ToolsPanel tools={tools} onToolValueChange={noop} onReset={noop} />
    );

    const valueInput = screen.getByRole('spinbutton');
    expect(valueInput).toHaveValue(50);

    const updatedTools: ToolDef[] = [
      { ...tools[0], value: 80 },
    ];

    rerender(
      <ToolsPanel tools={updatedTools} onToolValueChange={noop} onReset={noop} />
    );

    expect(valueInput).toHaveValue(80);
  });

  it('has no min, max, or step attributes on the number input', () => {
    const tools: ToolDef[] = [
      {
        index: 0,
        type: 'range',
        label: 'Size',
        value: 50,
        config: { type: 'range', min: 0, max: 100, step: 1, defaultValue: 50 },
      },
    ];

    render(<ToolsPanel tools={tools} onToolValueChange={noop} onReset={noop} />);

    const valueInput = screen.getByRole('spinbutton');
    expect(valueInput).not.toHaveAttribute('min');
    expect(valueInput).not.toHaveAttribute('max');
    expect(valueInput).not.toHaveAttribute('step');
  });

  it('accepts decimal values in the number input', () => {
    const onChange = vi.fn();
    const tools: ToolDef[] = [
      {
        index: 0,
        type: 'range',
        label: 'Opacity',
        value: 0.5,
        config: { type: 'range', min: 0, max: 1, step: 0.1, defaultValue: 0.5 },
      },
    ];

    render(<ToolsPanel tools={tools} onToolValueChange={onChange} onReset={noop} />);

    const valueInput = screen.getByRole('spinbutton');
    fireEvent.change(valueInput, { target: { value: '0.73' } });

    expect(onChange).toHaveBeenCalledWith(0, 0.73);
  });
});
