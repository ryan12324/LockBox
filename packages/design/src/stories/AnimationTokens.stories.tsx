import React, { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';

function AuraDemo() {
  const [state, setState] = useState<'idle' | 'active' | 'thinking'>('idle');

  const auraClass = {
    idle: 'aura-idle',
    active: 'aura-active',
    thinking: 'aura-thinking',
  }[state];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32, maxWidth: 600 }}>
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
          Aura States
        </h3>

        <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
          {(['idle', 'active', 'thinking'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setState(s)}
              style={{
                padding: '8px 16px',
                borderRadius: 'var(--radius-full)',
                border:
                  state === s ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                background: state === s ? 'var(--color-primary)' : 'var(--color-surface)',
                color: state === s ? 'var(--color-primary-fg)' : 'var(--color-text)',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 500,
                textTransform: 'capitalize',
              }}
            >
              {s}
            </button>
          ))}
        </div>

        <div
          style={{
            position: 'relative',
            width: 200,
            height: 200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            className={auraClass}
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              background:
                'radial-gradient(circle, var(--color-aura-glow) 0%, var(--color-aura-dim) 50%, transparent 70%)',
            }}
          />
          <div
            style={{
              position: 'relative',
              width: 48,
              height: 48,
              borderRadius: 'var(--radius-lg)',
              background: 'var(--color-surface-raised)',
              border: '1px solid var(--color-border)',
              boxShadow: 'var(--shadow-md)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
            }}
          >
            🔐
          </div>
        </div>
      </div>
    </div>
  );
}

function SquishDemo() {
  const [squishing, setSquishing] = useState(false);

  return (
    <div style={{ maxWidth: 400 }}>
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
        Squish Snap (Form Fill)
      </h3>
      <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', marginBottom: 16 }}>
        Click "Fill" to see the input field bulge and snap back.
      </p>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          type="text"
          readOnly
          value={squishing ? 'hunter2' : ''}
          placeholder="Password"
          className={squishing ? 'squish' : ''}
          style={{
            flex: 1,
            padding: '10px 14px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border)',
            background: 'var(--color-surface)',
            color: 'var(--color-text)',
            fontFamily: 'var(--font-mono)',
            fontSize: 14,
            outline: 'none',
          }}
        />
        <button
          onClick={() => {
            setSquishing(false);
            requestAnimationFrame(() => setSquishing(true));
          }}
          style={{
            padding: '10px 20px',
            borderRadius: 'var(--radius-md)',
            border: 'none',
            background: 'var(--color-primary)',
            color: 'var(--color-primary-fg)',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          Fill
        </button>
      </div>
    </div>
  );
}

function VariableTypeDemo() {
  const [typing, setTyping] = useState<'none' | 'searching' | 'found'>('none');

  return (
    <div style={{ maxWidth: 500 }}>
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
        Variable Typography
      </h3>
      <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', marginBottom: 16 }}>
        Font weight fluctuates: thins during search, boldens on match.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['none', 'searching', 'found'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setTyping(s)}
            style={{
              padding: '6px 14px',
              borderRadius: 'var(--radius-full)',
              border:
                typing === s ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
              background: typing === s ? 'var(--color-primary)' : 'var(--color-surface)',
              color: typing === s ? 'var(--color-primary-fg)' : 'var(--color-text)',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 500,
              textTransform: 'capitalize',
            }}
          >
            {s === 'none' ? 'Static' : s}
          </button>
        ))}
      </div>

      <div
        className={
          typing === 'searching' ? 'type-searching' : typing === 'found' ? 'type-found' : ''
        }
        style={{
          fontSize: 'var(--font-size-xl)',
          color: 'var(--color-text)',
          padding: 16,
          borderRadius: 'var(--radius-lg)',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
        }}
      >
        Looking for your credentials...
      </div>
    </div>
  );
}

function AnimationShowcase() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 48 }}>
      <AuraDemo />
      <SquishDemo />
      <VariableTypeDemo />
    </div>
  );
}

const meta: Meta = {
  title: 'Tokens/Animations',
  component: AnimationShowcase,
};

export default meta;

type Story = StoryObj;

export const MicroInteractions: Story = {};
