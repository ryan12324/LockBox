import React from 'react';

export type AuraState = 'idle' | 'active' | 'thinking' | 'hidden';
export type AuraPosition = 'corner' | 'center' | 'inline' | 'sidebar';

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

const positionSizes: Record<AuraPosition, { width: number | string; height: number | string }> = {
  corner: { width: 80, height: 80 },
  center: { width: 240, height: 240 },
  inline: { width: 40, height: 40 },
  sidebar: { width: 80, height: '100%' },
};

const positionStyles: Record<AuraPosition, React.CSSProperties> = {
  corner: {
    position: 'absolute',
    bottom: 16,
    right: 16,
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
  sidebar: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
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

  const isSidebar = position === 'sidebar';

  const baseStyle: React.CSSProperties = {
    ...positionStyles[position],
    width: size.width,
    height: size.height,
    borderRadius: isSidebar ? 0 : '50%',
    background: isSidebar
      ? `linear-gradient(to right, var(--color-aura-glow) 0%, var(--color-aura-dim) 40%, transparent 100%)`
      : `radial-gradient(circle, var(--color-aura-glow) 0%, var(--color-aura-dim) 50%, transparent 70%)`,
    opacity: state === 'hidden' ? 0 : undefined,
    transition: `opacity var(--duration-slow) var(--ease-smooth)`,
    pointerEvents: 'none',
    zIndex: 0,
  };

  const classes = [animClass, className].filter(Boolean).join(' ') || undefined;

  return <div {...rest} className={classes} style={{ ...baseStyle, ...style }} />;
}
