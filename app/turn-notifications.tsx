'use client';
import { useEffect, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';

async function api(body?: Record<string, unknown>) {
  const response = await fetch('/api/notifications', {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: 'no-store',
  });
  const data = (await response.json()) as {
    enabled?: boolean;
    publicKey?: string;
    active?: boolean;
    error?: string;
  };
  if (!response.ok)
    throw new Error(data.error || 'Notifications are temporarily unavailable.');
  return data;
}
export function TurnNotifications({ userId }: { userId: string }) {
  const [config, setConfig] = useState<{
    enabled: boolean;
    publicKey: string;
  } | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(false);
  const [supported, setSupported] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    let current = true;
    (async () => {
      const value = await api();
      if (current)
        setSupported(
          window.isSecureContext &&
            'serviceWorker' in navigator &&
            'PushManager' in window &&
            'Notification' in window,
        );
      if (current)
        setConfig({
          enabled: !!value.enabled,
          publicKey: value.publicKey || '',
        });
      if ('serviceWorker' in navigator && 'PushManager' in window) {
        const registration = await navigator.serviceWorker.getRegistration('/');
        const subscription = await registration?.pushManager.getSubscription();
        if (subscription) {
          const status = await api({
            op: 'status',
            endpoint: subscription.endpoint,
          });
          if (current) setActive(!!status.active);
        }
      }
    })().catch(() => {});
    return () => {
      current = false;
    };
  }, [userId]);
  useEffect(() => {
    if (!open || !supported) return;
    let current = true;
    (async () => {
      const registration = await navigator.serviceWorker.getRegistration('/');
      const subscription = await registration?.pushManager.getSubscription();
      const value = subscription
        ? await api({ op: 'status', endpoint: subscription.endpoint })
        : { active: false };
      if (current) setActive(!!value.active);
    })()
      .catch((e) => {
        if (current) setMessage(e.message);
      })
      .finally(() => {
        if (current) setBusy(false);
      });
    return () => {
      current = false;
    };
  }, [open, supported, userId]);
  async function toggle() {
    setBusy(true);
    setMessage('');
    let created: PushSubscription | null = null;
    try {
      if (active) {
        const registration = await navigator.serviceWorker.getRegistration('/');
        const subscription = await registration?.pushManager.getSubscription();
        if (subscription) {
          await api({ op: 'remove', endpoint: subscription.endpoint });
          await subscription.unsubscribe();
        }
        setActive(false);
        setMessage('Turn notifications are off for this browser.');
      } else {
        // Permission is requested directly from the button action, never on load.
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          setMessage(
            permission === 'denied'
              ? 'Notifications are blocked. You can change this in your browser’s website settings.'
              : 'Notifications stayed off. You can try again whenever you like.',
          );
          return;
        }
        const registration = await navigator.serviceWorker.register(
          '/lantern-push.js',
          { scope: '/' },
        );
        await navigator.serviceWorker.ready;
        // Renew an unregistered/old-account subscription before assigning this browser.
        const previous = await registration.pushManager.getSubscription();
        if (previous) await previous.unsubscribe();
        created = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: config!.publicKey,
        });
        await api({ op: 'subscribe', userId, subscription: created.toJSON() });
        created = null;
        setActive(true);
        setMessage(
          'Turn notifications are on for this browser. Signing out turns them off.',
        );
      }
    } catch (e) {
      if (created) await created.unsubscribe().catch(() => false);
      setMessage(
        e instanceof Error
          ? e.message
          : 'Notifications could not be changed. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }
  if (!config || (!config.enabled && !active)) return null;
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (value) setBusy(true);
      }}
    >
      <Dialog.Trigger className="notification-trigger">
        Turn notifications
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="modal-backdrop" />
        <Dialog.Popup className="modal">
          <div className="modal-heading">
            <Dialog.Title>Turn notifications</Dialog.Title>
            <Dialog.Close aria-label="Close notifications">Close</Dialog.Close>
          </div>
          <Dialog.Description>
            Get a brief alert when a campaign needs your turn, vote or
            dungeon-master input, even with the game tab closed. Story details
            stay in the game.
          </Dialog.Description>
          {!supported ? (
            <p>
              This browser does not support turn notifications here. Try a
              supported browser; on iPhone or iPad, add the game to your Home
              Screen first.
            </p>
          ) : (
            <>
              <p>
                {active
                  ? 'On for this browser. Signing out turns notifications off.'
                  : 'Off for this browser. Your browser will ask for permission when you turn them on.'}
              </p>
              <button
                className="primary"
                disabled={busy}
                onClick={() => void toggle()}
              >
                {busy ? 'Checking…' : active ? 'Turn off' : 'Turn on'}
              </button>
            </>
          )}
          {message && <output>{message}</output>}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
