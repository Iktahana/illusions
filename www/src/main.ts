import './style.css'
import { getRandomBackgroundImage } from './bg-images'
import logoSvg from '/logo.svg?raw'
import iconApple from '~icons/mdi/apple?raw'
import iconWindows from '~icons/mdi/microsoft-windows?raw'
import iconChrome from '~icons/mdi/google-chrome?raw'

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

const ua = navigator.userAgent.toLowerCase()
const isApple = ua.includes('mac') || ua.includes('iphone') || ua.includes('ipad')
const downloadIcon = isApple ? iconApple : iconWindows
const downloadLabel = isApple ? 'macOS版をダウンロード' : 'Windows版をダウンロード'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div class="hero">
    <div class="logo">✨</div>
    <div class="title-logo">${logoSvg}</div>
    <p class="tagline">
      縦書き、ルビ、縦中横、しっかり対応。<br/>
      AI校正支援から文章分析まで、集中しやすい執筆環境。
  </p>

    <div class="cta-buttons">
      <a href="/downloads" class="btn btn-primary">
        <span class="btn-icon">${downloadIcon}</span>
        ${downloadLabel}
      </a>
      <a href="https://illusions.app" class="btn btn-secondary" target="_blank">
        <span class="btn-icon">${iconChrome}</span>
        Chrome版を開く
      </a>
    </div>

    <div class="features">
      <div class="feature-card">
        <span class="feature-icon">🖋️</span>
        <h3>執筆に耽溺するための執筆環境</h3>
        <p>「illusions」は組版ソフトではなく、純粋な「執筆環境」です。煩雑なメニューや過剰な設定が溢れるWordの喧騒から逃れ、作家がただ「書くこと」だけに没入できるよう、極限まで削ぎ落としたミニマリズムを追求しました。</p>
      </div>
      <div class="feature-card">
        <span class="feature-icon">🪞</span>
        <h3>AIは作家の代わりではなく、研ぎ澄まされた「鏡」である</h3>
        <p>AI自体は物語を作ることができません。illusionsにおけるNLP（自然言語処理）は、文体分析から物語の機微までを客観的に映し出し、作品を磨き上げるための「鏡」であり、最も頼れる「ツール」となります。</p>
      </div>
      <div class="feature-card">
        <span class="feature-icon">🔒</span>
        <h3>創作の聖域を守る — 絶対的なプライバシー</h3>
        <p>あなたのアイデアや言葉は、何者にも侵されない「聖域」であるべきです。illusionsは、あなたが綴った大切な原稿をAIの学習素材として利用することは決してありません。データはクラウドではなく、常にあなた自身のパソコン内にのみ保存されます。</p>
      </div>
    </div>
  </div>
`
