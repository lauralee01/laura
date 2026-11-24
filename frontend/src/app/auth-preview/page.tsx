import type { Metadata } from 'next';
import { AuthCard } from '@/components/auth/AuthCard';

/**
 * TEMPORARY route for previewing the sign in / sign up design.
 * UI only — not wired to any backend. Move/rename (e.g. /login) once auth
 * is built, and remove this route.
 */
export const metadata: Metadata = {
  title: 'Sign in — laura',
  robots: { index: false, follow: false },
};

export default function AuthPreviewPage() {
  return <AuthCard />;
}
