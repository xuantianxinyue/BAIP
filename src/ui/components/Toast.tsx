'use client';

import { useEffect } from 'react';

/** A short message at the bottom of the window that disappears by itself. */
export function Toast({ message, onDone, ms = 4000 }: { message: string; onDone: () => void; ms?: number }) {
  useEffect(() => {
    const t = setTimeout(onDone, ms);
    return () => clearTimeout(t);
  }, [message, onDone, ms]);
  return (
    <div data-testid="import-toast" role="status" className="pointer-events-none fixed bottom-48 left-1/2 z-10 -translate-x-1/2 rounded bg-neutral-900/90 px-4 py-2 text-xs text-white shadow-lg">
      {message}
    </div>
  );
}
