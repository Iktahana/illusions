import { Plugin, PluginKey } from '@milkdown/prose/state'
import { Decoration, DecorationSet } from '@milkdown/prose/view'
import type { Node } from '@milkdown/prose/model'

/**
 * Shift+Enter で挿入される hardbreak (`<br>`) の直後に、
 * 字下げ分のインデント用スペーサーを挿入するデコレーションプラグイン。
 *
 * CSS `text-indent` は段落の最初の行にしか適用されないため、
 * hardbreak 後の行は左端に揃ってしまう。このプラグインは
 * hardbreak ノードの直後にインライン・ブロックの空 span を挿入し、
 * 字下げと同じ幅のインデントを実現する。
 */
export function createHardbreakIndentPlugin(): Plugin {
  return new Plugin({
    key: new PluginKey('hardbreakIndent'),
    props: {
      decorations(state) {
        const decorations: Decoration[] = []

        state.doc.descendants((node: Node, pos: number) => {
          if (node.type.name !== 'paragraph') return

          // Scan children for hardbreak nodes
          node.forEach((child, offset) => {
            if (child.type.name === 'hardbreak') {
              // Insert spacer widget right after the hardbreak node
              const afterPos = pos + 1 + offset + child.nodeSize
              const widget = Decoration.widget(afterPos, () => {
                const spacer = document.createElement('span')
                spacer.className = 'mdi-hardbreak-indent'
                return spacer
              }, { side: -1 })
              decorations.push(widget)
            }
          })
        })

        return DecorationSet.create(state.doc, decorations)
      },
    },
  })
}
