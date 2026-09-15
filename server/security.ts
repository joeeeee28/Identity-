import net from 'node:net'
import { config } from './config.js'
import { metrics } from './metrics.js'
import { AppError } from './errors.js'

export interface MalwareScanResult { clean: boolean; engine: string; signature?: string }
export interface MalwareScanner { scan(content: Buffer, fileName: string): Promise<MalwareScanResult> }

/** Development-only no-op boundary. Never used outside development. */
class DevelopmentMalwareScanner implements MalwareScanner {
  async scan(_content: Buffer, _fileName: string) { return { clean: true, engine: 'development-boundary' } }
}

/**
 * Real ClamAV scanner speaking the clamd INSTREAM protocol over TCP.
 * Fail-closed: any connection failure, timeout, or scanner error is surfaced as
 * `MALWARE_SCANNER_UNAVAILABLE` so an upload can never be marked safe without an
 * actual verdict from the scanner.
 */
class ClamAvMalwareScanner implements MalwareScanner {
  private async instream(content: Buffer, fileName: string): Promise<{ clean: boolean; signature?: string }> {
    const response = await new Promise<string>((resolve, reject) => {
      const socket = net.connect(config.clamdPort, config.clamdHost)
      let data = Buffer.alloc(0)
      let settled = false
      const finish = (error?: Error) => {
        if (settled) return
        settled = true
        socket.destroy()
        if (error) reject(error)
        else resolve(data.toString('utf8').trim())
      }
      const timer = setTimeout(() => finish(new Error('ClamAV scan timed out')), config.clamdTimeoutMs)
      socket.once('connect', () => {
        socket.write('zINSTREAM\0')
        // Send the file in 32 KiB chunks; a zero-length chunk terminates the stream.
        const chunkSize = 32 * 1024
        for (let offset = 0; offset < content.length; offset += chunkSize) {
          const chunk = content.subarray(offset, offset + chunkSize)
          const header = Buffer.alloc(4)
          header.writeUInt32BE(chunk.length, 0)
          socket.write(Buffer.concat([header, chunk]))
        }
        socket.write(Buffer.alloc(4)) // zero-length terminator
      })
      socket.on('data', (chunk) => { data = Buffer.concat([data, chunk]) })
      socket.once('end', () => { clearTimeout(timer); finish() })
      socket.once('error', (error) => { clearTimeout(timer); finish(error) })
    })

    // clamd replies: "stream: OK", "stream: <name> FOUND", "stream: <error> ERROR".
    if (response.includes('FOUND')) {
      const signature = response.replace('stream:', '').replace('FOUND', '').trim()
      return { clean: false, signature }
    }
    if (response.includes('OK')) return { clean: true }
    throw new AppError(503, 'MALWARE_SCANNER_ERROR', `The malware scanner returned an unexpected response for "${fileName}".`)
  }

  async scan(content: Buffer, fileName: string) {
    try {
      const result = await this.instream(content, fileName)
      metrics.increment('smart_corp_security_scans_total')
      if (!result.clean) metrics.increment('smart_corp_security_detections_total')
      return { clean: result.clean, engine: 'clamav', signature: result.signature }
    } catch (error) {
      if (error instanceof AppError) throw error
      throw new AppError(503, 'MALWARE_SCANNER_UNAVAILABLE', 'Document ingestion is paused while the malware scanner is unavailable.')
    }
  }
}

/** Fail-closed scanner used whenever a real scanner is required but not configured. */
class ConfiguredMalwareScanner implements MalwareScanner {
  async scan(_content: Buffer, _fileName: string): Promise<MalwareScanResult> {
    throw new AppError(503, 'MALWARE_SCANNER_UNAVAILABLE', 'Document ingestion is paused while the malware scanner is unavailable.')
  }
}

export const createMalwareScanner = (): MalwareScanner => {
  if (config.malwareScannerProvider === 'clamav') return new ClamAvMalwareScanner()
  if (config.nodeEnv !== 'production' && config.malwareScannerProvider === 'disabled-in-development') return new DevelopmentMalwareScanner()
  return new ConfiguredMalwareScanner()
}
