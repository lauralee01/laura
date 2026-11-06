import Link from 'next/link';
import type { ReactNode } from 'react';
import { BrandLockup } from '@/components/BrandLockup';

type Props = {
  title: string;
  updated: string;
  children: ReactNode;
};

export function LegalPageShell({ title, updated, children }: Props) {
  return (
    <main className="mx-auto min-h-[100dvh] max-w-3xl px-6 py-12 text-ink md:py-16">
      <header className="mb-10 border-b border-border-subtle pb-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-ink-muted transition hover:text-ink"
        >
          <span aria-hidden className="text-sm">
            ←
          </span>
          <BrandLockup size="sm" />
        </Link>
        <h1 className="mt-8 text-3xl font-semibold tracking-tight text-ink md:text-4xl">
          {title}
        </h1>
        <p className="mt-3 text-sm text-ink-muted">{updated}</p>
      </header>
      <div className="legal-prose space-y-8 text-base leading-relaxed text-ink">
        {children}
      </div>
    </main>
  );
}

export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-2 text-xl font-semibold tracking-tight text-ink">
        {title}
      </h2>
      <div className="space-y-3 text-ink-muted [&_strong]:font-semibold [&_strong]:text-ink [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6 [&_li]:text-ink-muted">
        {children}
      </div>
    </section>
  );
}
