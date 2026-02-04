export type NotificationType = 'info' | 'warning' | 'error';

export interface NotificationMessage {
  id: string;
  type: NotificationType;
  message: string;
  duration?: number; // 持续时间（毫秒），undefined 表示不自动关闭
}

export interface NotificationProgress extends NotificationMessage {
  type: 'info' | 'warning' | 'error';
  progress?: number; // 0-100
}

export type NotificationItem = NotificationMessage | NotificationProgress;

export interface NotificationOptions {
  type?: NotificationType;
  duration?: number; // 默认 10000ms (10秒)
}

export interface ProgressNotificationOptions extends NotificationOptions {
  progress?: number;
}
