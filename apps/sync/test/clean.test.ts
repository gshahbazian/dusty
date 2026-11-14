import { describe, expect, test } from 'vitest'

import { cleanHtml, excerptOf, toPlainText } from '../src/clean.ts'

const BASE = 'https://blog.example.com/posts/1'

const clean = (html: string) => cleanHtml(html, BASE)

describe('cleanHtml keeps ordinary article markup', () => {
  test('text formatting, lists, quotes and tables', () => {
    const html =
      '<h2>Hi</h2><p>A <strong>b</strong> <em>c</em></p><ul><li>x</li></ul>' +
      '<blockquote>q</blockquote><pre><code>let a</code></pre>' +
      '<table><tr><td colspan="2">t</td></tr></table>'

    expect(clean(html)).toBe(html)
  })

  test('links and images become absolute', () => {
    expect(clean('<a href="/about" title="t">a</a>')).toBe(
      '<a href="https://blog.example.com/about" title="t">a</a>'
    )
    expect(clean('<img src="img.png" alt="pic">')).toBe(
      '<img src="https://blog.example.com/posts/img.png" alt="pic">'
    )
  })

  test('mailto links are kept', () => {
    expect(clean('<a href="mailto:a@example.com">mail</a>')).toBe(
      '<a href="mailto:a@example.com">mail</a>'
    )
  })
})

describe('cleanHtml removes anything that could run or track', () => {
  test.each([
    ['script tags and their content', '<p>a</p><script>alert(1)</script>'],
    ['script with odd casing', '<p>a</p><ScRiPt>alert(1)</sCrIpT>'],
    ['style tags and their content', '<p>a</p><style>p{color:red}</style>'],
    ['iframes', '<p>a</p><iframe src="https://evil.test"></iframe>'],
    ['objects and embeds', '<p>a</p><object data="x"></object><embed src="x">'],
    [
      'forms and inputs',
      '<p>a</p><form action="https://evil.test"><input></form>',
    ],
    ['svg with script', '<p>a</p><svg><script>alert(1)</script></svg>'],
    ['comments', '<p>a</p><!-- <script>alert(1)</script> -->'],
    [
      'meta refresh',
      '<p>a</p><meta http-equiv="refresh" content="0;url=https://evil.test">',
    ],
    ['base tags', '<p>a</p><base href="https://evil.test/">'],
    ['an unclosed script', '<p>a</p><script>alert(1)'],
    ['an unclosed style', '<p>a</p><style>p{}'],
    ['a void embed', '<p>a</p><embed src="x">'],
    ['an unclosed iframe', '<p>a</p><iframe src="x">'],
    ['nested scripts', '<p>a</p><script><script>x</script></script>'],
  ])('%s', (_, html) => {
    expect(clean(html)).toBe('<p>a</p>')
  })

  test('event handlers are dropped', () => {
    expect(clean('<p onclick="alert(1)">a</p>')).toBe('<p>a</p>')
    expect(clean('<img src="x.png" onerror="alert(1)">')).toBe(
      '<img src="https://blog.example.com/posts/x.png">'
    )
  })

  test('style, class and id attributes are dropped', () => {
    expect(clean('<p style="position:fixed" class="c" id="i">a</p>')).toBe(
      '<p>a</p>'
    )
  })

  test.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    ' javascript:alert(1)',
    'java&#115;cript:alert(1)',
    '&#106;avascript:alert(1)',
    'vbscript:msgbox(1)',
    'data:text/html,<script>alert(1)</script>',
  ])('a link to %s loses its href', (href) => {
    expect(clean(`<a href="${href}">x</a>`)).toBe('<a>x</a>')
  })

  test('images only load over http(s)', () => {
    expect(clean('<img src="data:image/png;base64,AAAA">')).toBe('<img>')
    expect(clean('<img src="javascript:alert(1)">')).toBe('<img>')
  })

  test('an attribute cannot break out of its quotes', () => {
    const cleaned = clean(
      '<a href=\'https://ok.test/"onmouseover="alert(1)\'>x</a>'
    )

    expect(cleaned).not.toContain('onmouseover="')
  })

  test('upper-case attribute names are treated the same', () => {
    expect(clean('<a HREF="javascript:alert(1)" ONCLICK="x">x</a>')).toBe(
      '<a>x</a>'
    )
  })

  test('an entity-encoded quote cannot end the attribute', () => {
    expect(clean('<a title="&quot; onmouseover=&quot;alert(1)">x</a>')).toBe(
      '<a title="&quot; onmouseover=&quot;alert(1)">x</a>'
    )
  })

  test.each(['xmp', 'noembed', 'noframes', 'plaintext'])(
    'raw-text <%s> is dropped with its content',
    (tag) => {
      expect(clean(`<p>a</p><${tag}><script>alert(1)</script></${tag}>`)).toBe(
        '<p>a</p>'
      )
    }
  )

  test('text that looks like markup stays escaped', () => {
    expect(clean('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>')).toBe(
      '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>'
    )
  })

  test('unknown tags are removed but their text stays', () => {
    expect(clean('<p><marquee>hi</marquee></p>')).toBe('<p>hi</p>')
  })
})

describe('plain text', () => {
  test('tags go, entities are decoded, whitespace collapses', () => {
    expect(toPlainText('<p>A &amp; B</p>\n\n<p>C&nbsp;D</p>')).toBe(
      'A & B C D'.replace(' ', ' ')
    )
  })

  test('script content never reaches the text', () => {
    expect(toPlainText('<p>a</p><script>alert(1)</script>')).toBe('a')
  })

  test('paragraphs and lines are kept apart, inline text is not', () => {
    expect(toPlainText('<p>One</p><p>Two</p>')).toBe('One Two')
    expect(toPlainText('<p>a<br>b</p><ul><li>c</li><li>d</li></ul>')).toBe(
      'a b c d'
    )
    expect(toPlainText('<p>un<b>bold</b>ed</p>')).toBe('unbolded')
  })

  test('excerpts are cut on a word boundary', () => {
    const long = `<p>${'word '.repeat(100)}</p>`
    const excerpt = excerptOf(long)

    expect(excerpt?.length).toBeLessThanOrEqual(281)
    expect(excerpt?.endsWith('word…')).toBe(true)
  })

  test('empty content has no excerpt', () => {
    expect(excerptOf('<p> </p>')).toBeNull()
  })
})
