import './style.css'
import logoSvg from '/logo.svg?raw'
import { getRandomBackgroundImage } from './bg-images'

// GitHub release asset type
interface ReleaseAsset {
  name: string
  browser_download_url: string
  size: number
  download_count: number
}

interface GitHubRelease {
  tag_name: string
  name: string
  published_at: string
  html_url: string
  body: string
  assets: ReleaseAsset[]
}

// Platform detection
interface PlatformInfo {
  label: string
  icon: string
  assets: DownloadAsset[]
}

interface DownloadAsset {
  name: string
  url: string
  size: string
  label: string
}

const REPO = 'Iktahana/illusions'
const API_URL = `https://api.github.com/repos/${REPO}/releases/latest`

/** Format bytes to human-readable string */
function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Format ISO date to localized string */
function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

/** Determine platform label for a given asset filename */
function classifyAsset(name: string): { platform: string; label: string } | null {
  const lower = name.toLowerCase()

  // macOS
  if (lower.endsWith('.dmg')) {
    if (lower.includes('arm64') || lower.includes('aarch64')) {
      return { platform: 'macos', label: 'macOS (Apple Silicon / .dmg)' }
    }
    if (lower.includes('x64') || lower.includes('intel')) {
      return { platform: 'macos', label: 'macOS (Intel / .dmg)' }
    }
    return { platform: 'macos', label: 'macOS (.dmg)' }
  }
  if (lower.endsWith('.zip') && lower.includes('mac')) {
    if (lower.includes('arm64') || lower.includes('aarch64')) {
      return { platform: 'macos', label: 'macOS (Apple Silicon / .zip)' }
    }
    if (lower.includes('x64') || lower.includes('intel')) {
      return { platform: 'macos', label: 'macOS (Intel / .zip)' }
    }
    return { platform: 'macos', label: 'macOS (.zip)' }
  }

  // Windows
  if (lower.endsWith('.exe')) {
    if (lower.includes('setup') || lower.includes('install')) {
      return { platform: 'windows', label: 'Windows (インストーラー / .exe)' }
    }
    return { platform: 'windows', label: 'Windows (.exe)' }
  }
  if (lower.endsWith('.msi')) {
    return { platform: 'windows', label: 'Windows (.msi)' }
  }
  if (lower.endsWith('.msix')) {
    return { platform: 'windows', label: 'Windows (.msix)' }
  }
  if (lower.endsWith('.appx')) {
    return { platform: 'windows', label: 'Windows (.appx)' }
  }
  if (lower.endsWith('.nsis.7z')) {
    return { platform: 'windows', label: 'Windows (NSIS / .7z)' }
  }

  // Linux
  if (lower.endsWith('.appimage')) {
    return { platform: 'linux', label: 'Linux (.AppImage)' }
  }
  if (lower.endsWith('.deb')) {
    return { platform: 'linux', label: 'Linux (.deb)' }
  }
  if (lower.endsWith('.rpm')) {
    return { platform: 'linux', label: 'Linux (.rpm)' }
  }
  if (lower.endsWith('.snap')) {
    return { platform: 'linux', label: 'Linux (.snap)' }
  }
  if (lower.endsWith('.tar.gz') && (lower.includes('linux') || lower.includes('gnu'))) {
    return { platform: 'linux', label: 'Linux (.tar.gz)' }
  }

  return null
}

/** Group assets by platform */
function groupByPlatform(assets: ReleaseAsset[]): Map<string, PlatformInfo> {
  const platformConfig: Record<string, { label: string; icon: string }> = {
    macos: { label: 'macOS', icon: '🍎' },
    windows: { label: 'Windows', icon: '🪟' },
    linux: { label: 'Linux', icon: '🐧' },
  }

  const platforms = new Map<string, PlatformInfo>()

  for (const asset of assets) {
    const classification = classifyAsset(asset.name)
    if (!classification) continue

    const { platform, label } = classification

    if (!platforms.has(platform)) {
      const config = platformConfig[platform]
      if (!config) continue
      platforms.set(platform, {
        label: config.label,
        icon: config.icon,
        assets: [],
      })
    }

    platforms.get(platform)!.assets.push({
      name: asset.name,
      url: asset.browser_download_url,
      size: formatSize(asset.size),
      label,
    })
  }

  return platforms
}

/** Detect the user's current OS */
function detectOS(): string {
  const ua = navigator.userAgent.toLowerCase()
  if (ua.includes('mac')) return 'macos'
  if (ua.includes('win')) return 'windows'
  if (ua.includes('linux')) return 'linux'
  return 'unknown'
}

/** Render the downloads page */
function renderPage(release: GitHubRelease | null, error: string | null): void {
  const app = document.querySelector<HTMLDivElement>('#app')!

  if (error) {
    app.innerHTML = `
      <div class="hero">
        <a href="/" class="back-link">← トップページに戻る</a>
        <div class="title-logo title-logo-small">${logoSvg}</div>
        <h1 class="page-title">ダウンロード</h1>
        <div class="error-card">
          <p>リリース情報の取得に失敗しました。</p>
          <p class="error-detail">${error}</p>
          <a href="https://github.com/${REPO}/releases" class="btn btn-secondary" target="_blank" rel="noopener">
            GitHubで直接確認する →
          </a>
        </div>
      </div>
    `
    return
  }

  if (!release) {
    app.innerHTML = `
      <div class="hero">
        <a href="/" class="back-link">← トップページに戻る</a>
        <div class="title-logo title-logo-small">${logoSvg}</div>
        <h1 class="page-title">ダウンロード</h1>
        <div class="loading">
          <div class="loading-spinner"></div>
          <p>最新リリースを取得中...</p>
        </div>
      </div>
    `
    return
  }

  const platforms = groupByPlatform(release.assets)
  const currentOS = detectOS()

  // Sort: current OS first
  const sortOrder = ['macos', 'windows', 'linux']
  const sortedKeys = [...platforms.keys()].sort((a, b) => {
    if (a === currentOS) return -1
    if (b === currentOS) return 1
    return sortOrder.indexOf(a) - sortOrder.indexOf(b)
  })

  const platformCardsHtml = sortedKeys.map((key) => {
    const platform = platforms.get(key)!
    const isCurrent = key === currentOS
    const assetsHtml = platform.assets
      .map(
        (asset) => `
        <a href="${asset.url}" class="download-item" download>
          <div class="download-item-info">
            <span class="download-item-label">${asset.label}</span>
            <span class="download-item-filename">${asset.name}</span>
          </div>
          <div class="download-item-meta">
            <span class="download-item-size">${asset.size}</span>
            <span class="download-icon">↓</span>
          </div>
        </a>
      `
      )
      .join('')

    return `
      <div class="platform-card ${isCurrent ? 'platform-current' : ''}">
        <div class="platform-header">
          <span class="platform-icon">${platform.icon}</span>
          <h2 class="platform-name">${platform.label}</h2>
          ${isCurrent ? '<span class="platform-badge">お使いのOS</span>' : ''}
        </div>
        <div class="download-list">
          ${assetsHtml}
        </div>
      </div>
    `
  }).join('')

  const version = release.tag_name.replace(/^v/, '')

  app.innerHTML = `
    <div class="hero">
      <a href="/" class="back-link">← トップページに戻る</a>
      <div class="title-logo title-logo-small">${logoSvg}</div>
      <h1 class="page-title">ダウンロード</h1>

      <div class="release-info">
        <span class="release-version">v${version}</span>
        <span class="release-date">${formatDate(release.published_at)}</span>
        <a href="${release.html_url}" class="release-link" target="_blank" rel="noopener">
          リリースノート →
        </a>
      </div>

      <div class="platforms">
        ${platformCardsHtml}
      </div>

      <div class="web-version">
        <p>インストール不要で今すぐ使いたい方はこちら</p>
        <a href="https://illusions.app" class="btn btn-primary" target="_blank">
          Chrome版を開く
        </a>
      </div>
    </div>
  `
}

// Background image setup (same as main page)
const bgImageUrl = getRandomBackgroundImage()
if (bgImageUrl) {
  const img = new Image()
  img.onload = () => {
    document.body.style.setProperty('--bg-image', `url('${bgImageUrl}')`)
  }
  img.onerror = () => {
    console.warn('Failed to load background image:', bgImageUrl)
  }
  img.src = bgImageUrl
}

// Show loading state immediately
renderPage(null, null)

// Fetch latest release
fetch(API_URL)
  .then(async (res) => {
    if (!res.ok) {
      throw new Error(`GitHub API returned ${res.status}`)
    }
    const data = (await res.json()) as GitHubRelease
    renderPage(data, null)
  })
  .catch((err: Error) => {
    renderPage(null, err.message)
  })
