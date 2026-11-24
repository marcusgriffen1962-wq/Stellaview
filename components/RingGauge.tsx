'use client';

interface RingGaugeProps {
  value: number;
  color?: string;
  size?: number;
  label: string;
  detail?: string;
}

export default function RingGauge({
  value,
  color = '#81d6ed',
  size = 92,
  label,
  detail,
}: RingGaugeProps) {
  const clamped = Math.min(100, Math.max(0, value));
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div className="gauge-item">
      <svg viewBox="0 0 100 100" style={{ width: size, height: size }} aria-hidden="true">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="7" />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 50 50)"
          style={{ filter: `drop-shadow(0 0 6px ${color}66)`, transition: 'stroke-dashoffset 400ms ease' }}
        />
        <text
          x="50"
          y="54"
          textAnchor="middle"
          fill="#e9efff"
          fontFamily="var(--mono)"
          fontSize="19"
        >
          {Math.round(clamped)}
        </text>
      </svg>
      <div className="gauge-label">{label}</div>
      {detail && <div className="gauge-value">{detail}</div>}
    </div>
  );
}
