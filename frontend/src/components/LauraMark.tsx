'use client';

import { useId } from 'react';

/**
 * Colourful glassy orb inside a soft rounded “tile” — reads as a sphere in a box,
 * not a flat sparkle.
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
        {/* Gradient frame — “box” around the orb */}
        <linearGradient
          id={frameGrad}
          x1="4"
          y1="4"
          x2="36"
          y2="36"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#fbbf24" />
          <stop offset="0.22" stopColor="#fb7185" />
          <stop offset="0.45" stopColor="#e879f9" />
          <stop offset="0.62" stopColor="#818cf8" />
          <stop offset="0.82" stopColor="#22d3ee" />
          <stop offset="1" stopColor="#34d399" />
        </linearGradient>

        <radialGradient
          id={sphereGrad}
          cx="32%"
          cy="30%"
          r="72%"
          gradientUnits="objectBoundingBox"
        >
          <stop offset="0%" stopColor="#fffbeb" stopOpacity="0.98" />
          <stop offset="0.08" stopColor="#fef08a" />
          <stop offset="0.22" stopColor="#fda4af" />
          <stop offset="0.38" stopColor="#e879f9" />
          <stop offset="0.55" stopColor="#a78bfa" />
          <stop offset="0.72" stopColor="#6366f1" />
          <stop offset="0.88" stopColor="#0ea5e9" />
          <stop offset="1" stopColor="#164e63" />
        </radialGradient>

        <radialGradient
          id={specGrad}
          cx="28%"
          cy="26%"
          r="42%"
          gradientUnits="objectBoundingBox"
        >
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="0.35" stopColor="#ffffff" stopOpacity="0.35" />
          <stop offset="0.7" stopColor="#ffffff" stopOpacity="0.05" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>

        <linearGradient id={rimGrad} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.08" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.35" />
        </linearGradient>
      </defs>

      {/* Rounded square “tile” */}
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

      {/* Main sphere */}
      <circle cx="20" cy="20" r="12.25" fill={`url(#${sphereGrad})`} />
      <circle cx="20" cy="20" r="12.25" fill={`url(#${specGrad})`} />

      {/* Soft rim light */}
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
