import './style.css'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div class="hero">
    <div class="logo">✨</div>
    <h1>Illusions</h1>
    <p class="tagline">日本語小説執筆のためのエディタ</p>

    <div class="cta-buttons">
      <a href="https://illusions.app" class="btn btn-primary">
        Web版を開く
      </a>
      <a href="https://github.com/Iktahana/illusions/releases" class="btn btn-secondary">
        デスクトップ版をダウンロード
      </a>
    </div>

    <div class="features">
      <div class="feature-card">
        <h3>📝 MDI形式対応</h3>
        <p>ルビ、縦中横など日本語小説に必要な機能をサポート</p>
      </div>
      <div class="feature-card">
        <h3>🎨 美しいエディタ</h3>
        <p>集中できるミニマルなインターフェース</p>
      </div>
      <div class="feature-card">
        <h3>💾 自動保存</h3>
        <p>作業内容を自動的に保存し、データ損失を防ぎます</p>
      </div>
    </div>
  </div>
`
