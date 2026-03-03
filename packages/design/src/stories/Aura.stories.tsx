import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { Aura } from '../components/Aura.js';

const meta: Meta<typeof Aura> = {
  title: 'Components/Aura',
  component: Aura,
  argTypes: {
    state: {
      control: 'select',
      options: ['idle', 'active', 'thinking', 'hidden'],
    },
    position: {
      control: 'select',
      options: ['corner', 'center', 'inline'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof Aura>;

const containerStyle: React.CSSProperties = {
  position: 'relative',
  width: 300,
  height: 300,
  background: 'var(--color-bg)',
  borderRadius: 'var(--radius-organic-lg)',
  border: '1px solid var(--color-border)',
  overflow: 'hidden',
};

export const Idle: Story = {
  render: () => (
    <div style={containerStyle}>
      <Aura state="idle" position="corner" />
    </div>
  ),
};

export const Active: Story = {
  render: () => (
    <div style={containerStyle}>
      <Aura state="active" position="corner" />
    </div>
  ),
};

export const Thinking: Story = {
  render: () => (
    <div style={containerStyle}>
      <Aura state="thinking" position="corner" />
    </div>
  ),
};

export const Hidden: Story = {
  render: () => (
    <div style={containerStyle}>
      <Aura state="hidden" position="corner" />
    </div>
  ),
};

export const CenterPosition: Story = {
  render: () => (
    <div style={containerStyle}>
      <Aura state="idle" position="center" />
    </div>
  ),
};

export const CenterActive: Story = {
  render: () => (
    <div style={containerStyle}>
      <Aura state="active" position="center" />
    </div>
  ),
};

export const CenterThinking: Story = {
  render: () => (
    <div style={containerStyle}>
      <Aura state="thinking" position="center" />
    </div>
  ),
};

export const Inline: Story = {
  render: () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ color: 'var(--color-text)', fontSize: 'var(--font-size-base)' }}>AI is</span>
      <Aura state="active" position="inline" />
      <span style={{ color: 'var(--color-text)', fontSize: 'var(--font-size-base)' }}>
        analyzing your vault
      </span>
    </div>
  ),
};

export const AllStates: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
      {(['idle', 'active', 'thinking', 'hidden'] as const).map((state) => (
        <div key={state} style={{ textAlign: 'center' }}>
          <div style={{ ...containerStyle, width: 180, height: 180, marginBottom: 8 }}>
            <Aura state={state} position="center" />
          </div>
          <div
            style={{
              fontSize: 'var(--font-size-sm)',
              color: 'var(--color-text-secondary)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {state}
          </div>
        </div>
      ))}
    </div>
  ),
};

export const InVaultCard: Story = {
  render: () => (
    <div
      style={{
        position: 'relative',
        padding: 20,
        background: 'var(--color-surface)',
        borderRadius: 'var(--radius-organic-lg)',
        border: '1px solid var(--color-border)',
        boxShadow: 'var(--shadow-md)',
        maxWidth: 400,
        overflow: 'hidden',
      }}
    >
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div
          style={{
            fontSize: 'var(--font-size-lg)',
            fontWeight: 'var(--font-weight-semibold)' as unknown as number,
            color: 'var(--color-text)',
            marginBottom: 4,
          }}
        >
          Vault Health
        </div>
        <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
          AI is analyzing your passwords...
        </div>
      </div>
      <Aura state="thinking" position="corner" />
    </div>
  ),
};
