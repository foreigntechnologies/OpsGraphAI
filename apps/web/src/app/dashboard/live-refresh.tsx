'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export function LiveRefresh({ intervalSeconds }: { intervalSeconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => { if (document.visibilityState === 'visible') router.refresh(); }, intervalSeconds * 1000);
    return () => clearInterval(timer);
  }, [intervalSeconds, router]);
  return null;
}
