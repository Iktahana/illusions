import type { Node } from '@milkdown/prose/model'
import type { SerializerState } from '@milkdown/transformer'
import { Fragment } from '@milkdown/prose/model'
import { headingAttr, headingIdGenerator } from '@milkdown/preset-commonmark'
import { $nodeSchema } from '@milkdown/utils'

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
  const getId = ctx.get(headingIdGenerator.key)

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
      const id = (node.attrs.id as string) || getId(node)
      return [
        `h${node.attrs.level}`,
        {
          ...ctx.get(headingAttr.key)(node),
          id,
          'data-md-anchor': id,
        },
        0,
      ]
    },
    parseMarkdown: {
      match: ({ type }) => type === 'heading',
      runner: (state, node, type) => {
        const depth = node.depth as number
        const anchorId = (node as { data?: { anchorId?: string } }).data?.anchorId ?? ''
        state.openNode(type, { level: depth, id: anchorId })
        state.next(node.children)
        state.closeNode()
      },
    },
    toMarkdown: {
      match: (node) => node.type.name === 'heading',
      runner: (state, node) => {
        const id = (node.attrs.id as string) || getId(node)
        state.openNode('heading', undefined, { depth: node.attrs.level })
        serializeText(state, node)
        if (id) {
          state.addNode('text', undefined, ` {#${id}}`)
        }
        state.closeNode()
      },
    },
  }
})
