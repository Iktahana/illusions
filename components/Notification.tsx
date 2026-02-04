'use client';

import { useEffect, useState } from 'react';
import type { NotificationItem } from '@/types/notification';
import { notificationManager } from '@/lib/notification-manager';
import { 
  AlertCircle, 
  AlertTriangle, 
  Info, 
  X 
} from 'lucide-react';

interface NotificationProps {
  notification: NotificationItem;
}

export function Notification({ notification }: NotificationProps) {
  const [isClosing, setIsClosing] = useState(false);
  const hasProgress = 'progress' in notification;
  const progress = hasProgress ? notification.progress ?? 0 : undefined;

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      notificationManager.dismiss(notification.id);
    }, 300); // 等待动画完成
  };

  // アイコンと色の設定
  const config = {
    info: {
      icon: Info,
      bgColor: 'bg-blue-500',
      borderColor: 'border-blue-500',
      textColor: 'text-blue-500',
    },
    warning: {
      icon: AlertTriangle,
      bgColor: 'bg-yellow-500',
      borderColor: 'border-yellow-500',
      textColor: 'text-yellow-500',
    },
    error: {
      icon: AlertCircle,
      bgColor: 'bg-red-500',
      borderColor: 'border-red-500',
      textColor: 'text-red-500',
    },
  };

  const { icon: Icon, bgColor, borderColor, textColor } = config[notification.type];

  return (
    <div
      className={`
        relative flex items-start gap-3 p-4 mb-2 rounded-lg border-l-4 
        bg-white dark:bg-gray-800 shadow-lg
        ${borderColor}
        transition-all duration-300 ease-in-out
        ${isClosing ? 'opacity-0 translate-x-full' : 'opacity-100 translate-x-0'}
      `}
      style={{
        minWidth: '320px',
        maxWidth: '500px',
      }}
    >
      {/* アイコン */}
      <div className={`flex-shrink-0 ${textColor}`}>
        <Icon size={20} />
      </div>

      {/* 内容 */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-900 dark:text-gray-100 break-words">
          {notification.message}
        </p>

         {/* プログレスバー */}
         {hasProgress && typeof progress === 'number' && (
          <div className="mt-2">
            <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className={`h-full ${bgColor} transition-all duration-300 ease-out`}
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {Math.round(progress)}%
            </p>
          </div>
        )}
      </div>

       {/* クローズボタン */}
       <button
         onClick={handleClose}
         className="flex-shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
         aria-label="閉じる"
      >
        <X size={16} />
      </button>
    </div>
  );
}
