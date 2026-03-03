import React, { useEffect, useState } from 'react';

interface HealthScoreProps {
  score: number;
  size?: number;
  label?: string;
}

export default function HealthScore({
  score,
  size = 160,
  label = 'Health Score',
}: HealthScoreProps) {
  const [offset, setOffset] = useState(0);

  const strokeWidth = Math.max(8, size * 0.08);
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;

  useEffect(() => {
    // Animate to score on mount
    const progressOffset = circumference - (score / 100) * circumference;
    // Small delay to ensure initial render sets circumference before transition
    const timer = setTimeout(() => {
      setOffset(progressOffset);
    }, 50);
    return () => clearTimeout(timer);
  }, [score, circumference]);

  // Before animation starts, show 0 progress
  const [initialRender, setInitialRender] = useState(true);
  useEffect(() => {
    setInitialRender(false);
  }, []);

  const currentOffset = initialRender ? circumference : offset;

  let colorClass = 'text-[var(--color-success)]'; // 90-100
  if (score < 40) {
    colorClass = 'text-[var(--color-error)]';
  } else if (score < 70) {
    colorClass = 'text-[var(--color-warning)]';
  } else if (score < 90) {
    colorClass = 'text-[var(--color-primary)]';
  }

  return (
    <div
      className="flex flex-col items-center justify-center relative"
      style={{ width: size, height: size }}
    >
      <svg
        className="transform -rotate-90 w-full h-full drop-shadow-lg"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
      >
        {/* Background ring */}
        <circle
          className="text-[var(--color-border)] stroke-current"
          strokeWidth={strokeWidth}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
        />
        {/* Progress ring */}
        <circle
          className={`${colorClass} stroke-current transition-all duration-1000 ease-out`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          strokeDasharray={circumference}
          strokeDashoffset={currentOffset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-[var(--color-text)]">
        <span className="text-4xl font-bold tracking-tight">{score}</span>
        {label && (
          <span className="text-xs text-[var(--color-text-tertiary)] mt-1 uppercase tracking-widest">
            {label}
          </span>
        )}
      </div>
    </div>
  );
}
