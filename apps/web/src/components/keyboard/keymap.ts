/**
 * Every keyboard shortcut, in one table. Key handling and the `?` overlay
 * both read it, so the overlay is always the truth about what is bound.
 */
export type Command =
  | 'down'
  | 'up'
  | 'scrollDown'
  | 'scrollUp'
  | 'pageDown'
  | 'pageUp'
  | 'first'
  | 'last'
  | 'halfPageDown'
  | 'halfPageUp'
  | 'open'
  | 'close'
  | 'openOriginal'
  | 'toggleRead'
  | 'markAllAbove'
  | 'undo'
  | 'refresh'
  | 'nextFeed'
  | 'previousFeed'
  | 'goToAllUnread'
  | 'goToSettings'
  | 'help'

export interface Binding {
  readonly command: Command
  /** Each way to type it, as key tokens: `['g', 'g']`, `['Ctrl-d']`. */
  readonly sequences: readonly (readonly string[])[]
  /** What it does on a list. */
  readonly list: string
  /** What it does with an article open, when that differs. */
  readonly article?: string
  /** Takes a count, as in `5j`. */
  readonly counted?: boolean
}

export const BINDINGS: readonly Binding[] = [
  {
    command: 'down',
    sequences: [['j']],
    list: 'Next row',
    article: 'Open the next article',
    counted: true,
  },
  {
    command: 'up',
    sequences: [['k']],
    list: 'Previous row',
    article: 'Open the previous article',
    counted: true,
  },
  {
    command: 'scrollDown',
    sequences: [['ArrowDown']],
    list: 'Next row',
    article: 'Scroll the article down',
    counted: true,
  },
  {
    command: 'scrollUp',
    sequences: [['ArrowUp']],
    list: 'Previous row',
    article: 'Scroll the article up',
    counted: true,
  },
  {
    command: 'pageDown',
    sequences: [['Space']],
    list: 'Half a page down',
    article: 'Scroll the article a page down',
  },
  {
    command: 'pageUp',
    sequences: [['Shift-Space']],
    list: 'Half a page up',
    article: 'Scroll the article a page up',
  },
  { command: 'first', sequences: [['g', 'g']], list: 'First row' },
  { command: 'last', sequences: [['G']], list: 'Last row' },
  {
    command: 'halfPageDown',
    sequences: [['Ctrl-d']],
    list: 'Half a page down',
    article: 'Scroll the article half a page down',
  },
  {
    command: 'halfPageUp',
    sequences: [['Ctrl-u']],
    list: 'Half a page up',
    article: 'Scroll the article half a page up',
  },
  {
    command: 'open',
    sequences: [['o'], ['Enter']],
    list: 'Open the article',
    article: 'Nothing (already open)',
  },
  {
    command: 'close',
    sequences: [['Escape'], ['q']],
    list: 'Nothing (no article open)',
    article: 'Close the article',
  },
  {
    command: 'openOriginal',
    sequences: [['v']],
    list: 'Open the original page in a new tab',
  },
  { command: 'toggleRead', sequences: [['m']], list: 'Mark read or unread' },
  {
    command: 'markAllAbove',
    sequences: [['A']],
    list: 'Mark all above as read',
  },
  { command: 'undo', sequences: [['u']], list: 'Undo the last mark' },
  { command: 'refresh', sequences: [['r']], list: 'Refresh' },
  { command: 'nextFeed', sequences: [[']']], list: 'Next feed' },
  { command: 'previousFeed', sequences: [['[']], list: 'Previous feed' },
  {
    command: 'goToAllUnread',
    sequences: [['g', 'a']],
    list: 'Go to all unread',
  },
  {
    command: 'goToSettings',
    sequences: [['g', 's']],
    list: 'Go to settings',
  },
  { command: 'help', sequences: [['?']], list: 'Show these shortcuts' },
]

const LABELS = new Map([
  ['Escape', 'Esc'],
  ['ArrowDown', '↓'],
  ['ArrowUp', '↑'],
])

/** How a sequence is written in the overlay: `gg`, `Ctrl-d`, `Esc`, `↓`. */
export const sequenceLabel = (sequence: readonly string[]): string =>
  sequence.map((token) => LABELS.get(token) ?? token).join('')
