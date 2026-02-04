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
   * 添加订阅者
   */
  subscribe(listener: NotificationListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * 通知所有订阅者
   */
  private notify(): void {
    this.listeners.forEach(listener => listener([...this.notifications]));
  }

  /**
   * 显示普通消息
   */
  showMessage(
    message: string, 
    options: NotificationOptions = {}
  ): string {
    const id = `notification-${this.nextId++}`;
    const type = options.type || 'info';
    const duration = options.duration ?? 10000; // 默认 10 秒

    const notification: NotificationItem = {
      id,
      type,
      message,
      duration,
    };

    this.notifications.push(notification);
    this.notify();

    // 自动关闭
    if (duration > 0) {
      setTimeout(() => {
        this.dismiss(id);
      }, duration);
    }

    return id;
  }

  /**
   * 显示进度条消息
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
   * 更新进度条
   */
  updateProgress(id: string, progress: number, message?: string): void {
    const notification = this.notifications.find(n => n.id === id);
    if (notification && 'progress' in notification) {
      notification.progress = Math.min(100, Math.max(0, progress));
      if (message) {
        notification.message = message;
      }
      this.notify();

      // 进度达到 100% 后 3 秒自动关闭
      if (notification.progress >= 100) {
        setTimeout(() => {
          this.dismiss(id);
        }, 3000);
      }
    }
  }

  /**
   * 关闭消息
   */
  dismiss(id: string): void {
    const index = this.notifications.findIndex(n => n.id === id);
    if (index !== -1) {
      this.notifications.splice(index, 1);
      this.notify();
    }
  }

  /**
   * 关闭所有消息
   */
  dismissAll(): void {
    this.notifications = [];
    this.notify();
  }

  /**
   * 便捷方法：显示信息消息
   */
  info(message: string, duration?: number): string {
    return this.showMessage(message, { type: 'info', duration });
  }

  /**
   * 便捷方法：显示警告消息
   */
  warning(message: string, duration?: number): string {
    return this.showMessage(message, { type: 'warning', duration });
  }

  /**
   * 便捷方法：显示错误消息
   */
  error(message: string, duration?: number): string {
    return this.showMessage(message, { type: 'error', duration });
  }
}

// 导出单例实例
export const notificationManager = NotificationManager.getInstance();
