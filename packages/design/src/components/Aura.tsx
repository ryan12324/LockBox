import React from 'react';

export type AuraState = 'idle' | 'active' | 'thinking' | 'hidden';
export type AuraPosition = 'corner' | 'center' | 'inline';

export interface AuraProps extends React.HTMLAttributes<HTMLDivElement> {
  state?: AuraState;
  position?: AuraPosition;
}

const stateClassMap: Record<AuraState, string> = {
  idle: 'aura-idle',
  active: 'aura-active',
  thinking: 'aura-thinking',
  hidden: '',
};

const positionSizes: Record<AuraPosition, { width: number; height: number }> = {
  corner: { width: 60, height: 60 },
  center: { width: 200, height: 200 },
  inline: { width: 40, height: 40 },
};

const positionStyles: Record<AuraPosition, React.CSSProperties> = {
  corner: {
    position: 'absolute',
    bottom: 12,
    right: 12,
  },
  center: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
  },
  inline: {
    position: 'relative',
    display: 'inline-block',
    verticalAlign: 'middle',
  },
};

export function Aura({
  state = 'idle',
  position = 'corner',
  style,
  className,
  ...rest
}: AuraProps) {
  const size = positionSizes[position];
  const animClass = stateClassMap[state];

  const baseStyle: React.CSSProperties = {
    ...positionStyles[position],
    width: size.width,
    height: size.height,
    borderRadius: '50%',
    background: `radial-gradient(circle, var(--color-aura-glow) 0%, var(--color-aura-dim) 50%, transparent 70%)`,
    opacity: state === 'hidden' ? 0 : undefined,
    transition: `opacity var(--duration-slow) var(--ease-smooth)`,
    pointerEvents: 'none',
  };

  const classes = [animClass, className].filter(Boolean).join(' ') || undefined;

  return <div {...rest} className={classes} style={{ ...baseStyle, ...style }} />;
}
