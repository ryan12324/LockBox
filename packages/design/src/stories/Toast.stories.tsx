import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { Toast } from '../components/Toast.js';

const meta: Meta<typeof Toast> = {
  title: 'Components/Toast',
  component: Toast,
  argTypes: {
    variant: {
      control: 'select',
      options: ['info', 'success', 'error', 'warning'],
    },
    message: { control: 'text' },
    duration: { control: 'number' },
    visible: { control: 'boolean' },
  },
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof Toast>;

export const Info: Story = {
  args: {
    variant: 'info',
    message: 'Your vault has been synced.',
    duration: 0,
    visible: true,
  },
};

export const Success: Story = {
  args: {
    variant: 'success',
    message: 'Password saved to vault.',
    duration: 0,
    visible: true,
  },
};

export const Error: Story = {
  args: {
    variant: 'error',
    message: 'Decryption failed. Check your master password.',
    duration: 0,
    visible: true,
  },
};

export const Warning: Story = {
  args: {
    variant: 'warning',
    message: 'This password was found in a breach.',
    duration: 0,
    visible: true,
  },
};

export const WithDismiss: Story = {
  args: {
    variant: 'info',
    message: 'Click the X to dismiss.',
    duration: 0,
    visible: true,
    onDismiss: () => {},
  },
};

export const AllVariants: Story = {
  render: () => (
    <div style={{ position: 'relative', minHeight: 400, padding: 20 }}>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
        Toast notifications stack in the bottom-right corner.
      </p>
      <div
        style={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          zIndex: 9999,
        }}
      >
        {(['info', 'success', 'warning', 'error'] as const).map((variant) => (
          <div
            key={variant}
            className="fade-in"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '12px 18px',
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--font-size-sm)',
              color: 'var(--color-text)',
              background:
                variant === 'info'
                  ? 'var(--color-surface-raised)'
                  : `var(--color-${variant}-subtle)`,
              border: `1px solid ${variant === 'info' ? 'var(--color-border)' : `var(--color-${variant})`}`,
              borderRadius: 'var(--radius-organic-md)',
              boxShadow: 'var(--shadow-lg)',
              maxWidth: 360,
            }}
          >
            {variant} toast
          </div>
        ))}
      </div>
    </div>
  ),
};
