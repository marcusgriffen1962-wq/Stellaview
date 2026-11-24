'use client';

import { useId } from 'react';

interface SparklineProps {
  values: number[];
  color?: string;
  height?: number;
  grid?: boolean;
  className?: string;
}

export default function Sparkline({
  values,
  color = '#81d6ed',
  height = 48,
  grid = false,
  className = '',
}: SparklineProps) {
  const gradientId = useId().replace(/:/g, '');
  const safeValues = values.length > 1 ? values : [0, 0];
  const min = Math.min(...safeValues);
  const max = Math.max(...safeValues);
  const range = max - min || 1;
  const points = safeValues.map((value, index) => {
    const x = (index / (safeValues.length - 1)) * 100;
    const y = 94 - ((value - min) / range) * 82;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const linePoints = points.join(' ');
  const areaPoints = `0,100 ${linePoints} 100,100`;

  return (
    <svg
      className={className}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      style={{ width: '100%', height }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.34" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {grid && (
        <g stroke="rgba(129,214,237,0.11)" strokeWidth="0.4">
          <line x1="0" y1="25" x2="100" y2="25" />
          <line x1="0" y1="50" x2="100" y2="50" />
          <line x1="0" y1="75" x2="100" y2="75" />
        </g>
      )}
      <polygon points={areaPoints} fill={`url(#${gradientId})`} />
      <polyline
        points={linePoints}
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
