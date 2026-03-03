import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { radii } from '../tokens/radii.js';

const radiusDemos = [
  { name: '--radius-sm', css: 'var(--radius-sm)', label: 'Small (10px)' },
  { name: '--radius-md', css: 'var(--radius-md)', label: 'Medium (16px)' },
  { name: '--radius-lg', css: 'var(--radius-lg)', label: 'Large (24px)' },
  { name: '--radius-xl', css: 'var(--radius-xl)', label: 'XL (32px)' },
  { name: '--radius-full', css: 'var(--radius-full)', label: 'Full (pill)' },
];

const organicDemos = [
  { name: '--radius-organic-sm', css: 'var(--radius-organic-sm)', label: 'Organic Small' },
  { name: '--radius-organic-md', css: 'var(--radius-organic-md)', label: 'Organic Medium' },
  { name: '--radius-organic-lg', css: 'var(--radius-organic-lg)', label: 'Organic Large' },
  { name: '--radius-organic-xl', css: 'var(--radius-organic-xl)', label: 'Organic XL' },
];

function RadiusBox({ label, cssRadius, name }: { label: string; cssRadius: string; name: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '8px 0' }}>
      <div
        style={{
          width: 80,
          height: 80,
          borderRadius: cssRadius,
          background: 'var(--color-primary)',
          flexShrink: 0,
        }}
      />
      <div>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text)' }}>{label}</div>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: 'var(--color-text-tertiary)',
          }}
        >
          {name}
        </div>
      </div>
    </div>
  );
}

function RadiiShowcase() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 40, maxWidth: 500 }}>
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
          Standard Radii
        </h3>
        {radiusDemos.map((r) => (
          <RadiusBox key={r.name} label={r.label} cssRadius={r.css} name={r.name} />
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
          Organic Radii (Tumbled Sea Glass)
        </h3>
        <p
          style={{
            fontSize: 13,
            color: 'var(--color-text-tertiary)',
            marginBottom: 12,
          }}
        >
          Asymmetric corners create a hand-shaped, natural feel.
        </p>
        {organicDemos.map((r) => (
          <RadiusBox key={r.name} label={r.label} cssRadius={r.css} name={r.name} />
        ))}
      </div>
    </div>
  );
}

const meta: Meta = {
  title: 'Tokens/Radii',
  component: RadiiShowcase,
};

export default meta;

type Story = StoryObj;

export const SeaGlass: Story = {};
