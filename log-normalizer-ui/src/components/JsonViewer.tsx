interface JsonViewerProps {
  data: unknown
  maxHeight?: number
}

const JsonViewer = ({ data, maxHeight = 320 }: JsonViewerProps) => {
  const html = highlightJson(JSON.stringify(data, null, 2))

  return (
    <div
      className="json-view"
      style={{ maxHeight }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

/** Applies <span> tags with color classes to JSON keys, strings, numbers, booleans, null. */
const highlightJson = (json: string): string =>
  json
    .replace(/("(?:\\.|[^"\\])*")\s*:/g, '<span class="jk">$1</span>:')
    .replace(/:\s*("(?:\\.|[^"\\])*")/g, (_m, v) => `: <span class="js">${v}</span>`)
    .replace(/:\s*(\d+\.?\d*)/g, ': <span class="jn">$1</span>')
    .replace(/:\s*(true|false)/g, ': <span class="jb">$1</span>')
    .replace(/:\s*(null)/g, ': <span class="jnull">$1</span>')

export default JsonViewer
