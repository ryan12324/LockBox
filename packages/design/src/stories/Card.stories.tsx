import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { Card } from '../components/Card.js';

const meta: Meta<typeof Card> = {
  title: 'Components/Card',
  component: Card,
  argTypes: {
    variant: {
      control: 'select',
      options: ['surface', 'raised', 'frost'],
    },
    padding: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof Card>;

const sampleContent = (
  <div>
    <div
      style={{
        fontSize: 'var(--font-size-lg)',
        fontWeight: 'var(--font-weight-semibold)' as unknown as number,
        color: 'var(--color-text)',
        marginBottom: 8,
      }}
    >
      Vault Item
    </div>
    <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
      user@example.com
    </div>
  </div>
);

export const Surface: Story = {
  args: { variant: 'surface', children: sampleContent },
};

export const Raised: Story = {
  args: { variant: 'raised', children: sampleContent },
};

export const Frost: Story = {
  render: () => (
    <div
      style={{
        padding: 40,
        background: 'linear-gradient(135deg, var(--color-bg) 0%, var(--color-bg-subtle) 100%)',
        borderRadius: 'var(--radius-lg)',
        minHeight: 200,
      }}
    >
      <Card variant="frost">{sampleContent}</Card>
    </div>
  ),
};

export const Interactive: Story = {
  render: () => (
    <Card variant="raised" onClick={() => alert('Card clicked!')}>
      <div
        style={{
          fontSize: 'var(--font-size-lg)',
          fontWeight: 'var(--font-weight-semibold)' as unknown as number,
          color: 'var(--color-text)',
          marginBottom: 4,
        }}
      >
        Click me
      </div>
      <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
        Interactive card with hover effect
      </div>
    </Card>
  ),
};

export const PaddingSizes: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card padding="sm">
        <span style={{ color: 'var(--color-text)' }}>Small padding</span>
      </Card>
      <Card padding="md">
        <span style={{ color: 'var(--color-text)' }}>Medium padding (default)</span>
      </Card>
      <Card padding="lg">
        <span style={{ color: 'var(--color-text)' }}>Large padding</span>
      </Card>
    </div>
  ),
};

export const AllVariants: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
      <Card variant="surface" style={{ flex: 1, minWidth: 200 }}>
        <div
          style={{
            fontSize: 'var(--font-size-sm)',
            fontWeight: 'var(--font-weight-semibold)' as unknown as number,
            color: 'var(--color-text-secondary)',
            marginBottom: 4,
          }}
        >
          Surface
        </div>
        <div style={{ color: 'var(--color-text)' }}>Default card style</div>
      </Card>
      <Card variant="raised" style={{ flex: 1, minWidth: 200 }}>
        <div
          style={{
            fontSize: 'var(--font-size-sm)',
            fontWeight: 'var(--font-weight-semibold)' as unknown as number,
            color: 'var(--color-text-secondary)',
            marginBottom: 4,
          }}
        >
          Raised
        </div>
        <div style={{ color: 'var(--color-text)' }}>Elevated card style</div>
      </Card>
      <Card variant="frost" style={{ flex: 1, minWidth: 200 }}>
        <div
          style={{
            fontSize: 'var(--font-size-sm)',
            fontWeight: 'var(--font-weight-semibold)' as unknown as number,
            color: 'var(--color-text-secondary)',
            marginBottom: 4,
          }}
        >
          Frost
        </div>
        <div style={{ color: 'var(--color-text)' }}>Frosted glass style</div>
      </Card>
    </div>
  ),
};
