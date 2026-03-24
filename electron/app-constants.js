/* eslint-disable no-console */
// App-wide constants shared across Electron main process modules

const isDev =
  process.env.NODE_ENV === 'development' || process.env.ELECTRON_DEV === '1'

const APP_NAME = 'illusions'

// Microsoft Store (APPX) ビルドかどうかを判定
// Store 版はストア経由で更新されるため、electron-updater を無効化する
const isMicrosoftStoreApp = process.windowsStore === true

module.exports = { isDev, APP_NAME, isMicrosoftStoreApp }
