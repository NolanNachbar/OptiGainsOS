import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/api/supabaseClient";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function usePushNotifications(userId) {
  const [permission, setPermission] = useState(
    typeof Notification !== "undefined" ? Notification.permission : "default"
  );
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    setIsSupported("serviceWorker" in navigator && "PushManager" in window);
  }, []);

  // Check if already subscribed
  useEffect(() => {
    if (!isSupported || !userId) return;
    navigator.serviceWorker.ready.then((reg) => {
      reg.pushManager.getSubscription().then((sub) => {
        setIsSubscribed(!!sub);
      });
    });
  }, [isSupported, userId]);

  const subscribe = useCallback(async () => {
    if (!isSupported || !userId) return false;

    try {
      const reg = await navigator.serviceWorker.ready;
      const permission = await Notification.requestPermission();
      setPermission(permission);
      if (permission !== "granted") return false;

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      const { endpoint, keys } = sub.toJSON();

      await supabase.from("push_subscriptions").upsert(
        {
          created_by: userId,
          endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
        },
        { onConflict: "endpoint" }
      );

      setIsSubscribed(true);
      return true;
    } catch (err) {
      console.error("Push subscription failed:", err);
      return false;
    }
  }, [isSupported, userId]);

  const unsubscribe = useCallback(async () => {
    if (!isSupported) return;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;

    await sub.unsubscribe();
    await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
    setIsSubscribed(false);
  }, [isSupported]);

  // Fire a local notification (e.g. rest timer) — no server needed
  const showLocalNotification = useCallback(async (title, body, options = {}) => {
    if (permission !== "granted") return;
    const reg = await navigator.serviceWorker.ready;
    reg.showNotification(title, {
      body,
      icon: `${import.meta.env.BASE_URL}vektor-logo.png`,
      badge: `${import.meta.env.BASE_URL}vektor-logo.png`,
      vibrate: [200, 100, 200],
      ...options,
    });
  }, [permission]);

  return { isSupported, isSubscribed, permission, subscribe, unsubscribe, showLocalNotification };
}
