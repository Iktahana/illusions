export type NotificationType = 'info' | 'warning' | 'error';

export interface NotificationMessage {
  id: string;
  type: NotificationType;
  message: string;
  duration?: number; // 継続時間（ミリ秒）、undefined は自動クローズなし
}

export interface NotificationProgress extends NotificationMessage {
  type: 'info' | 'warning' | 'error';
  progress?: number; // 0-100
}

export type NotificationItem = NotificationMessage | NotificationProgress;

export interface NotificationOptions {
  type?: NotificationType;
   duration?: number; // デフォルト 10000ms (10秒)
}

export interface ProgressNotificationOptions extends NotificationOptions {
  progress?: number;
}
