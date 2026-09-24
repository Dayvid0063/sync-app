// Minimal Markdown → HTML for model replies: paragraphs, headings, lists, code, bold/italic.
// Everything is HTML-escaped first, so the output is safe for v-html. Tolerates partial
// (still-streaming) input.

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }
const escape = (s: string) => s.replace(/[&<>"']/g, c => ESCAPES[c]!)

function inline(s: string) {
  return escape(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
}

export function renderMarkdown(src: string): string {
  const lines = src.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let para: string[] = []
  let list: { tag: 'ul' | 'ol', items: string[] } | null = null

  const flushPara = () => {
    if (para.length) out.push(`<p>${para.map(inline).join('<br>')}</p>`)
    para = []
  }
  const flushList = () => {
    if (list) out.push(`<${list.tag}>${list.items.map(i => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`)
    list = null
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!

    if (line.trimStart().startsWith('```')) {
      flushPara(); flushList()
      const code: string[] = []
      while (++i < lines.length && !lines[i]!.trimStart().startsWith('```')) code.push(lines[i]!)
      out.push(`<pre><code>${escape(code.join('\n'))}</code></pre>`)
      continue
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/)
    if (heading) {
      flushPara(); flushList()
      const level = Math.min(heading[1]!.length + 2, 6) // keep headings small inside bubbles
      out.push(`<h${level}>${inline(heading[2]!)}</h${level}>`)
      continue
    }

    const bullet = line.match(/^\s*[-*•]\s+(.*)$/)
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/)
    if (bullet || numbered) {
      flushPara()
      const tag = bullet ? 'ul' : 'ol'
      if (list?.tag !== tag) { flushList(); list = { tag, items: [] } }
      list!.items.push((bullet ?? numbered)![1]!)
      continue
    }

    if (!line.trim()) { flushPara(); flushList(); continue }
    flushList()
    para.push(line)
  }
  flushPara(); flushList()
  return out.join('')
}
