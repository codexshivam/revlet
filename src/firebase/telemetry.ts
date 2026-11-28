'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { FirebaseApp, getApps } from 'firebase/app';
import { Analytics, getAnalytics, isSupported as isAnalyticsSupported, logEvent, setUserId, setUserProperties } from 'firebase/analytics';
import { Crashlytics, getCrashlytics, recordError, breadcrumbs } from 'firebase/crashlytics';
import { FirebasePerformance, getPerformance, trace as createPerfTrace } from 'firebase/performance';

let analyticsInstance: Analytics | null = null;
let performanceInstance: FirebasePerformance | null = null;
let crashlyticsInstance: Crashlytics | null = null;

export interface CrashReportMeta {
  fatal?: boolean;
  component?: string;
  digest?: string;
  userId?: string;
  orgId?: string;
  extra?: Record<string, unknown>;
}

function getOrInitCrashlytics(app?: FirebaseApp): Crashlytics | null {
  if (typeof window === 'undefined') return null;
  if (crashlyticsInstance) return crashlyticsInstance;
  const targetApp = app || getApps()[0];
  if (!targetApp) return null;
  try {
    crashlyticsInstance = getCrashlytics(targetApp, {
      appVersion: '1.0.0',
      captureUnhandledErrors: true,
      features: [breadcrumbs()],
      customAttributes: { app: 'app.revlet.me' },
    });
  } catch {
    // Ignore in unsupported environments (e.g. SSR/restricted browsers)
  }
  return crashlyticsInstance;
}

/**
 * Initializes Firebase Crashlytics, Firebase Performance Monitoring, and
 * Firebase Analytics in browser environments.
 */
export async function initFirebaseTelemetry(app?: FirebaseApp): Promise<{
  analytics: Analytics | null;
  performance: FirebasePerformance | null;
  crashlytics: Crashlytics | null;
}> {
  if (typeof window === 'undefined') {
    return { analytics: null, performance: null, crashlytics: null };
  }

  const targetApp = app || getApps()[0];
  if (!targetApp) {
    return { analytics: null, performance: null, crashlytics: null };
  }

  // 1. Initialize Firebase Crashlytics (Web SDK — automatic unhandled error & breadcrumb capture)
  const crashlytics = getOrInitCrashlytics(targetApp);

  // 2. Initialize Firebase Performance Monitoring
  if (!performanceInstance) {
    try {
      performanceInstance = getPerformance(targetApp);
    } catch {
      // Ignore in unsupported environments (e.g. headless/SSR)
    }
  }

  // 3. Initialize Firebase Analytics
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

  return {
    analytics: analyticsInstance,
    performance: performanceInstance,
    crashlytics,
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
 * Reports an exception/crash to Firebase Crashlytics (`recordError`) and
 * Firebase Analytics (`exception` event).
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

  const crashlytics = getOrInitCrashlytics();
  if (crashlytics) {
    try {
      const attrs: Record<string, string | number | boolean> = {
        app: 'app.revlet.me',
        fatal,
        component: meta.component || 'runtime',
        pathname: window.location.pathname,
      };
      const digest = meta.digest || (errObj as Error & { digest?: string }).digest;
      if (digest) attrs.digest = String(digest).slice(0, 120);
      if (meta.userId) attrs.userId = String(meta.userId).slice(0, 128);
      const orgId = meta.orgId || localStorage.getItem('revlet_active_org_id');
      if (orgId) attrs.orgId = String(orgId).slice(0, 128);
      recordError(crashlytics, errObj, attrs);
    } catch {
      // Non-fatal
    }
  }

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
    // Exclude account-action and invitation-token routes from analytics so tokens never leak
    if (pathname.startsWith('/auth/action') || pathname.startsWith('/invite/')) return;
    let cancelled = false;

    void initFirebaseTelemetry(app).then(({ analytics }) => {
      if (cancelled || !analytics) return;
      try {
        // Never send query strings or fragments to Analytics
        const sanitizedLocation = `${window.location.origin}${pathname}`;
        logEvent(analytics, 'page_view', {
          page_path: pathname,
          page_location: sanitizedLocation,
          page_title: document.title,
        });
      } catch {
        // Non-fatal
      }
    });

    return () => {
      cancelled = true;
    };
  }, [app, pathname]);

  return null;
}
