import { isTag, isText, type ChildNode, type Element } from 'domhandler'
import { DomUtils, parseDocument } from 'htmlparser2'

/**
 * Article HTML comes from strangers, so only these tags and attributes
 * survive. No `style`, `class`, `id` or event handlers on anything. Links and
 * images must point at http(s) (links may also be `mailto:`).
 */
const ALLOWED: ReadonlyMap<string, ReadonlySet<string>> = new Map(
  Object.entries({
    a: ['href', 'title'],
    abbr: ['title'],
    b: [],
    blockquote: [],
    br: [],
    caption: [],
    cite: [],
    code: [],
    dd: [],
    del: [],
    div: [],
    dl: [],
    dt: [],
    em: [],
    figcaption: [],
    figure: [],
    h1: [],
    h2: [],
    h3: [],
    h4: [],
    h5: [],
    h6: [],
    hr: [],
    i: [],
    img: ['src', 'alt', 'title', 'width', 'height'],
    ins: [],
    li: [],
    mark: [],
    ol: ['start'],
    p: [],
    pre: [],
    q: [],
    s: [],
    small: [],
    span: [],
    strong: [],
    sub: [],
    sup: [],
    table: [],
    tbody: [],
    td: ['colspan', 'rowspan'],
    tfoot: [],
    th: ['colspan', 'rowspan'],
    thead: [],
    time: ['datetime'],
    tr: [],
    u: [],
    ul: [],
  }).map(([tag, attributes]) => [tag, new Set(attributes)])
)

/**
 * Removed together with everything inside them: code, styles, frames, forms,
 * and foreign content (SVG, MathML) whose parsing rules differ from HTML's.
 */
const DROPPED = new Set([
  'script',
  'style',
  'noscript',
  'template',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'svg',
  'math',
  'form',
  'textarea',
  'select',
  'button',
  'head',
  'title',
  'xmp',
  'plaintext',
  'noembed',
  'noframes',
])

const LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])
const IMAGE_PROTOCOLS = new Set(['http:', 'https:'])

/** Which URL schemes an attribute may use, or null if it holds no URL. */
const urlProtocols = (
  tag: string,
  name: string
): ReadonlySet<string> | null => {
  if (tag === 'a' && name === 'href') return LINK_PROTOCOLS

  if (tag === 'img' && name === 'src') return IMAGE_PROTOCOLS

  return null
}

/** A safe absolute URL, or null. Relative URLs resolve against `base`. */
const safeUrl = (
  raw: string,
  base: string | null,
  protocols: ReadonlySet<string>
): string | null => {
  try {
    const url = new URL(raw.trim(), base ?? undefined)

    if (!protocols.has(url.protocol)) return null

    return url.href
  } catch {
    return null
  }
}

/** Keep only allowed attributes, with any URL made absolute and checked. */
const allowedAttributes = (
  element: Element,
  allowed: ReadonlySet<string>,
  base: string | null
): Element['attribs'] => {
  const kept: Element['attribs'] = {}

  for (const [name, value] of Object.entries(element.attribs)) {
    if (!allowed.has(name)) continue

    const protocols = urlProtocols(element.name, name)

    if (protocols === null) {
      kept[name] = value
      continue
    }

    const url = safeUrl(value, base, protocols)

    if (url !== null) kept[name] = url
  }

  return kept
}

/** Replace an element with its children. */
const unwrap = (element: Element): void => {
  // A copy: moving each child out changes `element.children` as we go.
  for (const child of element.children.slice()) {
    DomUtils.prepend(element, child)
  }

  DomUtils.removeElement(element)
}

/** Apply the allowlist to a subtree, in place. */
const sanitize = (nodes: readonly ChildNode[], base: string | null): void => {
  // A copy: removing or unwrapping a node changes `nodes` as we go.
  for (const node of nodes.slice()) {
    if (isText(node)) continue

    if (!isTag(node)) {
      // Comments, CDATA, doctypes and processing instructions.
      DomUtils.removeElement(node)
      continue
    }

    const tag = node.name.toLowerCase()

    if (DROPPED.has(tag)) {
      DomUtils.removeElement(node)
      continue
    }

    sanitize(node.children, base)

    const allowed = ALLOWED.get(tag)

    if (allowed === undefined) {
      unwrap(node)
      continue
    }

    node.attribs = allowedAttributes(node, allowed, base)
  }
}

/**
 * Parse the way a browser does: entities are decoded, so `java&#115;cript:`
 * is seen for what it is, and an unclosed `<script>` swallows the rest of the
 * document instead of leaking its code into the article.
 */
const parse = (html: string) =>
  parseDocument(html, { decodeEntities: true, lowerCaseTags: true })

/**
 * Clean untrusted article HTML down to the allowlist. Unknown tags are
 * unwrapped (their text stays); dangerous ones are removed with their
 * content. The result is re-serialised, so every text and attribute value is
 * escaped again on the way out.
 */
export const cleanHtml = (html: string, base: string | null): string => {
  const document = parse(html)

  sanitize(document.children, base)

  return DomUtils.getOuterHTML(document, { encodeEntities: 'utf8' }).trim()
}

/** Elements that end a line: their text is kept apart from what follows. */
const BLOCKS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'br',
  'dd',
  'div',
  'dl',
  'dt',
  'figcaption',
  'figure',
  'footer',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'li',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'td',
  'th',
  'tr',
  'ul',
])

/** The text of nodes, a space after each block so paragraphs stay apart. */
const textOf = (nodes: readonly ChildNode[]): string =>
  nodes
    .map((node) => {
      if (isText(node)) return node.data

      if (!isTag(node)) return ''

      const inner = textOf(node.children)

      return BLOCKS.has(node.name) ? `${inner} ` : inner
    })
    .join('')

/** HTML (or text with entities) as plain text, whitespace collapsed. */
export const toPlainText = (html: string): string => {
  const document = parse(html)

  sanitize(document.children, null)

  return textOf(document.children).replaceAll(/\s+/g, ' ').trim()
}

const EXCERPT_LENGTH = 280

/** A short plain-text summary for list rows. */
export const excerptOf = (html: string): string | null => {
  const text = toPlainText(html)

  if (text === '') return null

  if (text.length <= EXCERPT_LENGTH) return text

  const cut = text.slice(0, EXCERPT_LENGTH)
  const lastSpace = cut.lastIndexOf(' ')
  const end = lastSpace > EXCERPT_LENGTH / 2 ? lastSpace : EXCERPT_LENGTH

  return `${cut.slice(0, end).trimEnd()}…`
}
