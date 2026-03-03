import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { Modal } from '../components/Modal.js';

const meta: Meta<typeof Modal> = {
  title: 'Components/Modal',
  component: Modal,
  argTypes: {
    open: { control: 'boolean' },
    title: { control: 'text' },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof Modal>;

const ModalWithToggle = (props: Partial<React.ComponentProps<typeof Modal>>) => {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{ padding: '8px 16px', cursor: 'pointer' }}
      >
        Open Modal
      </button>
      <Modal open={open} onClose={() => setOpen(false)} {...props}>
        {props.children || <p style={{ margin: 0 }}>This is the modal content.</p>}
      </Modal>
    </>
  );
};

export const Default: Story = {
  render: () => <ModalWithToggle title="Confirm Action" />,
};

export const Small: Story = {
  render: () => (
    <ModalWithToggle title="Delete Item" size="sm">
      <p style={{ margin: '0 0 16px' }}>
        Are you sure you want to delete this item? This action cannot be undone.
      </p>
    </ModalWithToggle>
  ),
};

export const Large: Story = {
  render: () => (
    <ModalWithToggle title="Edit Vault Item" size="lg">
      <p style={{ margin: 0 }}>A larger modal for complex forms and content.</p>
    </ModalWithToggle>
  ),
};

export const WithTitle: Story = {
  render: () => (
    <ModalWithToggle title="Share This Item">
      <p style={{ margin: 0 }}>Generate a secure share link for this vault item.</p>
    </ModalWithToggle>
  ),
};

export const LongContent: Story = {
  render: () => (
    <ModalWithToggle title="Security Audit Report">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {Array.from({ length: 15 }, (_, i) => (
          <p key={i} style={{ margin: 0 }}>
            Audit finding #{i + 1}: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do
            eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam,
            quis nostrud exercitation ullamco laboris.
          </p>
        ))}
      </div>
    </ModalWithToggle>
  ),
};
