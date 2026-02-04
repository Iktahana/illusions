import { Plugin, PluginKey } from '@milkdown/prose/state'
import type { Node } from '@milkdown/prose/model'

/**
 * 場面転換（星号分隔符）に自動でIDを付与するプラグイン
 * 
 * ＊ または * のみの段落を検出して、separator-N の形式でIDを付与
 */
export function createSeparatorIdFixerPlugin() {
  let separatorCount = 0
  
  return new Plugin({
    key: new PluginKey('separatorIdFixer'),
    appendTransaction(transactions, _oldState, newState) {
      // 文書が変更されたときだけ処理する
      const docChanged = transactions.some(transaction => transaction.docChanged)
      if (!docChanged) return null

      separatorCount = 0
      const separatorsToFix: Array<{ pos: number; node: Node; attrs: Record<string, unknown> }> = []
      
      newState.doc.descendants((node: Node, pos: number) => {
        if (node.type.name === 'paragraph') {
          // 段落の内容を取得
          let textContent = ''
          node.descendants((child) => {
            if (child.isText) {
              textContent += child.text
            }
          })
          
          const trimmed = textContent.trim()
          
          // 星号と空白のみ、かつ星号が含まれている行かチェック
          if (/^[＊*\s]+$/.test(trimmed) && /[＊*]/.test(trimmed)) {
            separatorCount++
            const currentId = node.attrs.id as string
            const expectedId = `separator-${separatorCount}`
            
            // ID がない、またはカウントが変わったものを修正対象にする
            if (!currentId || currentId !== expectedId) {
              separatorsToFix.push({
                pos,
                node,
                attrs: { ...node.attrs },
              })
            }
          }
        }
      })

      if (separatorsToFix.length === 0) return null

      // 位置ずれを避けるため、後ろから順に適用する
      const tr = newState.tr
      separatorCount = 0
      
      // もう一度走査して正しいIDを設定
      newState.doc.descendants((node: Node, pos: number) => {
        if (node.type.name === 'paragraph') {
          let textContent = ''
          node.descendants((child) => {
            if (child.isText) {
              textContent += child.text
            }
          })
          
          const trimmed = textContent.trim()
          
          if (/^[＊*\s]+$/.test(trimmed) && /[＊*]/.test(trimmed)) {
            separatorCount++
            const expectedId = `separator-${separatorCount}`
            const currentId = node.attrs.id as string
            
            if (currentId !== expectedId) {
              tr.setNodeMarkup(pos, undefined, { ...node.attrs, id: expectedId })
            }
          }
        }
      })

      return tr.docChanged ? tr : null
    },
  })
}
