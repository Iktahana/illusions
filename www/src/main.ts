import './style.css'
import { getRandomBackgroundImage } from './bg-images'
import logoSvg from '/logo.svg?raw'
import iconApple from '~icons/mdi/apple?raw'
import iconWindows from '~icons/mdi/microsoft-windows?raw'
import iconChrome from '~icons/mdi/google-chrome?raw'
import iconGithub from '~icons/mdi/github?raw'
const iconX = `<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`

// ランダムな背景画像を取得
const bgImageUrl = getRandomBackgroundImage()

if (bgImageUrl) {
  // 画像をプリロード
  const img = new Image()
  img.onload = () => {
    document.body.style.setProperty('--bg-image', `url('${bgImageUrl}')`)
  }
  img.onerror = () => {
    console.warn('Failed to load background image:', bgImageUrl)
  }
  img.src = bgImageUrl
} else {
  // 画像がない場合はグラデーション背景を維持
  console.info('No background images available, using gradient fallback')
}

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <nav class="top-nav">
    <a href="https://my.illusions.app" class="nav-login-link">ログイン / 新規登録</a>
    <button class="hamburger" id="hamburger-btn" aria-label="メニューを開く" aria-expanded="false">
      <span></span>
      <span></span>
      <span></span>
    </button>
    <div class="mobile-menu" id="mobile-menu">
      <a href="https://my.illusions.app" class="mobile-menu-link">ログイン / 新規登録</a>
    </div>
  </nav>
  <div class="hero">
    <div class="title-logo">${logoSvg}</div>
    <p class="tagline">
      縦書き、ルビ、縦中横、しっかり対応。<br/>
      文章分析から推敲支援まで、集中しやすい執筆環境。
  </p>

    <div class="cta-buttons">
      <a href="/downloads" class="btn btn-primary">
        <span class="btn-icon">${iconApple}</span>
        <span class="btn-icon">${iconWindows}</span>
        ダウンロード
      </a>
      <a href="https://illusions.app" class="btn btn-secondary" target="_blank">
        <span class="btn-icon">${iconChrome}</span>
        Chrome版を開く
      </a>
    </div>
    <a href="/downloads/" class="all-downloads-link">すべてのダウンロード →</a>

    <div class="features">
      <div class="feature-card">
        <span class="feature-icon" aria-hidden="true">✦</span>
        <h3>執筆に耽溺するための執筆環境</h3>
        <p>「illusions」は組版ソフトではなく、純粋な「執筆環境」です。煩雑なメニューや過剰な設定が溢れるWordの喧騒から逃れ、作家がただ「書くこと」だけに没入できるよう、極限まで削ぎ落としたミニマリズムを追求しました。</p>
      </div>
      <div class="feature-card">
        <span class="feature-icon" aria-hidden="true">◈</span>
        <h3>文章分析は、研ぎ澄まされた「鏡」である</h3>
        <p>illusionsにおける自然言語処理は、文体分析から物語の機微までを客観的に映し出し、作品を磨き上げるための「鏡」であり、最も頼れる「ツール」となります。</p>
      </div>
      <div class="feature-card">
        <span class="feature-icon" aria-hidden="true">◇</span>
        <h3>創作の聖域を守る — 絶対的なプライバシー</h3>
        <p>あなたのアイデアや言葉は、何者にも侵されない「聖域」であるべきです。illusionsは、あなたが綴った大切な原稿を学習素材として利用することは決してありません。データはクラウドではなく、常にあなた自身のパソコン内にのみ保存されます。</p>
      </div>
    </div>

    <a href="https://github.com/Iktahana/illusions" class="social-link" target="_blank" rel="noopener noreferrer">
      <span class="social-link-icon">${iconGithub}</span>
      GitHub
    </a>
    <a href="https://x.com/illusionsapp" class="social-link" target="_blank" rel="noopener noreferrer">
      <span class="social-link-icon">${iconX}</span>
      @illusionsapp
    </a>

    <footer class="site-footer">
      <a href="https://github.com/Iktahana/illusions/blob/main/TERMS.md" target="_blank" rel="noopener noreferrer">プライバシー・利用規約</a>
    </footer>
  </div>
`

// Hamburger menu toggle
const hamburgerBtn = document.getElementById('hamburger-btn')
const mobileMenu = document.getElementById('mobile-menu')

if (hamburgerBtn && mobileMenu) {
  hamburgerBtn.addEventListener('click', () => {
    const isOpen = hamburgerBtn.classList.toggle('is-open')
    hamburgerBtn.setAttribute('aria-expanded', String(isOpen))
    mobileMenu.classList.toggle('is-open')
  })

  // Close menu when clicking outside
  document.addEventListener('click', (e) => {
    if (
      mobileMenu.classList.contains('is-open') &&
      !hamburgerBtn.contains(e.target as Node) &&
      !mobileMenu.contains(e.target as Node)
    ) {
      hamburgerBtn.classList.remove('is-open')
      hamburgerBtn.setAttribute('aria-expanded', 'false')
      mobileMenu.classList.remove('is-open')
    }
  })
}
