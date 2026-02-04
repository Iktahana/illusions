'use client';

import { useEffect, useState } from 'react';
import { notificationManager } from '@/lib/notification-manager';
import { Notification } from './Notification';
import type { NotificationItem } from '@/types/notification';

export function NotificationContainer() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  useEffect(() => {
    // 订阅通知更新
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

  return (
    <div
      className="fixed top-4 right-4 z-50 flex flex-col items-end"
      style={{ pointerEvents: 'none' }}
    >
      <div style={{ pointerEvents: 'auto' }}>
        {notifications.map((notification) => (
          <Notification key={notification.id} notification={notification} />
        ))}
      </div>
    </div>
  );
}
