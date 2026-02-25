'use client';

import { useState } from 'react';
import type { NotificationItem } from '@/types/notification';
import { notificationManager } from '@/lib/services/notification-manager';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Info,
  X,
} from 'lucide-react';

interface NotificationProps {
  notification: NotificationItem;
}

const iconConfig = {
  info: { icon: Info, colorClass: 'text-info' },
  warning: { icon: AlertTriangle, colorClass: 'text-warning' },
  error: { icon: AlertCircle, colorClass: 'text-error' },
  success: { icon: CheckCircle, colorClass: 'text-success' },
} as const;

export function Notification({ notification }: NotificationProps) {
  const [isClosing, setIsClosing] = useState(false);
  const hasProgress = 'progress' in notification;
  const progress = hasProgress ? notification.progress ?? 0 : undefined;
  const actions = notification.actions?.slice(0, 3);

  const handleClose = (): void => {
    setIsClosing(true);
    setTimeout(() => {
      notificationManager.dismiss(notification.id);
    }, 200); // match slide-out duration
  };

  const handleAction = (onClick: () => void): void => {
    onClick();
    handleClose();
  };

  const { icon: Icon, colorClass } = iconConfig[notification.type];

  return (
    <div
      className={`
        relative flex flex-col rounded-md border
        bg-background-elevated border-border shadow-lg
        ${isClosing ? 'animate-notification-out' : 'animate-notification-in'}
      `}
      style={{ width: 340 }}
    >
      {/* Top row: icon + message + close */}
      <div className="flex items-start gap-2.5 p-3">
        <div className={`flex-shrink-0 mt-0.5 ${colorClass}`}>
          <Icon size={18} />
        </div>

        <p className="flex-1 min-w-0 text-sm text-foreground break-words leading-snug">
          {notification.message}
        </p>

        <button
          onClick={handleClose}
          className="flex-shrink-0 text-foreground-muted hover:text-foreground transition-colors"
          aria-label="閉じる"
        >
          <X size={14} />
        </button>
      </div>

      {/* Action buttons */}
      {actions && actions.length > 0 && (
        <div className="flex gap-3 px-3 pb-2.5 pl-[38px]">
          {actions.map((action) => (
            <button
              key={action.label}
              onClick={() => handleAction(action.onClick)}
              className="text-xs font-medium text-accent hover:text-accent-hover transition-colors"
            >
              {action.label}
            </button>
          ))}
        </div>
      )}

      {/* Progress bar */}
      {hasProgress && typeof progress === 'number' && (
        <div className="px-3 pb-2.5">
          <div className="w-full h-1 bg-border rounded-full overflow-hidden">
            <div
              className={`h-full ${colorClass.replace('text-', 'bg-')} transition-all duration-300 ease-out`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
