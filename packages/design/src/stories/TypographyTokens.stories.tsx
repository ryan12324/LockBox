import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';

const sizes = [
  { name: '3xl', css: 'var(--font-size-3xl)', px: '30px' },
  { name: '2xl', css: 'var(--font-size-2xl)', px: '24px' },
  { name: 'xl', css: 'var(--font-size-xl)', px: '20px' },
  { name: 'lg', css: 'var(--font-size-lg)', px: '18px' },
  { name: 'base', css: 'var(--font-size-base)', px: '16px' },
  { name: 'sm', css: 'var(--font-size-sm)', px: '14px' },
  { name: 'xs', css: 'var(--font-size-xs)', px: '12px' },
];

const weights = [
  { name: 'Light', value: 300 },
  { name: 'Normal', value: 400 },
  { name: 'Medium', value: 500 },
  { name: 'Semibold', value: 600 },
  { name: 'Bold', value: 700 },
];

function TypographyShowcase() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 48, maxWidth: 700 }}>
      <div>
        <h3
          style={{
            fontSize: 'var(--font-size-sm)',
            fontWeight: 600,
            color: 'var(--color-text-secondary)',
            textTransform: 'uppercase',
            letterSpacing: 'var(--letter-spacing-wider)',
            marginBottom: 16,
          }}
        >
          Type Scale
        </h3>
        {sizes.map((s) => (
          <div
            key={s.name}
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 16,
              padding: '8px 0',
              borderBottom: '1px solid var(--color-border)',
            }}
          >
            <span
              style={{
                width: 60,
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: 'var(--color-text-tertiary)',
                flexShrink: 0,
              }}
            >
              {s.px}
            </span>
            <span style={{ fontSize: s.css, color: 'var(--color-text)' }}>
              The ghost in the vault
            </span>
          </div>
        ))}
      </div>

      <div>
        <h3
          style={{
            fontSize: 'var(--font-size-sm)',
            fontWeight: 600,
            color: 'var(--color-text-secondary)',
            textTransform: 'uppercase',
            letterSpacing: 'var(--letter-spacing-wider)',
            marginBottom: 16,
          }}
        >
          Font Weights
        </h3>
        {weights.map((w) => (
          <div
            key={w.name}
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 16,
              padding: '8px 0',
              borderBottom: '1px solid var(--color-border)',
            }}
          >
            <span
              style={{
                width: 80,
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: 'var(--color-text-tertiary)',
                flexShrink: 0,
              }}
            >
              {w.value}
            </span>
            <span
              style={{
                fontSize: 'var(--font-size-lg)',
                fontWeight: w.value,
                color: 'var(--color-text)',
              }}
            >
              {w.name} — Aura & Architecture
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const meta: Meta = {
  title: 'Tokens/Typography',
  component: TypographyShowcase,
};

export default meta;

type Story = StoryObj;

export const Scale: Story = {};
