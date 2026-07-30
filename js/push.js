// js/push.js
// Handles the *optional* background-push feature. Everything here is a
// no-op until the user pastes in a push server URL / VAPID key and opts in
// from Settings. Nothing about vehicles, mileage, or history is ever sent -
// only push-subscription tokens and short {sendAt, title, body} job text.

import * as store from "./store.js";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
  return output;
}

function isConfigured() {
  const s = store.getSettings();
  return !!(s.pushWorkerUrl && s.vapidPublicKey);
}

export function isPushEnabled() {
  return store.getSettings().pushEnabled && isConfigured();
}

export async function enablePush() {
  const settings = store.getSettings();
  if (!settings.pushWorkerUrl || !settings.vapidPublicKey) {
    throw new Error("Add a push server URL and VAPID public key first.");
  }
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    throw new Error("This browser doesn't support background push.");
  }
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Notification permission was not granted.");

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(settings.vapidPublicKey),
    });
  }

  const deviceId = store.getOrCreateDeviceId();
  const res = await fetch(`${settings.pushWorkerUrl.replace(/\/$/, "")}/subscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId, subscription: sub.toJSON() }),
  });
  if (!res.ok) throw new Error("The push server didn't accept the subscription.");

  store.updateSettings({ pushEnabled: true });
  await syncPushJobs();
}

export async function disablePush() {
  const settings = store.getSettings();
  store.updateSettings({ pushEnabled: false });
  try {
    if (settings.pushWorkerUrl && settings.deviceId) {
      await fetch(`${settings.pushWorkerUrl.replace(/\/$/, "")}/unsubscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: settings.deviceId }),
      });
    }
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) await sub.unsubscribe();
    }
  } catch (e) {
    console.warn("GearLog: cleanup during disablePush failed (non-fatal)", e);
  }
}

// Call this after any change that could affect reminders (mileage update,
// task completion, settings change, etc.) while push is enabled. It's a
// full-replace sync - cheap, and keeps the server's job list matching
// exactly what the device currently thinks is true.
export async function syncPushJobs() {
  if (!isPushEnabled()) return;
  const settings = store.getSettings();
  const jobs = store.getScheduledPushJobs();
  try {
    await fetch(`${settings.pushWorkerUrl.replace(/\/$/, "")}/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: settings.deviceId, jobs }),
    });
  } catch (e) {
    console.warn("GearLog: push job sync failed (will retry on next change)", e);
  }
}
