import { $nodeSchema } from '@milkdown/utils'

/**
 * 段落ノード（id属性をサポート）
 */
export const paragraphSchema = $nodeSchema('paragraph', () => {
  return {
    content: 'inline*',
    group: 'block',
    attrs: {
      id: {
        default: '',
        validate: 'string',
      },
    },
    parseDOM: [
      {
        tag: 'p',
        getAttrs: (node) => {
          if (!(node instanceof HTMLElement)) return {}
          return { id: node.id || '' }
        },
      },
    ],
    toDOM: (node) => {
      const id = node.attrs.id as string
      const attrs: Record<string, string> = {}
      
      if (id) {
        attrs.id = id
      }
      
      return ['p', attrs, 0]
    },
    parseMarkdown: {
      match: ({ type }) => type === 'paragraph',
      runner: (state, node, type) => {
        state.openNode(type, { id: '' })
        state.next(node.children)
        state.closeNode()
      },
    },
    toMarkdown: {
      match: (node) => node.type.name === 'paragraph',
      runner: (state, node) => {
        state.openNode('paragraph')
        state.next(node.content)
        state.closeNode()
      },
    },
  }
})
