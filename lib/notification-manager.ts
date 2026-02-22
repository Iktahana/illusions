import type { 
  NotificationItem, 
  NotificationOptions, 
  ProgressNotificationOptions,
  NotificationType 
} from '@/types/notification';

type NotificationListener = (notifications: NotificationItem[]) => void;

class NotificationManager {
  private static instance: NotificationManager;
  private static readonly MAX_NOTIFICATIONS = 50;
  private notifications: NotificationItem[] = [];
  private listeners: Set<NotificationListener> = new Set();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
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
      actions: options.actions,
    };

    this.notifications.push(notification);

    // Enforce cap: evict oldest when exceeding MAX_NOTIFICATIONS
    while (this.notifications.length > NotificationManager.MAX_NOTIFICATIONS) {
      const oldest = this.notifications.shift();
      if (oldest) {
        const oldTimer = this.timers.get(oldest.id);
        if (oldTimer !== undefined) {
          clearTimeout(oldTimer);
          this.timers.delete(oldest.id);
        }
      }
    }

    this.notify();

    // 自動クローズ
    if (duration > 0) {
      const timerId = setTimeout(() => {
        this.timers.delete(id);
        this.dismiss(id);
      }, duration);
      this.timers.set(id, timerId);
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

    // Enforce cap: evict oldest when exceeding MAX_NOTIFICATIONS
    while (this.notifications.length > NotificationManager.MAX_NOTIFICATIONS) {
      const oldest = this.notifications.shift();
      if (oldest) {
        const oldTimer = this.timers.get(oldest.id);
        if (oldTimer !== undefined) {
          clearTimeout(oldTimer);
          this.timers.delete(oldest.id);
        }
      }
    }

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
        // Clear any existing timer for this notification
        const existingTimer = this.timers.get(id);
        if (existingTimer !== undefined) {
          clearTimeout(existingTimer);
        }
        const timerId = setTimeout(() => {
          this.timers.delete(id);
          this.dismiss(id);
        }, 3000);
        this.timers.set(id, timerId);
      }
    }
  }

  /**
   * メッセージをクローズ
   */
  dismiss(id: string): void {
    // Clear associated timer
    const timerId = this.timers.get(id);
    if (timerId !== undefined) {
      clearTimeout(timerId);
      this.timers.delete(id);
    }

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
    // Clear all pending timers
    for (const timerId of this.timers.values()) {
      clearTimeout(timerId);
    }
    this.timers.clear();

    this.notifications = [];
    this.notify();
  }

  /**
   * マネージャを完全にクリーンアップ
   */
  destroy(): void {
    this.dismissAll();
    this.listeners.clear();
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

  /**
   * ショートカット：成功メッセージを表示
   */
  success(message: string, duration?: number): string {
    return this.showMessage(message, { type: 'success', duration });
  }
}

// シングルトン インスタンスをエクスポート
export const notificationManager = NotificationManager.getInstance();
