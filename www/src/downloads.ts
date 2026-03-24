import './style.css'
import logoSvg from '/logo.svg?raw'
import iconApple from '~icons/mdi/apple?raw'
import iconWindows from '~icons/mdi/microsoft-windows?raw'
import iconLinux from '~icons/mdi/linux?raw'
import iconGithub from '~icons/mdi/github?raw'
import iconMicrosoft from '~icons/mdi/microsoft?raw'
import iconMicrosoftStore from '/icon-microsoft-store.svg?raw'
import { getRandomBackgroundImage } from './bg-images'

declare function gtag(command: 'event', action: string, params: Record<string, string>): void

/** Track download clicks in Google Analytics */
function trackDownload(type: 'hero' | 'platform' | 'store', platform: string, filename: string, version: string): void {
  if (typeof gtag === 'function') {
    gtag('event', 'download', {
      download_type: type,
      platform,
      filename,
      version,
    })
  }
}

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
const MICROSOFT_STORE_URL = 'https://apps.microsoft.com/detail/9mtc0ct16xg1'

/** Escape special HTML characters to prevent XSS in innerHTML contexts */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Validate a URL from external sources; only allow https:// to block javascript: and data: XSS vectors */
function safeUrl(url: string): string {
  return url.startsWith('https://') ? url : '#'
}

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

    // Add Microsoft Store link at the top of Windows downloads
    const storeItemHtml = key === 'windows'
      ? `
        <a href="${MICROSOFT_STORE_URL}" class="download-item" data-platform="windows" data-filename="Microsoft Store" target="_blank" rel="noopener noreferrer">
          <div class="download-item-info">
            <span class="download-item-label"><strong>Microsoft Store（おすすめ）</strong></span>
            <span class="download-item-filename">Microsoft Storeから入手</span>
          </div>
          <div class="download-item-meta">
            <span class="platform-icon">${iconMicrosoftStore}</span>
            <span class="download-icon">↗</span>
          </div>
        </a>
      `
      : ''

    const assetsHtml = platform.assets
      .map(
        (asset) => `
        <a href="${safeUrl(asset.url)}" class="download-item" data-platform="${key}" data-filename="${esc(asset.name)}" download>
          <div class="download-item-info">
            <span class="download-item-label">${asset.label}</span>
            <span class="download-item-filename">${esc(asset.name)}</span>
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
          ${storeItemHtml}${assetsHtml}
        </div>
      </div>
    `
  }).join('')

  const version = release.tag_name.replace(/^v/, '')

  interface HeroCta {
    href: string
    label: string
    icon: string
    isExternal: boolean
    meta?: string
  }

  const heroCta: HeroCta | null = (() => {
    if (currentOS === 'windows') {
      return {
        href: MICROSOFT_STORE_URL,
        label: 'Microsoft Store から入手',
        icon: iconMicrosoft,
        isExternal: true,
      }
    }
    if (!bestAsset) return null
    const { icon, label } = heroButtonInfo(bestAsset)
    return {
      href: bestAsset.url,
      label,
      icon,
      isExternal: false,
      meta: `v${version} · ${bestAsset.size}`,
    }
  })()

  const heroDownloadHtml = heroCta
    ? `
      <div class="hero-download">
        <a href="${safeUrl(heroCta.href)}" class="btn-hero-download" data-platform="${currentOS}" data-filename="${heroCta.isExternal ? 'Microsoft Store' : esc(bestAsset?.name || 'unknown')}" ${heroCta.isExternal ? 'target="_blank" rel="noopener noreferrer"' : 'download'}>
          <span class="btn-hero-download-icon">${heroCta.icon}</span>
          <span class="btn-hero-download-label">${heroCta.label}</span>
          ${heroCta.meta ? `<span class="btn-hero-download-meta">${esc(heroCta.meta)}</span>` : ''}
        </a>
        <p class="hero-download-hint">他のプラットフォームは下記をご覧ください</p>
        <a href="https://github.com/Iktahana/illusions" class="social-link" target="_blank" rel="noopener noreferrer">
          <span class="social-link-icon">${iconGithub}</span>
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
        <span class="release-version">v${esc(version)}</span>
        <span class="release-date">${formatDate(release.published_at)}</span>
        <a href="${safeUrl(release.html_url)}" class="release-link" target="_blank" rel="noopener">
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

  // Bind GA download tracking events
  const heroBtn = app.querySelector<HTMLAnchorElement>('.btn-hero-download')
  if (heroBtn) {
    heroBtn.addEventListener('click', () => {
      trackDownload(
        heroBtn.dataset.filename === 'Microsoft Store' ? 'store' : 'hero',
        heroBtn.dataset.platform ?? 'unknown',
        heroBtn.dataset.filename ?? 'unknown',
        version,
      )
    })
  }

  app.querySelectorAll<HTMLAnchorElement>('.download-item').forEach((item) => {
    item.addEventListener('click', () => {
      const isStore = item.dataset.filename === 'Microsoft Store'
      trackDownload(
        isStore ? 'store' : 'platform',
        item.dataset.platform ?? 'unknown',
        item.dataset.filename ?? 'unknown',
        version,
      )
    })
  })
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

const CACHE_KEY = 'illusions_release_cache'
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

interface ReleaseCache {
  data: GitHubRelease
  fetchedAt: number
}

function loadCache(): GitHubRelease | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const cache = JSON.parse(raw) as ReleaseCache
    if (Date.now() - cache.fetchedAt > CACHE_TTL_MS) return null
    return cache.data
  } catch {
    return null
  }
}

function saveCache(data: GitHubRelease): void {
  try {
    const cache: ReleaseCache = { data, fetchedAt: Date.now() }
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch {
    // localStorage unavailable — ignore
  }
}

// Serve from cache immediately if available, otherwise show loading
const cached = loadCache()
if (cached) {
  renderPage(cached, null)
} else {
  renderPage(null, null)

  fetch(API_URL, { headers: { Accept: 'application/vnd.github.v3+json' } })
    .then(async (res) => {
      if (!res.ok) {
        throw new Error(`GitHub API returned ${res.status}`)
      }
      const data = (await res.json()) as GitHubRelease
      saveCache(data)
      renderPage(data, null)
    })
    .catch((err: Error) => {
      renderPage(null, err.message)
    })
}
