'use client';

import { useId } from 'react';

/** Concave 4-point sparkle (Material-style silhouette) — not a circle/globe. */
const SPARKLE_PATH =
  'M12 0L11.5 4.5L8 5L11.5 5.5L12 10L12.5 5.5L16 5L12.5 4.5L12 0Z';

/**
 * Shiny multicolour sparkle mark + small accents (AI / “magic” vibe).
 */
export function LauraMark({ className }: { className?: string }) {
  const uid = useId().replace(/:/g, '');
  const mainGrad = `lm-main-${uid}`;
  const shineGrad = `lm-shine-${uid}`;
  const miniGold = `lm-gold-${uid}`;
  const miniCyan = `lm-cyan-${uid}`;
  const miniPink = `lm-pink-${uid}`;

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
          id={mainGrad}
          x1="2"
          y1="2"
          x2="38"
          y2="38"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#a855f7" />
          <stop offset="0.15" stopColor="#d946ef" />
          <stop offset="0.32" stopColor="#f472b6" />
          <stop offset="0.48" stopColor="#fb7185" />
          <stop offset="0.62" stopColor="#22d3ee" />
          <stop offset="0.78" stopColor="#34d399" />
          <stop offset="0.9" stopColor="#fbbf24" />
          <stop offset="1" stopColor="#fb923c" />
        </linearGradient>

        <linearGradient id={shineGrad} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.75" />
          <stop offset="28%" stopColor="#ffffff" stopOpacity="0.15" />
          <stop offset="55%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="100%" stopColor="#fef08a" stopOpacity="0.35" />
        </linearGradient>

        <linearGradient id={miniGold} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#fef08a" />
          <stop offset="0.5" stopColor="#fbbf24" />
          <stop offset="1" stopColor="#f59e0b" />
        </linearGradient>
        <linearGradient id={miniCyan} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#a5f3fc" />
          <stop offset="0.5" stopColor="#22d3ee" />
          <stop offset="1" stopColor="#0284c7" />
        </linearGradient>
        <linearGradient id={miniPink} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#fbcfe8" />
          <stop offset="0.45" stopColor="#f472b6" />
          <stop offset="1" stopColor="#db2777" />
        </linearGradient>
      </defs>

      <g transform="translate(20 20) scale(2.1) translate(-12 -5)">
        <path d={SPARKLE_PATH} fill={`url(#${mainGrad})`} />
        <path d={SPARKLE_PATH} fill={`url(#${shineGrad})`} opacity={0.85} />
        <path
          d={SPARKLE_PATH}
          fill="none"
          stroke="white"
          strokeOpacity={0.35}
          strokeWidth={0.4}
        />
      </g>

      <g transform="translate(7 9) scale(0.42) translate(-12 -5)">
        <path d={SPARKLE_PATH} fill={`url(#${miniGold})`} />
        <path d={SPARKLE_PATH} fill="url(#shineGrad)" opacity={0.5} />
      </g>
      <g transform="translate(33 10) scale(0.38) translate(-12 -5)">
        <path
          d={SPARKLE_PATH}
          fill={`url(#${miniCyan})`}
          stroke="#e0f2fe"
          strokeWidth={0.35}
        />
        <path d={SPARKLE_PATH} fill="url(#shineGrad)" opacity={0.45} />
      </g>
      <g transform="translate(21 31) scale(0.36) translate(-12 -5)">
        <path d={SPARKLE_PATH} fill={`url(#${miniPink})`} />
        <path d={SPARKLE_PATH} fill="url(#shineGrad)" opacity={0.5} />
      </g>
    </svg>
  );
}
