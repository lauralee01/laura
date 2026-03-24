import { Suspense } from 'react';
import { Chat } from '@/components/Chat';
import { GoogleOAuthReturnToast } from '@/components/GoogleOAuthReturnToast';

export default function Home() {
  return (
    <>
      <Suspense fallback={null}>
        <GoogleOAuthReturnToast />
      </Suspense>
      <Chat />
    </>
  );
}
