import type { Metadata } from 'next';
import { ConversationalAuth } from '@/components/auth/ConversationalAuth';

/**
 * TEMPORARY route for previewing the conversational sign-in design.
 * UI only — not wired to any backend. Remove once real auth exists.
 */
export const metadata: Metadata = {
  title: 'Sign in — laura',
  robots: { index: false, follow: false },
};

export default function AuthPreviewPage() {
  return <ConversationalAuth />;
}
