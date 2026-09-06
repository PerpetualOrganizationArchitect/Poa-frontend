/**
 * useUserActive
 *
 * Returns `false` when the browser tab is hidden OR the user has been idle
 * (no mouse / keyboard / touch) for IDLE_TIMEOUT ms.  A single set of DOM
 * listeners is shared across all hook instances via a module-level singleton.
 */

import { useState, useEffect } from 'react';

const IDLE_TIMEOUT = 5 * 60 * 1000; // 5 minutes

// ── singleton state ──────────────────────────────────────────────────
const subscribers = new Set();
let active = true;
let initialized = false;
let idleTimer = null;
let lastTs = 0;

function broadcast(next) {
  if (active === next) return;
  active = next;
  subscribers.forEach((fn) => fn(next));
}

function onActivity() {
  const now = Date.now();
  if (now - lastTs < 1000) return; // throttle high-frequency events
  lastTs = now;
  if (!document.hidden) broadcast(true);
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => broadcast(false), IDLE_TIMEOUT);
}

function onVisibility() {
  if (document.hidden) {
    broadcast(false);
    clearTimeout(idleTimer);
  } else {
    broadcast(true);
    onActivity();
  }
}

function init() {
  if (initialized || typeof document === 'undefined') return;
  initialized = true;

  document.addEventListener('visibilitychange', onVisibility);
  ['mousemove', 'keydown', 'scroll', 'click', 'touchstart'].forEach((e) =>
    window.addEventListener(e, onActivity, { passive: true }),
  );

  // A tab can mount while already hidden, without a visibilitychange event.
  // Seed from visibility so background tabs never start an active poll cycle.
  onVisibility();
}

// ── hook ─────────────────────────────────────────────────────────────
export function useUserActive() {
  const [isActive, setIsActive] = useState(() => {
    init();
    return active;
  });

  useEffect(() => {
    init();
    subscribers.add(setIsActive);
    setIsActive(active); // sync in case state changed between render & commit
    return () => subscribers.delete(setIsActive);
  }, []);

  return isActive;
}
