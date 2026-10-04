'use client';
import { useEffect } from 'react';

export function ServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    // Retire the v2 offline shell without installing a worker on new visits.
    void navigator.serviceWorker.getRegistrations().then(async registrations => {
      for (const registration of registrations) {
        const worker = registration.active || registration.waiting || registration.installing;
        if (worker && new URL(worker.scriptURL).pathname === '/sw.js') await registration.unregister();
      }
      for (const key of await caches.keys()) {
        if (key.startsWith('tripwire-')) await caches.delete(key);
      }
    }).catch(error => console.warn('Could not retire the old Tripwire offline cache:', error));
  }, []);
  return null;
}
