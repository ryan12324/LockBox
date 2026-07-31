import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Card } from '../components/Card.js';
import { Input } from '../components/Input.js';
import { Modal } from '../components/Modal.js';
import { Toast } from '../components/Toast.js';

describe('design primitives', () => {
  it('associates input labels and errors with the control', () => {
    render(<Input label="Master password" type="password" error="Password is required" />);

    const input = screen.getByLabelText('Master password');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Password is required');
    expect(screen.getByRole('button', { name: 'Show password' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('makes interactive cards keyboard operable', () => {
    const onClick = vi.fn();
    render(<Card onClick={onClick}>Open item</Card>);

    const card = screen.getByRole('button', { name: 'Open item' });
    fireEvent.keyDown(card, { key: 'Enter' });
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('closes dialogs with Escape and restores focus', () => {
    function Harness() {
      const [open, setOpen] = React.useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Open</button>
          <Modal open={open} onClose={() => setOpen(false)} title="Edit item">
            <button type="button">Save</button>
          </Modal>
        </>
      );
    }

    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open' });
    opener.focus();
    fireEvent.click(opener);
    expect(screen.getByRole('dialog', { name: 'Edit item' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('announces urgent toast messages assertively', () => {
    render(<Toast variant="error" message="Could not save item" duration={0} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save item');
  });
});
