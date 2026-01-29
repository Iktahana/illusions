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
      const tr = newState.tr
      let modified = false

      // Check if any transaction modified the document
      const docChanged = transactions.some(transaction => transaction.docChanged)
      if (!docChanged) return null

      // Scan the document for headings without IDs
      newState.doc.descendants((node: Node, pos: number) => {
        if (node.type.name === 'heading') {
          const currentId = node.attrs.id as string
          
          // If ID is missing or empty, generate one
          if (!currentId || !currentId.trim()) {
            const level = node.attrs.level as number
            const newId = generateId(level)
            
            // Update the node attrs
            tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              id: newId,
            })
            modified = true
          }
        }
      })

      return modified ? tr : null
    },
  })
}
