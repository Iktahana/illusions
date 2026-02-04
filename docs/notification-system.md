# 消息弹窗系统使用文档

类似 VS Code 的消息弹窗系统，支持信息、警告、错误三种类型，以及带进度条的消息提示。

## 功能特性

- ✅ 三种消息类型：`info`（信息）、`warning`（警告）、`error`（错误）
- ✅ 普通消息：默认 10 秒后自动关闭
- ✅ 进度条消息：进度达到 100% 后 3 秒自动关闭
- ✅ 手动关闭：点击关闭按钮即可关闭
- ✅ 平滑动画：淡入淡出效果
- ✅ 响应式设计：支持明暗主题

## 安装使用

### 1. 添加容器组件到布局

在你的根布局文件（如 `app/layout.tsx`）中添加 `NotificationContainer` 组件：

```tsx
import { NotificationContainer } from '@/components/NotificationContainer';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh">
      <body>
        {children}
        {/* 添加消息容器 */}
        <NotificationContainer />
      </body>
    </html>
  );
}
```

### 2. 使用消息管理器

在任意组件或函数中导入并使用 `notificationManager`：

```tsx
import { notificationManager } from '@/lib/notification-manager';
```

## API 文档

### 基础方法

#### `showMessage(message: string, options?: NotificationOptions): string`

显示普通消息。

**参数：**
- `message` - 消息内容
- `options` - 可选配置
  - `type` - 消息类型：`'info'` | `'warning'` | `'error'`，默认 `'info'`
  - `duration` - 持续时间（毫秒），默认 `10000`（10 秒）

**返回值：** 消息 ID（可用于后续操作）

**示例：**
```tsx
// 显示信息消息（10 秒后自动关闭）
const id = notificationManager.showMessage('操作成功！');

// 显示警告消息（5 秒后自动关闭）
notificationManager.showMessage('请注意检查数据', {
  type: 'warning',
  duration: 5000
});

// 显示错误消息（不自动关闭）
notificationManager.showMessage('发生错误，请重试', {
  type: 'error',
  duration: 0
});
```

---

#### `showProgress(message: string, options?: ProgressNotificationOptions): string`

显示带进度条的消息。

**参数：**
- `message` - 消息内容
- `options` - 可选配置
  - `type` - 消息类型：`'info'` | `'warning'` | `'error'`，默认 `'info'`
  - `progress` - 初始进度（0-100），默认 `0`

**返回值：** 消息 ID（用于更新进度）

**示例：**
```tsx
// 显示进度条消息
const id = notificationManager.showProgress('正在上传文件...', {
  progress: 0
});

// 更新进度
notificationManager.updateProgress(id, 50);
notificationManager.updateProgress(id, 100); // 达到 100% 后 3 秒自动关闭
```

---

#### `updateProgress(id: string, progress: number, message?: string): void`

更新进度条的进度和消息。

**参数：**
- `id` - 消息 ID
- `progress` - 新的进度值（0-100）
- `message` - 可选的新消息内容

**示例：**
```tsx
const id = notificationManager.showProgress('开始处理...');

// 更新进度和消息
notificationManager.updateProgress(id, 25, '正在读取文件...');
notificationManager.updateProgress(id, 50, '正在处理数据...');
notificationManager.updateProgress(id, 75, '正在保存结果...');
notificationManager.updateProgress(id, 100, '处理完成！');
```

---

#### `dismiss(id: string): void`

手动关闭指定消息。

**示例：**
```tsx
const id = notificationManager.showMessage('这条消息会被手动关闭', {
  duration: 0 // 不自动关闭
});

// 3 秒后手动关闭
setTimeout(() => {
  notificationManager.dismiss(id);
}, 3000);
```

---

#### `dismissAll(): void`

关闭所有消息。

**示例：**
```tsx
notificationManager.dismissAll();
```

---

### 便捷方法

#### `info(message: string, duration?: number): string`

显示信息消息（蓝色）。

```tsx
notificationManager.info('文件已保存');
notificationManager.info('欢迎使用', 5000);
```

---

#### `warning(message: string, duration?: number): string`

显示警告消息（黄色）。

```tsx
notificationManager.warning('磁盘空间不足');
notificationManager.warning('即将超时', 3000);
```

---

#### `error(message: string, duration?: number): string`

显示错误消息（红色）。

```tsx
notificationManager.error('网络连接失败');
notificationManager.error('保存失败，请重试', 15000);
```

---

## 完整示例

### 示例 1：普通消息

```tsx
'use client';

import { notificationManager } from '@/lib/notification-manager';

export function MyComponent() {
  const handleSave = async () => {
    try {
      // 显示加载提示
      const id = notificationManager.info('正在保存...', 0);
      
      // 执行保存操作
      await saveData();
      
      // 关闭加载提示
      notificationManager.dismiss(id);
      
      // 显示成功消息
      notificationManager.info('保存成功！');
    } catch (error) {
      // 显示错误消息
      notificationManager.error('保存失败：' + error.message);
    }
  };

  return (
    <button onClick={handleSave}>
      保存
    </button>
  );
}
```

### 示例 2：进度条消息

```tsx
'use client';

import { notificationManager } from '@/lib/notification-manager';

export function FileUploader() {
  const handleUpload = async (file: File) => {
    // 创建进度条消息
    const id = notificationManager.showProgress('开始上传文件...', {
      progress: 0
    });

    try {
      // 模拟文件上传进度
      for (let i = 0; i <= 100; i += 10) {
        await new Promise(resolve => setTimeout(resolve, 200));
        notificationManager.updateProgress(
          id, 
          i, 
          i < 100 ? `上传中... ${i}%` : '上传完成！'
        );
      }
      // 进度达到 100% 后会自动在 3 秒后关闭
    } catch (error) {
      // 关闭进度条
      notificationManager.dismiss(id);
      // 显示错误
      notificationManager.error('上传失败：' + error.message);
    }
  };

  return (
    <input
      type="file"
      onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) handleUpload(file);
      }}
    />
  );
}
```

### 示例 3：多种消息类型

```tsx
'use client';

import { notificationManager } from '@/lib/notification-manager';

export function NotificationDemo() {
  return (
    <div className="space-y-2">
      <button 
        onClick={() => notificationManager.info('这是一条信息消息')}
        className="px-4 py-2 bg-blue-500 text-white rounded"
      >
        显示信息
      </button>

      <button 
        onClick={() => notificationManager.warning('这是一条警告消息')}
        className="px-4 py-2 bg-yellow-500 text-white rounded"
      >
        显示警告
      </button>

      <button 
        onClick={() => notificationManager.error('这是一条错误消息')}
        className="px-4 py-2 bg-red-500 text-white rounded"
      >
        显示错误
      </button>

      <button 
        onClick={() => {
          const id = notificationManager.showProgress('处理中...', { progress: 0 });
          let progress = 0;
          const timer = setInterval(() => {
            progress += 10;
            notificationManager.updateProgress(id, progress);
            if (progress >= 100) clearInterval(timer);
          }, 500);
        }}
        className="px-4 py-2 bg-green-500 text-white rounded"
      >
        显示进度条
      </button>

      <button 
        onClick={() => notificationManager.dismissAll()}
        className="px-4 py-2 bg-gray-500 text-white rounded"
      >
        关闭所有
      </button>
    </div>
  );
}
```

## 自定义样式

消息组件使用 Tailwind CSS 编写，支持明暗主题。你可以通过修改 `components/Notification.tsx` 来自定义样式：

```tsx
// 修改消息类型的颜色配置
const config = {
  info: {
    icon: Info,
    bgColor: 'bg-blue-500',      // 进度条颜色
    borderColor: 'border-blue-500', // 左侧边框颜色
    textColor: 'text-blue-500',    // 图标颜色
  },
  // ... 其他配置
};
```

## 注意事项

1. **自动关闭时间**：
   - 普通消息默认 10 秒后自动关闭
   - 进度条消息在进度达到 100% 后 3 秒自动关闭
   - 设置 `duration: 0` 可以禁用自动关闭

2. **进度更新**：
   - 进度值会自动限制在 0-100 范围内
   - 只有带进度条的消息才能更新进度

3. **消息定位**：
   - 消息默认显示在屏幕右上角
   - 多条消息会垂直堆叠显示

4. **性能优化**：
   - 消息管理器使用单例模式，全局共享一个实例
   - 使用订阅模式更新 UI，避免不必要的重渲染

## 类型定义

所有类型定义位于 `types/notification.ts`：

```typescript
export type NotificationType = 'info' | 'warning' | 'error';

export interface NotificationMessage {
  id: string;
  type: NotificationType;
  message: string;
  duration?: number;
}

export interface NotificationProgress extends NotificationMessage {
  progress?: number; // 0-100
}

export type NotificationItem = NotificationMessage | NotificationProgress;
```
