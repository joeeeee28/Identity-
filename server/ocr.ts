import { spawn } from 'node:child_process'
import { AppError } from './errors.js'

export interface OcrResult {
  text: string
  confidence: number
  language: string
  pages: number
}

export interface OcrEngine {
  readonly name: string
  recognize(buffer: Buffer, options?: { language?: string }): Promise<OcrResult>
}

/**
 * Tesseract OCR engine. Invokes the `tesseract` CLI. When the binary is absent
 * (or fails), recognition fails closed with OCR_UNAVAILABLE — a scanned document
 * is never silently treated as empty. This is the production boundary; it is not
 * live-tested in CI (no binary), so its behavior is exercised via the test engine.
 */
export class TesseractOcrEngine implements OcrEngine {
  readonly name = 'tesseract'

  async recognize(buffer: Buffer, options: { language?: string } = {}): Promise<OcrResult> {
    const language = options.language ?? 'eng'
    const result = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      const child = spawn('tesseract', ['stdin', 'stdout', '-l', language, '--psm', '3', 'tsv'], { stdio: ['pipe', 'pipe', 'pipe'] })
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', (d) => { stdout += d })
      child.stderr.on('data', (d) => { stderr += d })
      child.on('error', (error) => reject(error))
      child.on('close', () => resolve({ stdout, stderr }))
      child.stdin.write(buffer)
      child.stdin.end()
    }).catch(() => { throw new AppError(503, 'OCR_UNAVAILABLE', 'The OCR engine is not available on this worker.') })

    // tesseract TSV: one row per recognized token with confidence in column 11.
    const lines = result.stdout.split('\n').filter((line) => line && !line.startsWith('level'))
    let text = ''
    let confidenceSum = 0
    let confidenceCount = 0
    for (const line of lines) {
      const cols = line.split('\t')
      if (cols.length < 12) continue
      const token = cols[11]
      const conf = Number(cols[10])
      if (token && token !== '[blank]') text += token + ' '
      if (!Number.isNaN(conf) && conf > 0) { confidenceSum += conf; confidenceCount += 1 }
    }
    const confidence = confidenceCount ? Math.round(confidenceSum / confidenceCount) : 0
    if (!text.trim()) throw new AppError(422, 'OCR_NO_TEXT', 'OCR produced no text for this document.')
    return { text: text.trim(), confidence, language, pages: 1 }
  }
}

/** Deterministic test engine — returns the input's base64 echo (never used in production). */
export class StubOcrEngine implements OcrEngine {
  readonly name = 'stub'
  async recognize(buffer: Buffer): Promise<OcrResult> {
    return { text: `ocr:${buffer.toString('base64')}`, confidence: 95, language: 'eng', pages: 1 }
  }
}

/** Fail-closed engine used when no OCR engine is configured. */
export class UnavailableOcrEngine implements OcrEngine {
  readonly name = 'unavailable'
  async recognize(): Promise<OcrResult> {
    throw new AppError(503, 'OCR_UNAVAILABLE', 'No OCR engine is configured; scanned documents cannot be ingested.')
  }
}
