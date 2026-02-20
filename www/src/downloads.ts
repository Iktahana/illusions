import './style.css'
import logoSvg from '/logo.svg?raw'
import iconApple from '~icons/mdi/apple?raw'
import iconWindows from '~icons/mdi/microsoft-windows?raw'
import iconLinux from '~icons/mdi/linux?raw'
import iconGithub from '~icons/mdi/github?raw'
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

  // macOS – arm64 builds always have "arm64" in the filename; everything else is Intel
  if (lower.endsWith('.dmg')) {
    if (lower.includes('arm64') || lower.includes('aarch64')) {
      return { platform: 'macos', label: 'macOS (Apple Silicon / .dmg)' }
    }
    return { platform: 'macos', label: 'macOS (Intel / .dmg)' }
  }
  if (lower.endsWith('.zip') && lower.includes('mac')) {
    if (lower.includes('arm64') || lower.includes('aarch64')) {
      return { platform: 'macos', label: 'macOS (Apple Silicon / .zip)' }
    }
    return { platform: 'macos', label: 'macOS (Intel / .zip)' }
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
    macos: { label: 'macOS', icon: iconApple },
    windows: { label: 'Windows', icon: iconWindows },
    linux: { label: 'Linux', icon: iconLinux },
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

/** Detect CPU architecture – best-effort for macOS Apple Silicon vs Intel */
function detectArch(): 'arm64' | 'x64' | 'unknown' {
  // 1. NavigatorUAData (Chromium 93+): most reliable when available
  const uaData = (navigator as Navigator & { userAgentData?: { architecture?: string } }).userAgentData
  if (uaData?.architecture) {
    return uaData.architecture === 'arm' ? 'arm64' : 'x64'
  }

  // 2. WebGL renderer heuristic – works in Safari & Firefox too
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl') ?? canvas.getContext('experimental-webgl')
    if (gl && gl instanceof WebGLRenderingContext) {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info')
      if (dbg) {
        const renderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) as string
        // Apple Silicon GPUs report "Apple M1", "Apple M2", "Apple M3", "Apple GPU", etc.
        if (/apple\s*(m\d|gpu)/i.test(renderer)) {
          return 'arm64'
        }
        // Intel iGPU on older Macs
        if (/intel/i.test(renderer)) {
          return 'x64'
        }
      }
    }
  } catch {
    // WebGL unavailable – fall through
  }

  // 3. Default to arm64 for macOS (most Macs sold since late 2020 are Apple Silicon)
  if (detectOS() === 'macos') {
    return 'arm64'
  }

  return 'unknown'
}

/** Pick the single best download asset for the user's detected platform + arch */
function findBestAsset(platforms: Map<string, PlatformInfo>): DownloadAsset | null {
  const os = detectOS()
  const platform = platforms.get(os)
  if (!platform || platform.assets.length === 0) return null

  if (os === 'macos') {
    const arch = detectArch()
    // Prefer .dmg; arm64 builds have "arm64" in the name, others are Intel
    const dmgs = platform.assets.filter((a) => a.name.toLowerCase().endsWith('.dmg'))
    if (dmgs.length > 0) {
      const isArm = (name: string): boolean => /arm64|aarch64/i.test(name)
      if (arch === 'arm64') {
        return dmgs.find((a) => isArm(a.name)) ?? dmgs[0]
      }
      if (arch === 'x64') {
        return dmgs.find((a) => !isArm(a.name)) ?? dmgs[0]
      }
      return dmgs[0]
    }
    return platform.assets[0]
  }

  if (os === 'windows') {
    // Prefer Setup.exe installer, then any .exe, then .msi
    const setupExe = platform.assets.find((a) => {
      const lower = a.name.toLowerCase()
      return lower.endsWith('.exe') && (lower.includes('setup') || lower.includes('install'))
    })
    if (setupExe) return setupExe
    const exe = platform.assets.find((a) => a.name.toLowerCase().endsWith('.exe'))
    if (exe) return exe
    const msi = platform.assets.find((a) => a.name.toLowerCase().endsWith('.msi'))
    if (msi) return msi
    return platform.assets[0]
  }

  if (os === 'linux') {
    // Prefer .AppImage, then .deb
    const appimage = platform.assets.find((a) => a.name.toLowerCase().endsWith('.appimage'))
    if (appimage) return appimage
    const deb = platform.assets.find((a) => a.name.toLowerCase().endsWith('.deb'))
    if (deb) return deb
    return platform.assets[0]
  }

  return platform.assets[0]
}

/** Icon SVG + label for the hero button */
function heroButtonInfo(asset: DownloadAsset): { icon: string; label: string } {
  const os = detectOS()
  if (os === 'macos') {
    const arch = detectArch()
    const chipLabel = arch === 'arm64' ? 'Apple Silicon' : arch === 'x64' ? 'Intel' : ''
    const label = chipLabel ? `macOS (${chipLabel}) 版をダウンロード` : 'macOS 版をダウンロード'
    return { icon: iconApple, label }
  }
  if (os === 'windows') return { icon: iconWindows, label: 'Windows 版をダウンロード' }
  if (os === 'linux') return { icon: iconLinux, label: 'Linux 版をダウンロード' }
  return { icon: '', label: asset.label }
}

/** Render the downloads page */
function renderPage(release: GitHubRelease | null, error: string | null): void {
  const app = document.querySelector<HTMLDivElement>('#app')!

  if (error) {
    app.innerHTML = `
      <div class="hero">
        <a href="/" class="back-link">← トップページに戻る</a>
        <a href="/" class="title-logo title-logo-small">${logoSvg}</a>
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
        <a href="/" class="title-logo title-logo-small">${logoSvg}</a>
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
  const bestAsset = findBestAsset(platforms)

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

  const heroInfo = bestAsset ? heroButtonInfo(bestAsset) : null

  const heroDownloadHtml = bestAsset && heroInfo
    ? `
      <div class="hero-download">
        <a href="${bestAsset.url}" class="btn-hero-download" download>
          <span class="btn-hero-download-icon">${heroInfo.icon}</span>
          <span class="btn-hero-download-label">${heroInfo.label}</span>
          <span class="btn-hero-download-meta">v${version} · ${bestAsset.size}</span>
        </a>
        <p class="hero-download-hint">他のプラットフォームは下記をご覧ください</p>
        <a href="https://github.com/Iktahana/illusions" class="github-link" target="_blank">
          <span class="github-link-icon">${iconGithub}</span>
          GitHub
        </a>
      </div>
    `
    : ''

  app.innerHTML = `
    <div class="hero">
      <a href="/" class="back-link">← トップページに戻る</a>
      <a href="/" class="title-logo title-logo-small">${logoSvg}</a>
      <h1 class="page-title">ダウンロード</h1>

      ${heroDownloadHtml}

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
