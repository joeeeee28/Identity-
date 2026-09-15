import mammoth from 'mammoth'
import { PDFParse, PasswordException } from 'pdf-parse'
import { AppError } from './errors.js'

export type DocumentFormat = 'txt' | 'md' | 'csv' | 'html' | 'pdf' | 'docx' | 'xlsx' | 'pptx' | 'image' | 'unknown'

export interface ExtractedText {
  text: string
  format: DocumentFormat
  ocrRequired: boolean
  pageCount: number | null
  warnings: string[]
}

/** Hard cap on extracted text (≈ 4 MB of UTF-8) to bound worker memory. */
const MAX_EXTRACTED_CHARS = 4_000_000

const enforceLimit = (text: string, fileName: string): string => {
  if (text.length <= MAX_EXTRACTED_CHARS) return text
  throw new AppError(413, 'EXTRACTION_TOO_LARGE', `The document "${fileName}" produced more extracted text than the ${MAX_EXTRACTED_CHARS}-character limit.`)
}

const MIME_FORMATS: Record<string, DocumentFormat> = {
  'text/plain': 'txt', 'text/markdown': 'md', 'text/csv': 'csv', 'text/html': 'html',
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'image/png': 'image', 'image/jpeg': 'image', 'image/tiff': 'image',
}

const EXT_FORMATS: Record<string, DocumentFormat> = {
  txt: 'txt', md: 'md', markdown: 'md', csv: 'csv', html: 'html', htm: 'html',
  pdf: 'pdf', docx: 'docx', xlsx: 'xlsx', pptx: 'pptx', png: 'image', jpg: 'image', jpeg: 'image', tiff: 'image',
}

export const detectFormat = (fileName: string, mimeType: string): DocumentFormat => {
  if (MIME_FORMATS[mimeType]) return MIME_FORMATS[mimeType]
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  return EXT_FORMATS[ext] ?? 'unknown'
}

/** UTF-8 decode with a safe fallback for invalid byte sequences. */
const decodeUtf8 = (buffer: Buffer): string => {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buffer) } catch { return buffer.toString('utf8') }
}

const stripHtml = (html: string): string =>
  html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

/**
 * Pure text extraction for the natively-supported formats (txt, md, csv, html)
 * plus PDF (pdf-parse) and DOCX (mammoth). XLSX/PPTX/image require a specialist
 * parser or OCR and are marked `ocrRequired`/unsupported — the worker fails
 * closed rather than silently producing empty or fabricated content.
 */
export const extractText = async (buffer: Buffer, format: DocumentFormat, fileName: string): Promise<ExtractedText> => {
  const warnings: string[] = []
  switch (format) {
    case 'txt':
    case 'md':
    case 'csv':
      return { text: enforceLimit(decodeUtf8(buffer).replace(/\0/g, '').trim(), fileName), format, ocrRequired: false, pageCount: null, warnings }

    case 'html':
      return { text: enforceLimit(stripHtml(decodeUtf8(buffer)), fileName), format, ocrRequired: false, pageCount: null, warnings }

    case 'pdf': {
      try {
        const parser = new PDFParse({ data: buffer })
        const result = await parser.getText()
        const pageCount = result.pages?.length ?? null
        return { text: enforceLimit(result.text.trim(), fileName), format, ocrRequired: false, pageCount, warnings }
      } catch (error) {
        if (error instanceof PasswordException) throw new AppError(422, 'PDF_PASSWORD_PROTECTED', `The PDF "${fileName}" is password protected.`)
        // A scanned PDF yields little/no text → mark for OCR.
        throw new AppError(422, 'PDF_UNREADABLE', `The PDF "${fileName}" could not be parsed. It may be a scanned image requiring OCR.`)
      }
    }

    case 'docx': {
      const result = await mammoth.extractRawText({ buffer })
      if (result.messages.length) warnings.push(...result.messages.map((m) => m.message))
      return { text: enforceLimit(result.value.trim(), fileName), format, ocrRequired: false, pageCount: null, warnings }
    }

    case 'xlsx':
    case 'pptx':
      throw new AppError(422, 'FORMAT_PARSER_REQUIRED', `The ${format.toUpperCase()} format requires a structured parser that is not yet wired. The document was quarantined and not ingested.`)

    case 'image':
      return { text: '', format, ocrRequired: true, pageCount: null, warnings: ['Image content requires OCR.'] }

    default:
      throw new AppError(415, 'UNSUPPORTED_FORMAT', `The document "${fileName}" has an unsupported format.`)
  }
}
