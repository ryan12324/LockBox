import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { themeColors } from '../tokens/colors.js';

const colorGroups = [
  {
    label: 'Backgrounds',
    tokens: [
      { name: '--color-bg', var: 'var(--color-bg)' },
      { name: '--color-bg-subtle', var: 'var(--color-bg-subtle)' },
      { name: '--color-surface', var: 'var(--color-surface)' },
      { name: '--color-surface-raised', var: 'var(--color-surface-raised)' },
    ],
  },
  {
    label: 'Text',
    tokens: [
      { name: '--color-text', var: 'var(--color-text)' },
      { name: '--color-text-secondary', var: 'var(--color-text-secondary)' },
      { name: '--color-text-tertiary', var: 'var(--color-text-tertiary)' },
    ],
  },
  {
    label: 'Primary (Clay)',
    tokens: [
      { name: '--color-primary', var: 'var(--color-primary)' },
      { name: '--color-primary-hover', var: 'var(--color-primary-hover)' },
      { name: '--color-primary-active', var: 'var(--color-primary-active)' },
      { name: '--color-primary-fg', var: 'var(--color-primary-fg)' },
    ],
  },
  {
    label: 'Aura (AI Ghost)',
    tokens: [
      { name: '--color-aura', var: 'var(--color-aura)' },
      { name: '--color-aura-dim', var: 'var(--color-aura-dim)' },
      { name: '--color-aura-glow', var: 'var(--color-aura-glow)' },
    ],
  },
  {
    label: 'Borders',
    tokens: [
      { name: '--color-border', var: 'var(--color-border)' },
      { name: '--color-border-strong', var: 'var(--color-border-strong)' },
    ],
  },
  {
    label: 'Semantic',
    tokens: [
      { name: '--color-error', var: 'var(--color-error)' },
      { name: '--color-success', var: 'var(--color-success)' },
      { name: '--color-warning', var: 'var(--color-warning)' },
    ],
  },
  {
    label: 'Frost (Glass)',
    tokens: [
      { name: '--color-frost', var: 'var(--color-frost)' },
      { name: '--color-frost-border', var: 'var(--color-frost-border)' },
    ],
  },
  {
    label: 'Banking Context',
    tokens: [
      { name: '--color-ctx-banking-bg', var: 'var(--color-ctx-banking-bg)' },
      { name: '--color-ctx-banking-surface', var: 'var(--color-ctx-banking-surface)' },
      { name: '--color-ctx-banking-text', var: 'var(--color-ctx-banking-text)' },
    ],
  },
];

function Swatch({ name, cssVar }: { name: string; cssVar: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0' }}>
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 'var(--radius-md)',
          background: cssVar,
          border: '1px solid var(--color-border)',
          flexShrink: 0,
        }}
      />
      <div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--color-text)' }}>
          {name}
        </div>
      </div>
    </div>
  );
}

function ColorPalette() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32, maxWidth: 600 }}>
      {colorGroups.map((group) => (
        <div key={group.label}>
          <h3
            style={{
              fontSize: 'var(--font-size-sm)',
              fontWeight: 'var(--font-weight-semibold)' as unknown as number,
              color: 'var(--color-text-secondary)',
              textTransform: 'uppercase',
              letterSpacing: 'var(--letter-spacing-wider)',
              marginBottom: 8,
              borderBottom: '1px solid var(--color-border)',
              paddingBottom: 4,
            }}
          >
            {group.label}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {group.tokens.map((t) => (
              <Swatch key={t.name} name={t.name} cssVar={t.var} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const meta: Meta = {
  title: 'Tokens/Colors',
  component: ColorPalette,
};

export default meta;

type Story = StoryObj;

export const Palette: Story = {};
