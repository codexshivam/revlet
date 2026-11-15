'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { FirebaseApp, getApps } from 'firebase/app';
import { Analytics, getAnalytics, isSupported as isAnalyticsSupported, logEvent, setUserId, setUserProperties } from 'firebase/analytics';
import { FirebasePerformance, getPerformance, trace as createPerfTrace } from 'firebase/performance';
import { firebaseConfig } from './config';

let analyticsInstance: Analytics | null = null;
let performanceInstance: FirebasePerformance | null = null;
let listenersAttached = false;

export interface CrashReportMeta {
  fatal?: boolean;
  component?: string;
  digest?: string;
  userId?: string;
  orgId?: string;
  extra?: Record<string, unknown>;
}

/**
 * Initializes Firebase Analytics, Firebase Performance Monitoring, and global
 * Web Crashlytics/Exception listeners in browser environments.
 */
export async function initFirebaseTelemetry(app?: FirebaseApp): Promise<{
  analytics: Analytics | null;
  performance: FirebasePerformance | null;
}> {
  if (typeof window === 'undefined') {
    return { analytics: null, performance: null };
  }

  const targetApp = app || getApps()[0];
  if (!targetApp) {
    return { analytics: null, performance: null };
  }

  // 1. Initialize Firebase Performance Monitoring
  if (!performanceInstance) {
    try {
      performanceInstance = getPerformance(targetApp);
    } catch {
      // Ignore in unsupported environments (e.g. headless/SSR)
    }
  }

  // 2. Initialize Firebase Analytics
  if (!analyticsInstance) {
    try {
      const supported = await isAnalyticsSupported();
      if (supported) {
        analyticsInstance = getAnalytics(targetApp);
      }
    } catch {
      // Ignore if blocked by content blockers or unsupported browser
    }
  }

  // 3. Attach global unhandled error & promise rejection listeners (Crashlytics Web equivalent)
  if (!listenersAttached) {
    listenersAttached = true;

    window.addEventListener('error', (event) => {
      const err = event.error instanceof Error ? event.error : new Error(event.message || 'Unhandled window error');
      reportCrashException(err, {
        fatal: false,
        component: 'window.onerror',
        extra: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        },
      });
    });

    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason;
      const err =
        reason instanceof Error
          ? reason
          : new Error(typeof reason === 'string' ? reason : JSON.stringify(reason || 'Unhandled promise rejection'));
      reportCrashException(err, {
        fatal: false,
        component: 'window.onunhandledrejection',
      });
    });
  }

  return {
    analytics: analyticsInstance,
    performance: performanceInstance,
  };
}

/**
 * Logs a custom event to Firebase Analytics when available.
 */
export function trackAnalyticsEvent(
  eventName: string,
  eventParams?: Record<string, unknown>
): void {
  if (typeof window === 'undefined' || !analyticsInstance) return;
  try {
    logEvent(analyticsInstance, eventName, eventParams);
  } catch {
    // Non-fatal
  }
}

/**
 * Associates the current authenticated user with Firebase Analytics & Telemetry.
 */
export function setTelemetryUser(
  userId: string | null,
  properties?: Record<string, string>
): void {
  if (typeof window === 'undefined' || !analyticsInstance) return;
  try {
    setUserId(analyticsInstance, userId);
    if (properties) {
      setUserProperties(analyticsInstance, properties);
    }
  } catch {
    // Non-fatal
  }
}

/**
 * Reports an exception/crash to both Firebase Analytics (`exception` event) and
 * the Revlet Control Plane Crashlytics store (`/api/telemetry/crash`).
 */
export function reportCrashException(
  error: unknown,
  meta: CrashReportMeta = {}
): void {
  if (typeof window === 'undefined') return;

  const errObj =
    error instanceof Error
      ? error
      : new Error(typeof error === 'string' ? error : 'Unknown application error');

  const description = `${errObj.name || 'Error'}: ${errObj.message || 'Unknown'}`.slice(0, 150);
  const fatal = Boolean(meta.fatal);

  // 1. Log standard Firebase Analytics / Crashlytics exception event
  if (analyticsInstance) {
    try {
      logEvent(analyticsInstance, 'exception', {
        description,
        fatal,
        component: meta.component || 'unknown',
      });
    } catch {
      // Non-fatal
    }
  }

  // 2. Dispatch structured crash report to Firestore via /api/telemetry/crash
  const payload = {
    app: 'app.revlet.me',
    appId: firebaseConfig.appId,
    projectId: firebaseConfig.projectId,
    name: errObj.name || 'Error',
    message: (errObj.message || 'Unknown error').slice(0, 2000),
    stack: (errObj.stack || '').slice(0, 8000),
    digest: meta.digest || (errObj as Error & { digest?: string }).digest || null,
    fatal,
    component: meta.component || 'runtime',
    url: window.location.href,
    pathname: window.location.pathname,
    userAgent: navigator.userAgent,
    userId: meta.userId || null,
    orgId: meta.orgId || localStorage.getItem('revlet_active_org_id') || null,
    extra: meta.extra || null,
    timestamp: new Date().toISOString(),
  };

  try {
    const body = JSON.stringify(payload);
    if (typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon('/api/telemetry/crash', blob);
    } else {
      void fetch('/api/telemetry/crash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    // Never throw from crash reporter
  }
}

/**
 * Measures an asynchronous operation using a custom Firebase Performance Monitoring trace.
 */
export async function measurePerformanceTrace<T>(
  traceName: string,
  operation: () => Promise<T>,
  attributes?: Record<string, string>
): Promise<T> {
  if (typeof window === 'undefined' || !performanceInstance) {
    return operation();
  }

  let perfTrace: ReturnType<typeof createPerfTrace> | null = null;
  try {
    perfTrace = createPerfTrace(performanceInstance, traceName);
    if (attributes) {
      for (const [k, v] of Object.entries(attributes)) {
        perfTrace.putAttribute(k, String(v).slice(0, 100));
      }
    }
    perfTrace.start();
  } catch {
    perfTrace = null;
  }

  try {
    const result = await operation();
    perfTrace?.putAttribute('status', 'ok');
    return result;
  } catch (err) {
    perfTrace?.putAttribute('status', 'error');
    throw err;
  } finally {
    try {
      perfTrace?.stop();
    } catch {
      // Ignore trace stop errors
    }
  }
}

/**
 * React component that initializes Firebase Analytics, Performance Monitoring,
 * and Crashlytics listeners and tracks Next.js route changes.
 */
export function FirebaseTelemetryObserver({ app }: { app: FirebaseApp }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    void initFirebaseTelemetry(app);
  }, [app]);

  useEffect(() => {
    if (!pathname) return;
    let cancelled = false;

    void initFirebaseTelemetry(app).then(({ analytics }) => {
      if (cancelled || !analytics) return;
      try {
        const search = searchParams?.toString();
        const pagePath = search ? `${pathname}?${search}` : pathname;
        logEvent(analytics, 'page_view', {
          page_path: pagePath,
          page_location: window.location.href,
          page_title: document.title,
        });
      } catch {
        // Non-fatal
      }
    });

    return () => {
      cancelled = true;
    };
  }, [app, pathname, searchParams]);

  return null;
}
