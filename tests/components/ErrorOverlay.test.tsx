import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorOverlay } from '../../src/components/ErrorOverlay';

describe('ErrorOverlay', () => {
  it('renders the error message', () => {
    render(<ErrorOverlay message="Something went wrong" />);

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('renders the error header', () => {
    render(<ErrorOverlay message="test error" />);

    expect(screen.getByText('⚠ Error')).toBeInTheDocument();
  });

  it('renders the message inside a pre element', () => {
    render(<ErrorOverlay message="details here" />);

    const pre = screen.getByText('details here');
    expect(pre.tagName).toBe('PRE');
  });

  it('renders multiline error messages', () => {
    const multiline = 'Line 1\nLine 2\nLine 3';
    render(<ErrorOverlay message={multiline} />);

    const pre = screen.getByText((_content, element) => {
      return element?.tagName === 'PRE' && element.textContent === multiline;
    });
    expect(pre).toBeInTheDocument();
  });
});
