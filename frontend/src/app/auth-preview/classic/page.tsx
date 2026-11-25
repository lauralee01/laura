import type { Metadata } from 'next';
import { AuthCard } from '@/components/auth/AuthCard';

/**
 * TEMPORARY comparison route for the classic sign-in layout.
 * UI only — remove along with /auth-preview once a direction is chosen.
 */
export const metadata: Metadata = {
  title: 'Sign in (classic) — laura',
  robots: { index: false, follow: false },
};

export default function AuthPreviewClassicPage() {
  return <AuthCard />;
}
