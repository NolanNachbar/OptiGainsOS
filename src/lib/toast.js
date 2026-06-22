import { toast } from 'sonner';

// Passive toast helpers (SYS-09). Success/info are read-and-forget: they
// confirm an action and then get out of the way, so they carry a short, fixed
// lifetime. This REPLACES the old toast.success / toast.info singleton
// monkeypatch in App.jsx (mutating the imported singleton was global state we
// could not see at the call site and broke any caller importing toast.success
// directly). Route passive confirmations through these named helpers instead.
//
// The lifetime is held at ~4500ms — deliberately longer than the old 3000ms.
// Many success toasts fire immediately before a route change (e.g. logging a
// workout redirects to /today). At 3000ms a toast fired right before the
// redirect could begin auto-dismissing as the new route mounted; ~4500ms
// guarantees the confirmation survives the navigation and stays readable on the
// surface the user lands on, while still auto-clearing well before it becomes
// stale. error / warning / CTA toasts keep the longer 8000ms ACTIONABLE default
// set on <Toaster>.
const PASSIVE_TOAST_MS = 4500;

export function successToast(message, data) {
  return toast.success(message, { duration: PASSIVE_TOAST_MS, ...data });
}

export function infoToast(message, data) {
  return toast.info(message, { duration: PASSIVE_TOAST_MS, ...data });
}
