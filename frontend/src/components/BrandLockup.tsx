'use client';

import { Outfit } from 'next/font/google';
import { LauraMark } from '@/components/LauraMark';

const wordmark = Outfit({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  display: 'swap',
});

const sizeMap = {
  sm: { icon: 'h-6 w-6', text: 'text-base' },
  md: { icon: 'h-8 w-8', text: 'text-[1.35rem] leading-none' },
  lg: { icon: 'h-9 w-9', text: 'text-xl' },
} as const;

type Size = keyof typeof sizeMap;

/** Mark + “laura” wordmark. Icon + text share colour (dark / white). */
function LauraWordmark({
  className,
  textSize,
}: {
  className?: string;
  textSize: string;
}) {
  return (
    <span
      className={`${wordmark.className} ${textSize} ${className ?? ''} tracking-tight lowercase`}
    >
      laura
    </span>
  );
}

export function BrandLockup({
  size = 'md',
  className,
}: {
  size?: Size;
  className?: string;
}) {
  const s = sizeMap[size];
  return (
    <div
      className={`flex items-center text-zinc-900 dark:text-white ${className ?? ''}`}
    >
      <LauraMark className={`shrink-0 ${s.icon}`} aria-hidden />
      <LauraWordmark textSize={s.text} />
    </div>
  );
}
