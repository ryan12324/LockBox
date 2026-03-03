import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { Badge } from '../components/Badge.js';

const meta: Meta<typeof Badge> = {
  title: 'Components/Badge',
  component: Badge,
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'primary', 'error', 'success', 'warning'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof Badge>;

export const Default: Story = {
  args: { children: 'Label' },
};

export const Primary: Story = {
  args: { variant: 'primary', children: 'AI Suggested' },
};

export const Error: Story = {
  args: { variant: 'error', children: 'Breached' },
};

export const Success: Story = {
  args: { variant: 'success', children: 'Strong' },
};

export const Warning: Story = {
  args: { variant: 'warning', children: 'Weak' },
};

export const AllVariants: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <Badge>Default</Badge>
      <Badge variant="primary">AI Suggested</Badge>
      <Badge variant="success">Strong</Badge>
      <Badge variant="warning">Reused</Badge>
      <Badge variant="error">Breached</Badge>
    </div>
  ),
};

export const InContext: Story = {
  render: () => (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: 16,
        background: 'var(--color-surface)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--color-border)',
      }}
    >
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontSize: 'var(--font-size-base)',
            fontWeight: 'var(--font-weight-medium)' as unknown as number,
            color: 'var(--color-text)',
          }}
        >
          github.com
        </div>
        <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
          user@example.com
        </div>
      </div>
      <Badge variant="warning">Reused</Badge>
      <Badge variant="error">90+ days</Badge>
    </div>
  ),
};
