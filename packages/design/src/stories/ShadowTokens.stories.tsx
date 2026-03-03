import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';

const shadows = [
  { name: '--shadow-sm', label: 'Small' },
  { name: '--shadow-md', label: 'Medium' },
  { name: '--shadow-lg', label: 'Large' },
  { name: '--shadow-aura', label: 'Aura Glow' },
];

function ShadowShowcase() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32, maxWidth: 500 }}>
      <h3
        style={{
          fontSize: 'var(--font-size-sm)',
          fontWeight: 600,
          color: 'var(--color-text-secondary)',
          textTransform: 'uppercase',
          letterSpacing: 'var(--letter-spacing-wider)',
        }}
      >
        Shadows (Warm-Tinted)
      </h3>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {shadows.map((s) => (
          <div
            key={s.name}
            style={{
              padding: 24,
              borderRadius: 'var(--radius-lg)',
              background: 'var(--color-surface-raised)',
              boxShadow: `var(${s.name})`,
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontSize: 'var(--font-size-sm)',
                fontWeight: 500,
                color: 'var(--color-text)',
                marginBottom: 4,
              }}
            >
              {s.label}
            </div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: 'var(--color-text-tertiary)',
              }}
            >
              {s.name}
            </div>
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
            marginBottom: 12,
          }}
        >
          Frost (Warm Frosted Glass)
        </h3>
        <div
          style={{
            position: 'relative',
            height: 200,
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
            background:
              'linear-gradient(135deg, var(--color-aura) 0%, var(--color-primary) 50%, var(--color-warning) 100%)',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 20,
              borderRadius: 'var(--radius-md)',
              background: 'var(--color-frost)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid var(--color-frost-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-text)',
              fontSize: 'var(--font-size-sm)',
              fontWeight: 500,
            }}
          >
            Warm frosted glass panel
          </div>
        </div>
      </div>
    </div>
  );
}

const meta: Meta = {
  title: 'Tokens/Shadows & Frost',
  component: ShadowShowcase,
};

export default meta;

type Story = StoryObj;

export const Elevation: Story = {};
