import { Plugin, PluginKey } from '@milkdown/prose/state'
import type { Node } from '@milkdown/prose/model'

/**
 * Plugin to automatically add IDs to heading nodes that don't have them.
 * This ensures that headings created via commands or input rules get proper IDs.
 */
export function createHeadingIdFixerPlugin(generateId: (level: number) => string) {
  return new Plugin({
    key: new PluginKey('headingIdFixer'),
    appendTransaction(transactions, _oldState, newState) {
      // Check if any transaction modified the document
      const docChanged = transactions.some(transaction => transaction.docChanged)
      if (!docChanged) return null

      // Collect all headings that need IDs first
      const headingsToFix: Array<{ pos: number; level: number; attrs: Record<string, unknown> }> = []
      
      newState.doc.descendants((node: Node, pos: number) => {
        if (node.type.name === 'heading') {
          const currentId = node.attrs.id as string
          
          // If ID is missing or empty, mark for fixing
          if (!currentId || !currentId.trim()) {
            headingsToFix.push({
              pos,
              level: node.attrs.level as number,
              attrs: { ...node.attrs },
            })
          }
        }
      })

      if (headingsToFix.length === 0) return null

      // Apply all fixes in reverse order to avoid position shifts
      const tr = newState.tr
      for (let i = headingsToFix.length - 1; i >= 0; i--) {
        const { pos, level, attrs } = headingsToFix[i]
        const newId = generateId(level)
        tr.setNodeMarkup(pos, undefined, { ...attrs, id: newId })
      }

      return tr
    },
  })
}
