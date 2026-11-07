'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Guards against the known Radix UI bug where document.body is left with
 * pointer-events: none after nested dialogs, dropdowns, or unmounted modals close.
 */
export function PointerEventsGuard() {
  const pathname = usePathname();

  useEffect(() => {
    // Clear any stuck pointer-events on route change
    if (typeof document !== 'undefined') {
      document.body.style.pointerEvents = '';
    }
  }, [pathname]);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const cleanupStuckPointerEvents = () => {
      const activeModal = document.querySelector('[role="dialog"], [role="alertdialog"], [data-radix-portal]');
      if (!activeModal && document.body.style.pointerEvents === 'none') {
        document.body.style.pointerEvents = '';
      }
    };

    const observer = new MutationObserver(cleanupStuckPointerEvents);

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['style'],
    });

    // Also run periodic check as safety net
    const interval = setInterval(cleanupStuckPointerEvents, 500);

    return () => {
      observer.disconnect();
      clearInterval(interval);
    };
  }, []);

  return null;
}
