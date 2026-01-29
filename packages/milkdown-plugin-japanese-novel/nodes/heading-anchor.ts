import type { Node } from '@milkdown/prose/model'
import type { SerializerState } from '@milkdown/transformer'
import { Fragment } from '@milkdown/prose/model'
import { headingAttr } from '@milkdown/preset-commonmark'
import { $nodeSchema } from '@milkdown/utils'

/**
 * Generate heading ID from title content using URL encoding
 */
function generateHeadingIdFromTitle(title: string): string {
  // Remove markdown formatting and trim
  const cleanTitle = title
    .replace(/[*_~`\[\]()]/g, '')
    .trim();
  
  // URL encode the title
  return encodeURIComponent(cleanTitle);
}

const headingIndex = Array(6)
  .fill(0)
  .map((_, i) => i + 1)

function serializeText(state: SerializerState, node: Node) {
  const lastIsHardBreak =
    node.childCount >= 1 && node.lastChild?.type.name === 'hardbreak'
  if (!lastIsHardBreak) {
    state.next(node.content)
    return
  }

  const contentArr: Node[] = []
  node.content.forEach((n, _, i) => {
    if (i === node.childCount - 1) return
    contentArr.push(n)
  })
  state.next(Fragment.fromArray(contentArr))
}



export const headingAnchorSchema = $nodeSchema('heading', (ctx) => {
  return {
    content: 'inline*',
    group: 'block',
    defining: true,
    attrs: {
      id: {
        default: '',
        validate: 'string',
      },
      level: {
        default: 1,
        validate: 'number',
      },
    },
    parseDOM: headingIndex.map((x) => ({
      tag: `h${x}`,
      getAttrs: (node) => {
        if (!(node instanceof HTMLElement)) return {}

        return { level: x, id: node.id }
      },
    })),
    toDOM: (node) => {
      // ID should be set by headingIdFixer plugin via appendTransaction
      const id = node.attrs.id as string
      return [
        `h${node.attrs.level}`,
        {
          ...ctx.get(headingAttr.key)(node),
          id,
        },
        0,
      ]
    },
    parseMarkdown: {
      match: ({ type }) => type === 'heading',
      runner: (state, node, type) => {
        const depth = node.depth as number
        
        // Extract text content from heading to generate ID
        let textContent = ''
        if (node.children && Array.isArray(node.children)) {
          textContent = node.children
            .map((child: any) => child.value || '')
            .join('')
        }
        
        // Generate ID from heading text content
        const id = generateHeadingIdFromTitle(textContent)
        
        state.openNode(type, { level: depth, id })
        state.next(node.children)
        state.closeNode()
      },
    },
    toMarkdown: {
      match: (node) => node.type.name === 'heading',
      runner: (state, node) => {
        // Simply serialize heading without any ID suffix
        state.openNode('heading', undefined, { depth: node.attrs.level })
        serializeText(state, node)
        state.closeNode()
      },
    },
  }
})
