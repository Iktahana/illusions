import type { Node } from '@milkdown/prose/model'
import type { SerializerState } from '@milkdown/transformer'
import { Fragment } from '@milkdown/prose/model'
import { headingAttr } from '@milkdown/preset-commonmark'
import { $nodeSchema } from '@milkdown/utils'

/**
 * 見出しの内容からアンカーIDを生成する（URLエンコード）
 */
function generateHeadingIdFromTitle(title: string): string {
  // Markdown記法を除去して整形
  const cleanTitle = title
    .replace(/[*_~`\[\]()]/g, '')
    .trim();
  
  // URLエンコード
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
      // ID は headingIdFixer が appendTransaction 経由で設定する
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
        
        // 見出しの本文からID生成用テキストを抽出
        let textContent = ''
        if (node.children && Array.isArray(node.children)) {
          textContent = node.children
            .map((child: any) => child.value || '')
            .join('')
        }
        
        // 見出しテキストからIDを生成
        const id = generateHeadingIdFromTitle(textContent)
        
        state.openNode(type, { level: depth, id })
        state.next(node.children)
        state.closeNode()
      },
    },
    toMarkdown: {
      match: (node) => node.type.name === 'heading',
      runner: (state, node) => {
        // ID などの付加情報なしで見出しをシリアライズ
        state.openNode('heading', undefined, { depth: node.attrs.level })
        serializeText(state, node)
        state.closeNode()
      },
    },
  }
})
