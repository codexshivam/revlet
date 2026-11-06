'use client';

import { useEffect } from 'react';
import { stripScripts, containsMaliciousScript } from '@/lib/security/sanitize';
import { toast } from '@/hooks/use-toast';

/**
 * DevToolsGuard Component
 * - Displays a high-visibility Self-XSS warning banner in DevTools console.
 * - Suppresses informational console logging in production to prevent data leakage.
 * - Intercepts paste events on inputs to block and neutralize script injection attempts in real-time.
 */
export function DevToolsGuard() {
  useEffect(() => {
    // 1. Prominent Self-XSS Console Warning Banner
    const bannerStyle = 'color: #ef4444; font-size: 24px; font-weight: 900; -webkit-text-stroke: 1px black;';
    const bodyStyle = 'color: #e2e8f0; font-size: 14px; font-family: monospace; background: #0f172a; padding: 8px 12px; border-radius: 6px; line-height: 1.5;';

    console.log(
      '%c⚠️ ATTENTION / STOP! ⚠️',
      bannerStyle
    );
    console.log(
      '%cThis is a browser console intended strictly for authorized development and debugging.\n' +
      'If someone instructed you to copy and paste any script or command here to unlock features, claim rewards, or bypass permissions, IT IS A SCAM (Self-XSS attack) that will compromise your account and security.\n\n' +
      'Revlet Platform has active tamper-detection and Content Security Policies in place.',
      bodyStyle
    );

    // 2. Production Console Hardening: suppress verbosity to avoid leaking component state
    if (process.env.NODE_ENV === 'production') {
      const noop = () => {};
      console.log = noop;
      console.info = noop;
      console.debug = noop;
      console.dir = noop;
      console.table = noop;
    }

    // 3. Real-Time Paste Interceptor for App Input Fields
    const handlePaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
      if (!isInput) return;

      const pastedText = e.clipboardData?.getData('text/plain') || '';
      if (!pastedText) return;

      // If malicious script tags or executable patterns are detected in the pasted text:
      if (containsMaliciousScript(pastedText)) {
        e.preventDefault();

        // Strip the script payload and insert sanitized text
        const cleanedText = stripScripts(pastedText);

        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
          const start = target.selectionStart || 0;
          const end = target.selectionEnd || 0;
          const currentVal = target.value;
          const newVal = currentVal.slice(0, start) + cleanedText + currentVal.slice(end);
          
          target.value = newVal;
          target.dispatchEvent(new Event('input', { bubbles: true }));
          target.dispatchEvent(new Event('change', { bubbles: true }));
          target.setSelectionRange(start + cleanedText.length, start + cleanedText.length);
        }

        toast({
          variant: 'destructive',
          title: 'Script Injection Blocked',
          description: 'Executable script tags and dangerous protocols were automatically stripped from your input.',
        });
      }
    };

    // 4. Prevent drag-and-drop of foreign script files into text inputs
    const handleDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) {
        const target = e.target as HTMLElement | null;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
          e.preventDefault();
        }
      }
    };

    window.addEventListener('paste', handlePaste, true);
    window.addEventListener('dragover', handleDragOver, true);

    return () => {
      window.removeEventListener('paste', handlePaste, true);
      window.removeEventListener('dragover', handleDragOver, true);
    };
  }, []);

  return null;
}
