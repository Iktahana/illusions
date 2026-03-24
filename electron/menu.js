/* eslint-disable no-console */
// Application menu construction and management

const { app, BrowserWindow, Menu, shell } = require('electron')
const { APP_NAME } = require('./app-constants')
const { getStorageManager } = require('./storage-ipc-handlers')

// UI state synced from renderer for menu checked states
let menuUiState = {
  compactMode: false,
  showParagraphNumbers: true,
  themeMode: 'auto', // 'auto' | 'light' | 'dark'
  autoCharsPerLine: true,
}

// Keymap overrides synced from renderer (only differences from defaults)
let keymapOverrides = {}

/**
 * Default Electron accelerator strings keyed by CommandId.
 * Mirrors the defaults in lib/keymap/shortcut-registry.ts.
 */
const DEFAULT_ACCELERATORS = {
  'file.save': 'CmdOrCtrl+S',
  'file.saveAs': 'CmdOrCtrl+Shift+S',
  'file.open': 'CmdOrCtrl+O',
  'file.newWindow': 'CmdOrCtrl+N',
  'file.newTab': 'CmdOrCtrl+T',
  'file.closeTab': 'CmdOrCtrl+W',
  'edit.undo': 'CmdOrCtrl+Z',
  'edit.redo': 'CmdOrCtrl+Y',
  'edit.pasteAsPlaintext': 'CmdOrCtrl+Shift+V',
  'edit.selectAll': 'CmdOrCtrl+A',
  'view.compactMode': 'CmdOrCtrl+Shift+M',
}

/**
 * Resolves the Electron accelerator for a command, applying user overrides.
 * @param {string} commandId
 * @returns {string | undefined}
 */
function resolveAccelerator(commandId) {
  const override = keymapOverrides[commandId]
  if (override === null) return undefined // intentionally unbound
  if (override) {
    // Convert KeyBinding { modifiers: [...], key: "s" } to "CmdOrCtrl+Shift+S"
    const keyMap = {
      Tab: 'Tab', Escape: 'Escape', Backspace: 'Backspace', Delete: 'Delete',
      Enter: 'Return', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
    }
    const key = keyMap[override.key] ?? override.key.toUpperCase()
    return [...override.modifiers, key].join('+')
  }
  return DEFAULT_ACCELERATORS[commandId]
}

function getMenuUiState() {
  return menuUiState
}

function setMenuUiState(state) {
  menuUiState = { ...menuUiState, ...state }
}

function getKeymapOverrides() {
  return keymapOverrides
}

function setKeymapOverrides(overrides) {
  keymapOverrides = overrides ?? {}
}

function buildApplicationMenu(recentProjects = []) {
  const isMac = process.platform === 'darwin'

  /** Send an IPC message to the focused window instead of mainWindow */
  const sendToFocused = (channel, ...args) => {
    const win = BrowserWindow.getFocusedWindow()
    if (win) win.webContents.send(channel, ...args)
  }

  const template = []

  // アプリ（macOSのみ）
  if (isMac) {
    template.push({
      label: APP_NAME,
      submenu: [
        { role: 'about', label: `${APP_NAME}について` },
        { type: 'separator' },
        { role: 'services', label: 'サービス' },
        { type: 'separator' },
        { role: 'hide', label: `${APP_NAME}を隠す` },
        { role: 'hideOthers', label: '他を隠す' },
        { role: 'unhide', label: 'すべてを表示' },
        { type: 'separator' },
        { role: 'quit', label: `${APP_NAME}を終了` },
      ],
    })
  }

  // ファイル
  template.push({
    label: 'ファイル',
    submenu: [
      {
        label: '新規ウィンドウ',
        accelerator: resolveAccelerator('file.newWindow'),
        click: () => {
          // Defer require to avoid circular dependency with window-manager.js
          const { createWindow } = require('./window-manager')
          createWindow({ showWelcome: true })
        },
      },
      {
        label: '最近のプロジェクトを開く',
        submenu: recentProjects.length > 0
          ? recentProjects.map((project) => ({
              label: project.name,
              click: () => {
                sendToFocused('menu-open-recent-project', project.id)
              },
            }))
          : [{ label: '項目なし', enabled: false }],
      },
      {
        label: 'プロジェクトを開く',
        click: () => {
          sendToFocused('menu-open-project')
        },
      },
      { type: 'separator' },
      {
        label: 'ファイルを開く...',
        accelerator: resolveAccelerator('file.open'),
        click: () => {
          sendToFocused('menu-open-triggered')
        },
      },
      {
        label: '保存',
        accelerator: resolveAccelerator('file.save'),
        click: () => {
          sendToFocused('menu-save-triggered')
        },
      },
      {
        label: '別名で保存...',
        accelerator: resolveAccelerator('file.saveAs'),
        click: () => {
          sendToFocused('menu-save-as-triggered')
        },
      },
      { type: 'separator' },
      {
        label: 'エクスポート',
        submenu: [
          {
            label: 'PDF としてエクスポート...',
            click: () => sendToFocused('menu-export-pdf'),
          },
          {
            label: 'EPUB としてエクスポート...',
            click: () => sendToFocused('menu-export-epub'),
          },
          {
            label: 'DOCX としてエクスポート...',
            click: () => sendToFocused('menu-export-docx'),
          },
        ],
      },
      { type: 'separator' },
      {
        label: '新しいタブ',
        accelerator: resolveAccelerator('file.newTab'),
        click: () => {
          sendToFocused('menu-new-tab')
        },
      },
      {
        label: 'タブを閉じる',
        accelerator: resolveAccelerator('file.closeTab'),
        click: () => {
          sendToFocused('menu-close-tab')
        },
      },
      ...(isMac ? [] : [{ type: 'separator' }]),
      ...(isMac ? [] : [{ role: 'quit', label: '終了' }]),
    ],
  })

  // 編集
  template.push({
    label: '編集',
    submenu: [
      { role: 'undo', label: '元に戻す' },
      { role: 'redo', label: 'やり直す' },
      { type: 'separator' },
      { role: 'cut', label: '切り取り' },
      { role: 'copy', label: 'コピー' },
      { role: 'paste', label: '貼り付け' },
      {
        label: 'プレーンテキストとして貼り付け',
        accelerator: resolveAccelerator('edit.pasteAsPlaintext'),
        click: () => {
          sendToFocused('menu-paste-as-plaintext')
        },
      },
      { type: 'separator' },
      { role: 'selectAll', label: 'すべて選択' },
    ],
  })

  // 書式
  template.push({
    label: '書式',
    submenu: [
      {
        label: '行間',
        submenu: [
          { label: '広くする', accelerator: 'CmdOrCtrl+]', click: () => sendToFocused('menu-format', 'lineHeight', 'increase') },
          { label: '狭くする', accelerator: 'CmdOrCtrl+[', click: () => sendToFocused('menu-format', 'lineHeight', 'decrease') },
        ],
      },
      {
        label: '段落間隔',
        submenu: [
          { label: '広くする', click: () => sendToFocused('menu-format', 'paragraphSpacing', 'increase') },
          { label: '狭くする', click: () => sendToFocused('menu-format', 'paragraphSpacing', 'decrease') },
        ],
      },
      {
        label: '字下げ',
        submenu: [
          { label: '深くする', click: () => sendToFocused('menu-format', 'textIndent', 'increase') },
          { label: '浅くする', click: () => sendToFocused('menu-format', 'textIndent', 'decrease') },
          { label: 'なし', click: () => sendToFocused('menu-format', 'textIndent', 'none') },
        ],
      },
      { type: 'separator' },
      {
        label: '1行あたりの文字数',
        submenu: [
          {
            label: '自動',
            type: 'checkbox',
            checked: menuUiState.autoCharsPerLine,
            click: () => sendToFocused('menu-format', 'charsPerLine', 'auto'),
          },
          { type: 'separator' },
          { label: '増やす', enabled: !menuUiState.autoCharsPerLine, click: () => sendToFocused('menu-format', 'charsPerLine', 'increase') },
          { label: '減らす', enabled: !menuUiState.autoCharsPerLine, click: () => sendToFocused('menu-format', 'charsPerLine', 'decrease') },
        ],
      },
      { type: 'separator' },
      {
        label: '段落番号を表示',
        type: 'checkbox',
        checked: menuUiState.showParagraphNumbers,
        click: () => sendToFocused('menu-format', 'paragraphNumbers', 'toggle'),
      },
    ],
  })

  // 表示
  template.push({
    label: '表示',
    submenu: [
      { role: 'reload', label: '再読み込み' },
      { role: 'forceReload', label: '強制再読み込み' },
      { role: 'toggleDevTools', label: '開発者ツールを切り替え' },
      { type: 'separator' },
      { role: 'resetZoom', label: '実際のサイズ' },
      { role: 'zoomIn', label: '拡大' },
      { role: 'zoomOut', label: '縮小' },
      { type: 'separator' },
      { role: 'togglefullscreen', label: '全画面表示を切り替え' },
    ],
  })

  // ウィンドウ
  template.push({
    label: 'ウィンドウ',
    submenu: [
      {
        label: 'コンパクトモード',
        type: 'checkbox',
        checked: menuUiState.compactMode,
        accelerator: resolveAccelerator('view.compactMode'),
        click: () => {
          sendToFocused('menu-toggle-compact-mode')
        },
      },
      {
        label: 'ダークモード',
        submenu: [
          { label: '自動', type: 'radio', checked: menuUiState.themeMode === 'auto', click: () => sendToFocused('menu-theme', 'auto') },
          { label: 'オフ', type: 'radio', checked: menuUiState.themeMode === 'light', click: () => sendToFocused('menu-theme', 'light') },
          { label: 'オン', type: 'radio', checked: menuUiState.themeMode === 'dark', click: () => sendToFocused('menu-theme', 'dark') },
        ],
      },
      { type: 'separator' },
      ...(isMac ? [
        { role: 'minimize', label: '最小化' },
        { role: 'zoom', label: '拡大/縮小' },
        { type: 'separator' },
        { role: 'front', label: 'すべてを手前に移動' },
        { type: 'separator' },
        { role: 'window', label: 'ウィンドウ' },
      ] : [
        { role: 'minimize', label: '最小化' },
      ]),
    ],
  })

  // ヘルプ
  template.push({
    label: 'ヘルプ',
    submenu: [
      {
        label: 'アップデートを確認',
        click: () => {
          // Defer require to avoid circular dependency with auto-updater.js
          const { checkForUpdates } = require('./auto-updater')
          checkForUpdates(true)
        },
      },
      { type: 'separator' },
      {
        label: `バージョン ${app.getVersion()}`,
        enabled: false,
      },
      { type: 'separator' },
      {
        label: '公式サイトへ',
        click: () => {
          shell.openExternal('https://www.illusions.app/')
        },
      },
    ],
  })

  return template
}

/** Rebuild the application menu with fresh recent projects from SQLite */
async function rebuildApplicationMenu() {
  try {
    const manager = getStorageManager()
    const projects = await manager.getRecentProjects()
    const menu = Menu.buildFromTemplate(buildApplicationMenu(projects))
    Menu.setApplicationMenu(menu)
  } catch (error) {
    console.error('[Main] Failed to rebuild menu:', error)
    // Fallback: build menu without recent projects
    const menu = Menu.buildFromTemplate(buildApplicationMenu())
    Menu.setApplicationMenu(menu)
  }
}

module.exports = {
  buildApplicationMenu,
  rebuildApplicationMenu,
  getMenuUiState,
  setMenuUiState,
  getKeymapOverrides,
  setKeymapOverrides,
}
