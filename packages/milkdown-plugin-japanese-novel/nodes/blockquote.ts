import { $nodeSchema } from '@milkdown/utils'

/**
 * 引用ブロック（id属性をサポート）
 */
export const blockquoteSchema = $nodeSchema('blockquote', () => {
  return {
    content: 'block+',
    group: 'block',
    defining: true,
    attrs: {
      id: {
        default: '',
        validate: 'string',
      },
    },
    parseDOM: [
      {
        tag: 'blockquote',
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
      
      return ['blockquote', attrs, 0]
    },
    parseMarkdown: {
      match: ({ type }) => type === 'blockquote',
      runner: (state, node, type) => {
        state.openNode(type, { id: '' })
        state.next(node.children)
        state.closeNode()
      },
    },
    toMarkdown: {
      match: (node) => node.type.name === 'blockquote',
      runner: (state, node) => {
        state.openNode('blockquote')
        state.next(node.content)
        state.closeNode()
      },
    },
  }
})
