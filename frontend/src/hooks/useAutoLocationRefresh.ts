'use client';

import { useEffect } from 'react';
import { refreshLocationIfPermitted } from '@/lib/browser-location';

/**
 * Once the session is ready, quietly refresh the stored city if (and only if)
 * the browser already granted location access earlier. Never prompts.
 */
export function useAutoLocationRefresh(sessionReady: boolean): void {
  useEffect(() => {
    if (!sessionReady) {
      return;
    }
    void refreshLocationIfPermitted();
  }, [sessionReady]);
}
