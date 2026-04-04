'use client';

import { useId } from 'react';

/**
 * Monochrome “fusion” mark: white highlight melting into deep black inside a rounded tile,
 * frame gradient white → black for contrast on any background.
 */
export function LauraMark({ className }: { className?: string }) {
  const uid = useId().replace(/:/g, '');
  const frameGrad = `lm-frame-${uid}`;
  const sphereGrad = `lm-sphere-${uid}`;
  const specGrad = `lm-spec-${uid}`;
  const rimGrad = `lm-rim-${uid}`;

  return (
    <svg
      className={className}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient
          id={frameGrad}
          x1="4"
          y1="4"
          x2="36"
          y2="36"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#ffffff" />
          <stop offset="0.28" stopColor="#d4d4d8" />
          <stop offset="0.52" stopColor="#71717a" />
          <stop offset="0.78" stopColor="#27272a" />
          <stop offset="1" stopColor="#09090b" />
        </linearGradient>

        <radialGradient
          id={sphereGrad}
          cx="32%"
          cy="28%"
          r="78%"
          gradientUnits="objectBoundingBox"
        >
          <stop offset="0%" stopColor="#fafafa" />
          <stop offset="0.12" stopColor="#e4e4e7" />
          <stop offset="0.32" stopColor="#a1a1aa" />
          <stop offset="0.52" stopColor="#52525b" />
          <stop offset="0.72" stopColor="#27272a" />
          <stop offset="0.9" stopColor="#18181b" />
          <stop offset="1" stopColor="#09090b" />
        </radialGradient>

        <radialGradient
          id={specGrad}
          cx="26%"
          cy="24%"
          r="38%"
          gradientUnits="objectBoundingBox"
        >
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.92" />
          <stop offset="0.4" stopColor="#ffffff" stopOpacity="0.22" />
          <stop offset="0.75" stopColor="#ffffff" stopOpacity="0.03" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>

        <linearGradient id={rimGrad} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#ffffff" stopOpacity="0.45" />
          <stop offset="0.45" stopColor="#ffffff" stopOpacity="0.06" />
          <stop offset="1" stopColor="#a1a1aa" stopOpacity="0.5" />
        </linearGradient>
      </defs>

      <rect
        x="3.5"
        y="3.5"
        width="33"
        height="33"
        rx="9"
        stroke={`url(#${frameGrad})`}
        strokeWidth="2.25"
        fill="currentColor"
        fillOpacity="0.06"
      />

      <circle cx="20" cy="20" r="12.25" fill={`url(#${sphereGrad})`} />
      <circle cx="20" cy="20" r="12.25" fill={`url(#${specGrad})`} />

      <circle
        cx="20"
        cy="20"
        r="12.25"
        fill="none"
        stroke={`url(#${rimGrad})`}
        strokeWidth="0.85"
      />
    </svg>
  );
}
