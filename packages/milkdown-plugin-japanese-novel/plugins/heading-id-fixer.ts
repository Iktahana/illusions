import { Plugin, PluginKey } from '@milkdown/prose/state'
import type { Node } from '@milkdown/prose/model'

/**
 * 見出しの内容からアンカーIDを生成する（URLエンコード）
 */
function generateHeadingIdFromContent(node: Node): string {
  // 見出しノードから本文テキストを抽出
  let textContent = ''
  node.descendants((child) => {
    if (child.isText) {
      textContent += child.text
    }
  })
  
  // Markdown記法を除去して整形
  const cleanTitle = textContent
    .replace(/[*_~`\[\]()]/g, '')
    .trim()
  
  // URLエンコード
  return encodeURIComponent(cleanTitle)
}

/**
 * ID がない見出しに対して自動で ID を付与/修正するプラグイン。
 *
 * ユーザー操作（wrapInHeadingCommand 等）や入力ルールによって、
 * Markdown パーサを経由せずに見出しが作られるケースを補う。
 *
 * 通常の Markdown 読み込みでは parseMarkdown で ID が生成される。
 * それ以外の経路でも常に妥当な ID が付くようにする。
 */
export function createHeadingIdFixerPlugin() {
  return new Plugin({
    key: new PluginKey('headingIdFixer'),
    appendTransaction(transactions, _oldState, newState) {
      // 文書が変更されたときだけ処理する
      const docChanged = transactions.some(transaction => transaction.docChanged)
      if (!docChanged) return null

      // ID がない/内容変更で不一致になった見出しを探す
      const headingsToFix: Array<{ pos: number; node: Node; attrs: Record<string, unknown> }> = []
      
      newState.doc.descendants((node: Node, pos: number) => {
        if (node.type.name === 'heading') {
          const currentId = node.attrs.id as string
          const expectedId = generateHeadingIdFromContent(node)
          
          // ID がない、または内容変更で不一致になったものを修正対象にする
          if (!currentId || currentId !== expectedId) {
            headingsToFix.push({
              pos,
              node,
              attrs: { ...node.attrs },
            })
          }
        }
      })

      if (headingsToFix.length === 0) return null

      // 位置ずれを避けるため、後ろから順に適用する
      const tr = newState.tr
      for (let i = headingsToFix.length - 1; i >= 0; i--) {
        const { pos, node, attrs } = headingsToFix[i]
        const newId = generateHeadingIdFromContent(node)
        tr.setNodeMarkup(pos, undefined, { ...attrs, id: newId })
      }

      return tr
    },
  })
}
