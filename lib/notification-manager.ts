import type { 
  NotificationItem, 
  NotificationOptions, 
  ProgressNotificationOptions,
  NotificationType 
} from '@/types/notification';

type NotificationListener = (notifications: NotificationItem[]) => void;

class NotificationManager {
  private static instance: NotificationManager;
  private notifications: NotificationItem[] = [];
  private listeners: Set<NotificationListener> = new Set();
  private nextId = 0;

  private constructor() {}

  static getInstance(): NotificationManager {
    if (!NotificationManager.instance) {
      NotificationManager.instance = new NotificationManager();
    }
    return NotificationManager.instance;
  }

  /**
   * リスナーを追加
   */
  subscribe(listener: NotificationListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * すべてのリスナーに通知
   */
  private notify(): void {
    this.listeners.forEach(listener => listener([...this.notifications]));
  }

  /**
   * 通常メッセージを表示
   */
  showMessage(
    message: string, 
    options: NotificationOptions = {}
  ): string {
    const id = `notification-${this.nextId++}`;
    const type = options.type || 'info';
     const duration = options.duration ?? 10000; // デフォルト 10 秒

    const notification: NotificationItem = {
      id,
      type,
      message,
      duration,
    };

    this.notifications.push(notification);
    this.notify();

     // 自動クローズ
     if (duration > 0) {
      setTimeout(() => {
        this.dismiss(id);
      }, duration);
    }

    return id;
  }

  /**
   * プログレスバーメッセージを表示
   */
  showProgress(
    message: string,
    options: ProgressNotificationOptions = {}
  ): string {
    const id = `notification-${this.nextId++}`;
    const type = options.type || 'info';

    const notification: NotificationItem = {
      id,
      type,
      message,
      progress: options.progress ?? 0,
    };

    this.notifications.push(notification);
    this.notify();

    return id;
  }

  /**
   * プログレスバーを更新
   */
  updateProgress(id: string, progress: number, message?: string): void {
    const notification = this.notifications.find(n => n.id === id);
    if (notification && 'progress' in notification) {
      notification.progress = Math.min(100, Math.max(0, progress));
      if (message) {
        notification.message = message;
      }
      this.notify();

       // プログレスが 100% に達した後 3 秒で自動クローズ
       if (notification.progress >= 100) {
        setTimeout(() => {
          this.dismiss(id);
        }, 3000);
      }
    }
  }

  /**
   * メッセージをクローズ
   */
  dismiss(id: string): void {
    const index = this.notifications.findIndex(n => n.id === id);
    if (index !== -1) {
      this.notifications.splice(index, 1);
      this.notify();
    }
  }

  /**
   * すべてのメッセージをクローズ
   */
  dismissAll(): void {
    this.notifications = [];
    this.notify();
  }

  /**
   * ショートカット：情報メッセージを表示
   */
  info(message: string, duration?: number): string {
    return this.showMessage(message, { type: 'info', duration });
  }

  /**
   * ショートカット：警告メッセージを表示
   */
  warning(message: string, duration?: number): string {
    return this.showMessage(message, { type: 'warning', duration });
  }

  /**
   * ショートカット：エラーメッセージを表示
   */
  error(message: string, duration?: number): string {
    return this.showMessage(message, { type: 'error', duration });
  }
}

// シングルトン インスタンスをエクスポート
export const notificationManager = NotificationManager.getInstance();
