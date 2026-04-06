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
      className={`flex items-center text-zinc-900 dark:text-white ${className ?? ''}`}
    >
      <span
        className={`${wordmark.className} ${textSize} tracking-tight lowercase`}
      >
        laura
      </span>
    </div>
  );
}
