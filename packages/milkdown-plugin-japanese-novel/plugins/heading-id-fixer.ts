import { Plugin, PluginKey } from '@milkdown/prose/state'
import type { Node } from '@milkdown/prose/model'

/**
 * Generate heading ID from title content using URL encoding
 */
function generateHeadingIdFromContent(node: Node): string {
  // Extract text content from heading node
  let textContent = ''
  node.descendants((child) => {
    if (child.isText) {
      textContent += child.text
    }
  })
  
  // Remove markdown formatting and trim
  const cleanTitle = textContent
    .replace(/[*_~`\[\]()]/g, '')
    .trim()
  
  // URL encode the title
  return encodeURIComponent(cleanTitle)
}

/**
 * Plugin to automatically add IDs to heading nodes that don't have them.
 * 
 * This plugin handles the case where headings are created via user commands (like wrapInHeadingCommand)
 * or input rules that bypass the markdown parser.
 * 
 * Normal markdown loading already generates IDs through parseMarkdown.
 * This plugin ensures all other heading creation paths also get valid IDs.
 */
export function createHeadingIdFixerPlugin() {
  return new Plugin({
    key: new PluginKey('headingIdFixer'),
    appendTransaction(transactions, _oldState, newState) {
      // Only process if document actually changed
      const docChanged = transactions.some(transaction => transaction.docChanged)
      if (!docChanged) return null

      // Find all headings without IDs or with outdated IDs
      const headingsToFix: Array<{ pos: number; node: Node; attrs: Record<string, unknown> }> = []
      
      newState.doc.descendants((node: Node, pos: number) => {
        if (node.type.name === 'heading') {
          const currentId = node.attrs.id as string
          const expectedId = generateHeadingIdFromContent(node)
          
          // Fix headings that don't have an ID or have wrong ID (content changed)
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

      // Apply fixes in reverse order to avoid position shifts
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
