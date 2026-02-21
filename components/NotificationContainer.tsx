'use client';

import { useEffect, useState } from 'react';
import { notificationManager } from '@/lib/notification-manager';
import { Notification } from './Notification';
import type { NotificationItem } from '@/types/notification';

const MAX_VISIBLE = 5;

export function NotificationContainer() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  useEffect(() => {
    const unsubscribe = notificationManager.subscribe((newNotifications) => {
      setNotifications(newNotifications);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  if (notifications.length === 0) {
    return null;
  }

  // Show only the latest MAX_VISIBLE notifications
  const visible = notifications.slice(-MAX_VISIBLE);

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {visible.map((notification) => (
        <Notification key={notification.id} notification={notification} />
      ))}
    </div>
  );
}
