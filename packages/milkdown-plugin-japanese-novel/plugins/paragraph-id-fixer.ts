import { Plugin, PluginKey } from '@milkdown/prose/state'
import type { Node } from '@milkdown/prose/model'

/**
 * すべてのブロック要素に段落番号IDを自動付与するプラグイン
 * 
 * 対象：
 * - paragraph (p) → id="1", id="2", ...
 * - heading (h1-h6) → data-para-id="3", data-para-id="4", ... (idは元のタイトルIDを保持)
 * - blockquote → id="5", id="6", ...
 * - その他のブロック要素
 * 
 * 見出しは既存のタイトルベースのIDを保持し、data-para-idに段落番号を設定する。
 * その他の要素はidに段落番号を設定する。
 * 
 * パフォーマンス最適化：
 * - Markdown読み込み時のみ実行（編集中は実行しない）
 * - プラグイン自身のトランザクションで無限ループを防止
 */
export function createParagraphIdFixerPlugin() {
  return new Plugin({
    key: new PluginKey('paragraphIdFixer'),
    appendTransaction(transactions, oldState, newState) {
      // このプラグイン自身が生成したトランザクションは無視（無限ループ防止）
      const isFromThisPlugin = transactions.some(
        tr => tr.getMeta('paragraphIdFixer') === true
      )
      if (isFromThisPlugin) return null
      
      // Markdown読み込み時のみ実行（addToHistory: false のトランザクション）
      const isMarkdownLoad = transactions.some(tr => tr.getMeta('addToHistory') === false)
      if (!isMarkdownLoad) return null
      
      // 文書が変更されたときだけ処理する
      const docChanged = transactions.some(transaction => transaction.docChanged)
      if (!docChanged) return null

      let paragraphNumber = 0
      const nodesToFix: Array<{ 
        pos: number
        node: Node
        expectedId: string
        isHeading: boolean
      }> = []
      
      // すべてのブロックノードを走査して段落番号を割り当てる
      newState.doc.descendants((node: Node, pos: number) => {
        // textblock（p, h1-h6等）のみ処理（blockquoteは一旦スキップ）
        if (!node.isTextblock) {
          return true
        }
        
        paragraphNumber++
        const expectedId = String(paragraphNumber)
        const isHeading = node.type.name === 'heading'
        
        if (isHeading) {
          // 見出しの場合：data-para-id をチェック
          const currentDataParaId = node.attrs.dataParaId as string
          if (currentDataParaId !== expectedId) {
            nodesToFix.push({
              pos,
              node,
              expectedId,
              isHeading: true,
            })
          }
        } else {
          // その他のテキストブロック：id をチェック
          const currentId = node.attrs.id as string
          if (currentId !== expectedId) {
            nodesToFix.push({
              pos,
              node,
              expectedId,
              isHeading: false,
            })
          }
        }
        
        return true
      })

      if (nodesToFix.length === 0) return null

      // 位置ずれを避けるため、後ろから順に適用する
      const tr = newState.tr
      
      // このプラグインが生成したトランザクションであることをマーク
      tr.setMeta('paragraphIdFixer', true)
      tr.setMeta('addToHistory', false)
      
      for (let i = nodesToFix.length - 1; i >= 0; i--) {
        const { pos, node, expectedId, isHeading } = nodesToFix[i]
        
        if (isHeading) {
          // 見出し：data-para-id を設定（id は保持）
          tr.setNodeMarkup(pos, undefined, {
            ...node.attrs,
            dataParaId: expectedId,
          })
        } else {
          // その他：id を設定
          tr.setNodeMarkup(pos, undefined, {
            ...node.attrs,
            id: expectedId,
          })
        }
      }

      return tr.docChanged ? tr : null
    },
  })
}
