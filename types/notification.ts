export type NotificationType = 'info' | 'warning' | 'error' | 'success';

export interface NotificationAction {
  label: string;
  onClick: () => void;
}

export interface NotificationMessage {
  id: string;
  type: NotificationType;
  message: string;
  duration?: number; // 継続時間（ミリ秒）、undefined は自動クローズなし
  actions?: NotificationAction[];
}

export interface NotificationProgress extends NotificationMessage {
  type: 'info' | 'warning' | 'error' | 'success';
  progress?: number; // 0-100
}

export type NotificationItem = NotificationMessage | NotificationProgress;

export interface NotificationOptions {
  type?: NotificationType;
  duration?: number; // デフォルト 10000ms (10秒)
  actions?: NotificationAction[];
}

export interface ProgressNotificationOptions extends NotificationOptions {
  progress?: number;
}
