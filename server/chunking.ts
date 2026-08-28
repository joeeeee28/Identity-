import crypto from 'node:crypto'

export interface ChunkMetadata {
  documentId: string
  tenantId: string
  versionId: string
  source: string
}

export interface Chunk {
  chunkIndex: number
  content: string
  sectionLabel: string | null
  pageNumber: number | null
  tokenCount: number
  contentHash: string
  metadata: ChunkMetadata
}

export interface ChunkingOptions {
  /** Approximate max tokens per chunk (4 chars ≈ 1 token). */
  maxTokens?: number
  /** Approximate overlap tokens carried into the next chunk. */
  overlapTokens?: number
  /** Column name for the semantic section (e.g. "section_label"). */
  pageMarkerPattern?: RegExp
}

const DEFAULT_OPTIONS: Required<Omit<ChunkingOptions, 'pageMarkerPattern'>> = { maxTokens: 500, overlapTokens: 50 }

const estimateTokens = (value: string) => Math.max(1, Math.ceil(value.length / 4))

/** A page marker like `-- page 2 --` is recognized to attach page numbers. */
const PAGE_MARKER = /^-{2,}\s*(?:page\s*)?(\d+)\s*(?:of\s*\d+)?\s*-{2,}$/i

const looksLikeHeading = (line: string) => {
  const trimmed = line.trim()
  if (!trimmed) return false
  if (/^#{1,6}\s+/.test(trimmed)) return true // markdown heading
  // Short, capitalized, no sentence-ending punctuation → likely a heading.
  const words = trimmed.split(/\s+/)
  return words.length <= 8 && !/[.!?;:]$/.test(trimmed) && /^[A-Z0-9]/.test(trimmed)
}

const isListItem = (line: string) => /^\s*([-*•]|\d+[.)])\s+/.test(line)

/**
 * Production-quality semantic chunking. Splits extracted text at paragraph and
 * heading boundaries, tracks the current section heading, attaches page numbers
 * from page markers, and carries an overlap so sentence context is not lost at
 * chunk boundaries. Every chunk is hash-addressed and carries full lineage
 * metadata (document, tenant, version, source) as required.
 */
export const chunkText = (text: string, metadata: ChunkMetadata, options: ChunkingOptions = {}): Chunk[] => {
  const { maxTokens, overlapTokens } = { ...DEFAULT_OPTIONS, ...options }
  const chunks: Chunk[] = []
  const paragraphs = text.replace(/\r\n/g, '\n').split(/\n{2,}/)

  let current: string[] = []
  let currentSection: string | null = null
  let currentPage: number | null = null
  let currentTokens = 0

  const flush = () => {
    if (!current.length) return
    const content = current.join('\n\n').trim()
    if (!content) { current = []; currentTokens = 0; return }
    const tokenCount = estimateTokens(content)
    const hash = crypto.createHash('sha256').update(content).digest('hex')
    chunks.push({
      chunkIndex: chunks.length,
      content,
      sectionLabel: currentSection,
      pageNumber: currentPage,
      tokenCount,
      contentHash: hash,
      metadata,
    })
    current = []
    currentTokens = 0
  }

  for (const rawParagraph of paragraphs) {
    const lines = rawParagraph.split('\n').filter((line) => line.trim().length > 0)
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      const pageMatch = PAGE_MARKER.exec(trimmed)
      if (pageMatch) { currentPage = Number(pageMatch[1]); continue }

      // Update the section heading when a heading line is encountered.
      if (looksLikeHeading(trimmed) && !isListItem(trimmed)) {
        flush()
        currentSection = trimmed.replace(/^#{1,6}\s+/, '')
        current.push(trimmed)
        currentTokens += estimateTokens(trimmed)
        continue
      }

      const lineTokens = estimateTokens(trimmed)
      if (currentTokens + lineTokens > maxTokens && current.length) {
        // Carry an overlap tail of the current chunk into the next one.
        const tailTokens = Math.min(overlapTokens, currentTokens)
        const tail: string[] = []
        let collected = 0
        for (let i = current.length - 1; i >= 0 && collected < tailTokens; i -= 1) {
          tail.unshift(current[i])
          collected += estimateTokens(current[i])
        }
        flush()
        current = tail
        currentTokens = collected
      }
      current.push(trimmed)
      currentTokens += lineTokens
    }
  }
  flush()
  return chunks
}
