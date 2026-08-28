import { describe, expect, it } from 'vitest'
import { crc32 } from 'node:zlib'
import { chunkText } from '../server/chunking.js'
import { detectFormat, extractText } from '../server/extraction.js'
import { StubOcrEngine, UnavailableOcrEngine } from '../server/ocr.js'

// --- minimal ZIP (store) writer to produce a valid DOCX for mammoth ---
const zipStore = (files: Array<{ name: string; data: Buffer }>): Buffer => {
  const chunks: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const file of files) {
    const nameBuf = Buffer.from(file.name, 'utf8')
    const crc = crc32(file.data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4) // version
    local.writeUInt16LE(0, 6) // flags
    local.writeUInt16LE(0, 8) // method (store)
    local.writeUInt16LE(0, 10) // time
    local.writeUInt16LE(0, 12) // date
    local.writeUInt32LE(crc >>> 0, 14)
    local.writeUInt32LE(file.data.length, 18) // compressed size
    local.writeUInt32LE(file.data.length, 22) // uncompressed size
    local.writeUInt16LE(nameBuf.length, 26)
    local.writeUInt16LE(0, 28) // extra len
    chunks.push(local, nameBuf, file.data)

    const cd = Buffer.alloc(46)
    cd.writeUInt32LE(0x02014b50, 0)
    cd.writeUInt16LE(20, 4)
    cd.writeUInt16LE(20, 6)
    cd.writeUInt16LE(0, 8)
    cd.writeUInt16LE(0, 10)
    cd.writeUInt16LE(0, 12)
    cd.writeUInt16LE(0, 14)
    cd.writeUInt32LE(crc >>> 0, 16)
    cd.writeUInt32LE(file.data.length, 20)
    cd.writeUInt32LE(file.data.length, 24)
    cd.writeUInt16LE(nameBuf.length, 28)
    cd.writeUInt32LE(offset, 42)
    central.push(cd, nameBuf)
    offset += 30 + nameBuf.length + file.data.length
  }
  const centralData = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(centralData.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...chunks, centralData, end])
}

const minimalPdf = (text: string): Buffer => {
  const content = `BT /F1 12 Tf 72 720 Td (${text.replace(/[()\\]/g, ' ').slice(0, 60)}) Tj ET`
  return Buffer.from(`%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj
4 0 obj << /Length ${content.length} >> stream
${content}
endstream endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
trailer << /Root 1 0 R >>
%%EOF`)
}

const minimalDocx = (text: string): Buffer => zipStore([
  {
    name: '[Content_Types].xml',
    data: Buffer.from('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
  },
  {
    name: '_rels/.rels',
    data: Buffer.from('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
  },
  {
    name: 'word/document.xml',
    data: Buffer.from(`<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`),
  },
])

describe('format detection', () => {
  it('maps mime types and extensions to formats', () => {
    expect(detectFormat('a.pdf', 'application/pdf')).toBe('pdf')
    expect(detectFormat('a.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('docx')
    expect(detectFormat('a.txt', 'text/plain')).toBe('txt')
    expect(detectFormat('a.csv', 'text/csv')).toBe('csv')
    expect(detectFormat('scan.png', 'image/png')).toBe('image')
    expect(detectFormat('noext', 'application/octet-stream')).toBe('unknown')
  })
})

describe('text extraction', () => {
  it('extracts plain text (txt/md/csv)', async () => {
    const txt = await extractText(Buffer.from('hello world'), 'txt', 'a.txt')
    expect(txt.text).toBe('hello world')
    expect(txt.ocrRequired).toBe(false)
  })

  it('strips HTML tags and scripts', async () => {
    const html = await extractText(Buffer.from('<h1>Title</h1><p>Body</p><script>evil()</script>'), 'html', 'a.html')
    expect(html.text).toContain('Title')
    expect(html.text).toContain('Body')
    expect(html.text).not.toContain('evil()')
  })

  it('extracts text from a real PDF', async () => {
    const pdf = await extractText(minimalPdf('Hello Smart-Corp'), 'pdf', 'a.pdf')
    expect(pdf.text).toContain('Hello Smart-Corp')
    expect(pdf.ocrRequired).toBe(false)
  })

  it('extracts text from a real DOCX (mammoth)', async () => {
    const docx = await extractText(minimalDocx('Docx body content'), 'docx', 'a.docx')
    expect(docx.text).toContain('Docx body content')
  })

  it('fails closed for corrupt PDF', async () => {
    await expect(extractText(Buffer.from('not a pdf at all'), 'pdf', 'bad.pdf')).rejects.toThrow()
  })

  it('fails closed for unsupported format', async () => {
    await expect(extractText(Buffer.from('x'), 'unknown', 'a.bin')).rejects.toThrow()
  })

  it('marks xlsx/pptx as requiring a structured parser (no silent empty)', async () => {
    await expect(extractText(Buffer.from('x'), 'xlsx', 'a.xlsx')).rejects.toThrow()
  })

  it('flags images for OCR', async () => {
    const image = await extractText(Buffer.from([1, 2, 3]), 'image', 'scan.png')
    expect(image.ocrRequired).toBe(true)
    expect(image.text).toBe('')
  })
})

describe('semantic chunking', () => {
  const metadata = { documentId: 'doc-1', tenantId: 't-1', versionId: 'v-1', source: 'wiki' }

  it('preserves lineage metadata and content hash on every chunk', () => {
    const chunks = chunkText('First paragraph with enough words.\n\nSecond paragraph.', metadata)
    expect(chunks.length).toBeGreaterThan(0)
    for (const chunk of chunks) {
      expect(chunk.metadata).toEqual(metadata)
      expect(chunk.contentHash).toMatch(/^[0-9a-f]{64}$/)
      expect(chunk.tokenCount).toBeGreaterThan(0)
    }
  })

  it('splits on heading boundaries and records section labels', () => {
    const chunks = chunkText('# Introduction\nThis is the intro.\n\n# Conclusion\nThis is the end.', metadata)
    const sections = chunks.map((c) => c.sectionLabel)
    expect(sections).toContain('Introduction')
    expect(sections).toContain('Conclusion')
  })

  it('attaches page numbers from page markers', () => {
    const chunks = chunkText('Content one.\n\n-- page 2 --\n\nContent two.', metadata)
    const pageTwo = chunks.find((c) => c.content.includes('Content two'))
    expect(pageTwo?.pageNumber).toBe(2)
  })

  it('respects the token budget and produces multiple chunks for long text', () => {
    const longText = Array.from({ length: 300 }, (_, i) => `Sentence number ${i} with several words.`).join('\n\n')
    const chunks = chunkText(longText, metadata, { maxTokens: 100 })
    expect(chunks.length).toBeGreaterThan(1)
    // Every chunk is within ~budget + overlap.
    for (const chunk of chunks) {
      expect(chunk.tokenCount).toBeLessThanOrEqual(100 + 60)
    }
  })
})

describe('OCR engines', () => {
  it('stub engine returns deterministic echo (test-only)', async () => {
    const result = await new StubOcrEngine().recognize(Buffer.from('abc'))
    expect(result.text).toBe(`ocr:${Buffer.from('abc').toString('base64')}`)
    expect(result.confidence).toBe(95)
  })

  it('unavailable engine fails closed', async () => {
    await expect(new UnavailableOcrEngine().recognize()).rejects.toThrow()
  })
})
