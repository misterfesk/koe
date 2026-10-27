"use client";
import { useEffect, useState, useTransition } from "react";
import { useBrowserValue } from "@/components/use-browser";
import { sendTestReminder, subscribePush } from "@/server/actions/settings";

function base64ToBytes(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

export const blockedMessage =
  "Notifications are blocked for Koe in this browser. You can allow them in your browser's site settings.";

/** Whether this browser can show reminders at all. */
export function usePushSupport() {
  return useBrowserValue(
    () => "serviceWorker" in navigator && "PushManager" in window,
    true,
  );
}

/**
 * Whether this browser has already allowed notifications for Koe. The
 * Permissions API is asked first because it agrees with the site settings in
 * every browser; `Notification.permission` is the fallback.
 */
export function useAllowed() {
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    let live = true;
    const fallback = () =>
      typeof Notification !== "undefined" &&
      Notification.permission === "granted";
    (navigator.permissions
      ? navigator.permissions.query({ name: "notifications" })
      : Promise.reject(new Error("unsupported"))
    )
      .then((status) => {
        if (!live) return;
        setAllowed(status.state === "granted");
        status.onchange = () => setAllowed(status.state === "granted");
      })
      .catch(() => live && setAllowed(fallback()));
    return () => {
      live = false;
    };
  }, []);
  return allowed;
}

/**
 * Asks for permission, subscribes this device and saves it. Call it only
 * from a tap on a reminder control, so the browser's question comes with a
 * reason the person has just read.
 */
export async function enableNotifications(
  publicKey: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return { ok: false, message: blockedMessage };
    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64ToBytes(publicKey),
      }));
    const saved = await subscribePush(sub.toJSON());
    if (!saved.ok)
      return {
        ok: false,
        message: "Reminders aren't set up on this server yet.",
      };
    return { ok: true };
  } catch {
    return {
      ok: false,
      message: "Couldn't turn reminders on in this browser. Try again later.",
    };
  }
}

/** "Send a test now", with the plain result under it. */
export function TestNow({ className }: { className?: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(
    null,
  );
  const allowed = useAllowed();
  return (
    <>
      <button
        type="button"
        className={className ?? "secondary"}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            if (!allowed) {
              setResult({ ok: false, message: blockedMessage });
              return;
            }
            setResult(await sendTestReminder());
          })
        }
      >
        Send a test now
      </button>
      {result && (
        <p
          className={result.ok ? "meta" : "error"}
          role={result.ok ? "status" : "alert"}
        >
          {result.message}
        </p>
      )}
    </>
  );
}
