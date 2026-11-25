interface ExtendedDocumentElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}

interface ExtendedDocument extends Document {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
}

interface ScreenOrientationWithLock {
  type?: string;
  lock?: (
    orientation: 'landscape' | 'landscape-primary' | 'landscape-secondary' | 'portrait' | 'natural' | 'any'
  ) => Promise<void>;
  unlock?: () => void;
}

export interface LandscapeLockResult {
  fullscreenEntered: boolean;
  orientationLocked: boolean;
}

let pendingFsLockCleanup: (() => void) | null = null;

export function isFullscreenActive(): boolean {
  if (typeof document === 'undefined') return false;
  const doc = document as ExtendedDocument;
  return Boolean(doc.fullscreenElement || doc.webkitFullscreenElement);
}

export function isActualLandscape(): boolean {
  if (typeof window === 'undefined') return true;
  const orientationType = window.screen?.orientation?.type;
  if (typeof orientationType === 'string' && orientationType.length > 0) {
    return orientationType.startsWith('landscape');
  }
  if (typeof window.matchMedia === 'function') {
    const mq = window.matchMedia('(orientation: landscape)');
    if (mq && typeof mq.matches === 'boolean') {
      return mq.matches;
    }
  }
  return window.innerWidth >= window.innerHeight;
}

export async function lockScreenOrientationLandscape(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const orientation = window.screen?.orientation as ScreenOrientationWithLock | undefined;
  if (!orientation || typeof orientation.lock !== 'function') {
    return false;
  }
  try {
    await orientation.lock('landscape');
    return true;
  } catch {
    try {
      await orientation.lock('landscape-primary');
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Must be invoked directly from a trusted user interaction (e.g., clicking "ENTER CINEMA").
 * Requests real fullscreen and locks actual hardware device orientation via the Screen Orientation API.
 * Includes Android Chrome fullscreen-settle retry so auto-rotate fires reliably on first tap.
 */
export async function requestLandscapeCinema(shouldLockOrientation = true): Promise<LandscapeLockResult> {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return { fullscreenEntered: false, orientationLocked: false };
  }

  if (pendingFsLockCleanup) {
    pendingFsLockCleanup();
    pendingFsLockCleanup = null;
  }

  let fullscreenEntered = isFullscreenActive();

  if (!fullscreenEntered) {
    const rootEl = document.documentElement as ExtendedDocumentElement;
    try {
      if (typeof rootEl.requestFullscreen === 'function') {
        await rootEl.requestFullscreen({ navigationUI: 'hide' } as FullscreenOptions);
        fullscreenEntered = true;
      } else if (typeof rootEl.webkitRequestFullscreen === 'function') {
        await Promise.resolve(rootEl.webkitRequestFullscreen());
        fullscreenEntered = isFullscreenActive();
      }
    } catch {
      fullscreenEntered = isFullscreenActive();
    }
  }

  let orientationLocked = false;
  if (shouldLockOrientation) {
    orientationLocked = await lockScreenOrientationLandscape();

    // Android Chrome sometimes needs a brief tick after fullscreen settles before orientation.lock succeeds
    if (!orientationLocked && fullscreenEntered) {
      await new Promise((resolve) => window.setTimeout(resolve, 120));
      orientationLocked = await lockScreenOrientationLandscape();
    }

    // One-shot fallback retry the moment fullscreenchange finishes committing
    if (!orientationLocked) {
      const onFsSettled = () => {
        if (isFullscreenActive()) {
          void lockScreenOrientationLandscape();
        }
        cleanup();
      };
      const timeoutId = window.setTimeout(() => cleanup(), 1500);
      const cleanup = () => {
        window.clearTimeout(timeoutId);
        document.removeEventListener('fullscreenchange', onFsSettled);
        document.removeEventListener('webkitfullscreenchange', onFsSettled);
        if (pendingFsLockCleanup === cleanup) pendingFsLockCleanup = null;
      };
      document.addEventListener('fullscreenchange', onFsSettled);
      document.addEventListener('webkitfullscreenchange', onFsSettled);
      pendingFsLockCleanup = cleanup;
    }
  }

  return { fullscreenEntered, orientationLocked };
}

/**
 * Releases hardware orientation lock and exits fullscreen.
 * Call ONLY when explicitly exiting the cinema auditorium back to the portrait lobby.
 */
export function releaseLandscapeCinema(): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;

  if (pendingFsLockCleanup) {
    pendingFsLockCleanup();
    pendingFsLockCleanup = null;
  }

  try {
    const orientation = window.screen?.orientation as ScreenOrientationWithLock | undefined;
    orientation?.unlock?.();
  } catch {
    // Ignore unsupported unlock
  }

  try {
    const doc = document as ExtendedDocument;
    if (doc.fullscreenElement && typeof doc.exitFullscreen === 'function') {
      void doc.exitFullscreen().catch(() => {});
    } else if (doc.webkitFullscreenElement && typeof doc.webkitExitFullscreen === 'function') {
      void Promise.resolve(doc.webkitExitFullscreen()).catch(() => {});
    }
  } catch {
    // Ignore exitFullscreen errors
  }
}
