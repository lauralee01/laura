'use client';

import { Outfit } from 'next/font/google';

const wordmark = Outfit({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  display: 'swap',
});

const sizeMap = {
  sm: 'text-base',
  md: 'text-[1.35rem] leading-none',
  lg: 'text-xl',
  /** Empty-state hero — brand must dominate the first viewport. */
  hero: 'text-5xl leading-none md:text-6xl',
} as const;

type Size = keyof typeof sizeMap;

/** “laura” wordmark only (no icon). */
export function BrandLockup({
  size = 'md',
  className,
}: {
  size?: Size;
  className?: string;
}) {
  const textSize = sizeMap[size];
  return (
    <div
      className={`flex items-center text-ink ${className ?? ''}`}
    >
      <span
        className={`${wordmark.className} ${textSize} tracking-tight lowercase text-ink`}
      >
        laura
      </span>
    </div>
  );
}
