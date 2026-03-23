import { redirect } from 'next/navigation';

/** Old URL: Google connect now lives on the main chat screen. */
export default function ConnectGoogleRedirectPage() {
  redirect('/');
}
