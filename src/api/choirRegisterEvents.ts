/** A non-sensitive invalidation signal: choir records remain on the server. */
export const CHOIR_REGISTER_CHANGED = 'moriah:choir-register-changed';
export function notifyChoirRegisterChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(CHOIR_REGISTER_CHANGED));
  try { localStorage.setItem(CHOIR_REGISTER_CHANGED, String(Date.now()) + Math.random()); } catch { /* Focus refresh also works when storage is unavailable. */ }
}
