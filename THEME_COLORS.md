# 主题颜色使用指南

## 概述

本项目使用 CSS 变量统一管理主题颜色，自动支持亮色/暗色模式切换。

## 颜色变量系统

### 背景色 (Background)

| Tailwind Class | CSS Variable | 用途 | 亮色 | 暗色 |
|----------------|--------------|------|------|------|
| `bg-background` | `--background` | 主背景 | `#ffffff` | `#171717` |
| `bg-background-secondary` | `--background-secondary` | 次要背景 | `#f8fafc` | `#262626` |
| `bg-background-tertiary` | `--background-tertiary` | 三级背景 | `#f1f5f9` | `#404040` |
| `bg-background-elevated` | `--background-elevated` | 浮层/卡片 | `#ffffff` | `#262626` |

### 文字色 (Foreground)

| Tailwind Class | CSS Variable | 用途 | 亮色 | 暗色 |
|----------------|--------------|------|------|------|
| `text-foreground` | `--foreground` | 主文字 | `#0f172a` | `#f5f5f5` |
| `text-foreground-secondary` | `--foreground-secondary` | 次要文字 | `#475569` | `#d4d4d4` |
| `text-foreground-tertiary` | `--foreground-tertiary` | 三级文字 | `#64748b` | `#a3a3a3` |
| `text-foreground-muted` | `--foreground-muted` | 弱化文字 | `#94a3b8` | `#737373` |

### 边框色 (Border)

| Tailwind Class | CSS Variable | 用途 | 亮色 | 暗色 |
|----------------|--------------|------|------|------|
| `border-border` | `--border` | 主边框 | `#e2e8f0` | `#404040` |
| `border-border-secondary` | `--border-secondary` | 次要边框 | `#cbd5e1` | `#525252` |

### 强调色 (Accent)

| Tailwind Class | CSS Variable | 用途 | 亮色 | 暗色 |
|----------------|--------------|------|------|------|
| `bg-accent` | `--accent` | 强调背景 | `#6366f1` | `#6366f1` |
| `text-accent-foreground` | `--accent-foreground` | 强调文字 | `#ffffff` | `#ffffff` |
| `bg-accent-light` | `--accent-light` | 浅色强调 | `#eef2ff` | `#312e81` |
| `bg-accent-hover` | `--accent-hover` | 悬停状态 | `#4f46e5` | `#4f46e5` |

### 交互状态 (Interactive)

| Tailwind Class | CSS Variable | 用途 | 亮色 | 暗色 |
|----------------|--------------|------|------|------|
| `hover:bg-hover` | `--hover` | 悬停背景 | `#f1f5f9` | `#262626` |
| `bg-active` | `--active` | 激活状态 | `#e0e7ff` | `#312e81` |

### 状态色 (Status)

| Tailwind Class | CSS Variable | 用途 | 颜色 |
|----------------|--------------|------|------|
| `text-success` / `bg-success` | `--success` | 成功 | `#10b981` |
| `text-warning` / `bg-warning` | `--warning` | 警告 | `#f59e0b` |
| `text-error` / `bg-error` | `--error` | 错误 | `#ef4444` |
| `text-info` / `bg-info` | `--info` | 信息 | `#3b82f6` |

## 使用示例

### ✅ 推荐用法（自动适配主题）

```tsx
// 主容器
<div className="bg-background text-foreground">

// 次要区域
<div className="bg-background-secondary border border-border">

// 按钮
<button className="bg-accent text-accent-foreground hover:bg-accent-hover">

// 标题
<h1 className="text-foreground">

// 次要文字
<p className="text-foreground-secondary">

// 边框
<div className="border border-border">

// 悬停效果
<button className="hover:bg-hover">

// 激活状态
<button className="bg-active">
```

### ❌ 不推荐用法（需要手动管理暗色模式）

```tsx
// ❌ 不要这样写，需要手动添加 dark: 前缀
<div className="bg-white dark:bg-neutral-900">
<div className="text-slate-900 dark:text-neutral-100">
<div className="border-slate-200 dark:border-neutral-700">
```

## 迁移指南

### 旧 → 新颜色映射

#### 背景色
```
bg-white                    → bg-background
bg-slate-50 / bg-slate-100  → bg-background-secondary
bg-slate-200                → bg-background-tertiary
dark:bg-neutral-900         → bg-background (自动)
dark:bg-neutral-800         → bg-background-secondary (自动)
```

#### 文字色
```
text-slate-800 / text-slate-900  → text-foreground
text-slate-600 / text-slate-700  → text-foreground-secondary
text-slate-500                   → text-foreground-tertiary
text-slate-400                   → text-foreground-muted
```

#### 边框色
```
border-slate-200             → border-border
border-slate-300             → border-border-secondary
dark:border-neutral-700      → border-border (自动)
```

#### 强调色
```
bg-indigo-100               → bg-accent-light
bg-indigo-600               → bg-accent
text-indigo-700             → text-foreground (on accent-light)
hover:bg-indigo-700         → hover:bg-accent-hover
```

#### 交互状态
```
hover:bg-slate-100          → hover:bg-hover
bg-indigo-50 (active)       → bg-active
```

## 注意事项

1. **不需要再使用 `dark:` 前缀** - 所有颜色会自动适配主题
2. **保持语义化** - 使用有意义的名称而不是具体颜色值
3. **统一维护** - 所有主题颜色在 `globals.css` 中集中管理
4. **易于扩展** - 需要新颜色时，在 CSS 变量中添加即可

## 特殊情况

某些特殊组件（如 Milkdown 编辑器）可能需要继续使用特定颜色类，这些情况保持原样即可。
