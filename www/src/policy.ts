import './style.css'
import logoSvg from '/logo.svg?raw'
import { getRandomBackgroundImage } from './bg-images'

/** Minimal markdown-to-HTML converter for TERMS.md */
function markdownToHtml(md: string): string {
  const lines = md.split('\n')
  const htmlLines: string[] = []
  let inList = false
  let inSubList = false

  for (const line of lines) {
    const trimmed = line.trimEnd()

    // Horizontal rule
    if (/^---+$/.test(trimmed)) {
      if (inSubList) { htmlLines.push('</ul></li>'); inSubList = false }
      if (inList) { htmlLines.push('</ul>'); inList = false }
      htmlLines.push('<hr />')
      continue
    }

    // Headings
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/)
    if (headingMatch) {
      if (inSubList) { htmlLines.push('</ul></li>'); inSubList = false }
      if (inList) { htmlLines.push('</ul>'); inList = false }
      const level = headingMatch[1].length
      htmlLines.push(`<h${level}>${inlineFormat(headingMatch[2])}</h${level}>`)
      continue
    }

    // Sub-list item (4 spaces or tab + *)
    const subListMatch = trimmed.match(/^[\t ]{2,}\*\s+(.+)$/)
    if (subListMatch) {
      if (!inSubList) {
        htmlLines.push('<ul>')
        inSubList = true
      }
      htmlLines.push(`<li>${inlineFormat(subListMatch[1])}</li>`)
      continue
    }

    // Top-level list item
    const listMatch = trimmed.match(/^\*\s+(.+)$/)
    if (listMatch) {
      if (inSubList) { htmlLines.push('</ul></li>'); inSubList = false }
      if (!inList) { htmlLines.push('<ul>'); inList = true }
      htmlLines.push(`<li>${inlineFormat(listMatch[1])}`)
      // Check if next lines are sub-list; if not, close <li> now
      // We'll handle closing in sub-list detection above
      continue
    }

    // Empty line
    if (trimmed === '') {
      if (inSubList) { htmlLines.push('</ul></li>'); inSubList = false }
      if (inList) { htmlLines.push('</ul>'); inList = false }
      continue
    }

    // Regular paragraph
    if (inSubList) { htmlLines.push('</ul></li>'); inSubList = false }
    if (inList) { htmlLines.push('</ul>'); inList = false }
    htmlLines.push(`<p>${inlineFormat(trimmed)}</p>`)
  }

  if (inSubList) htmlLines.push('</ul></li>')
  if (inList) htmlLines.push('</ul>')

  return htmlLines.join('\n')
}

/** Format inline markdown: bold, code, links */
function inlineFormat(text: string): string {
  return text
    // Links: [text](url)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    // Bold: **text**
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    // Inline code: `text`
    .replace(/`([^`]+)`/g, '<code>$1</code>')
}

function renderPage(contentHtml: string | null, error: string | null): void {
  const app = document.querySelector<HTMLDivElement>('#app')!

  if (error) {
    app.innerHTML = `
      <div class="hero">
        <a href="/" class="back-link">&larr; トップページに戻る</a>
        <a href="/" class="title-logo title-logo-small">${logoSvg}</a>
        <h1 class="page-title">利用規約・プライバシーポリシー</h1>
        <div class="error-card">
          <p>規約の読み込みに失敗しました。</p>
          <p class="error-detail">${error}</p>
          <a href="https://github.com/Iktahana/illusions/blob/main/TERMS.md" class="btn btn-secondary" target="_blank" rel="noopener">
            GitHubで直接確認する &rarr;
          </a>
        </div>
      </div>
    `
    return
  }

  if (!contentHtml) {
    app.innerHTML = `
      <div class="hero">
        <a href="/" class="back-link">&larr; トップページに戻る</a>
        <a href="/" class="title-logo title-logo-small">${logoSvg}</a>
        <h1 class="page-title">利用規約・プライバシーポリシー</h1>
        <div class="loading">
          <div class="loading-spinner"></div>
          <p>読み込み中...</p>
        </div>
      </div>
    `
    return
  }

  app.innerHTML = `
    <div class="hero">
      <a href="/" class="back-link">&larr; トップページに戻る</a>
      <a href="/" class="title-logo title-logo-small">${logoSvg}</a>
      <h1 class="page-title">利用規約・プライバシーポリシー</h1>
      <div class="policy-content">
        ${contentHtml}
      </div>
    </div>
  `
}

// Background image setup
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

// Show loading state
renderPage(null, null)

// Fetch and render TERMS.md
fetch('/TERMS.md')
  .then(async (res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const md = await res.text()
    renderPage(markdownToHtml(md), null)
  })
  .catch((err: Error) => {
    renderPage(null, err.message)
  })
