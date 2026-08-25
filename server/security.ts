import { config } from './config.js'
import { AppError } from './errors.js'

export interface MalwareScanResult { clean: boolean; engine: string; signature?: string }
export interface MalwareScanner { scan(content: Buffer, fileName: string): Promise<MalwareScanResult> }

class DevelopmentMalwareScanner implements MalwareScanner {
  async scan(_content: Buffer, _fileName: string) { return { clean: true, engine: 'development-boundary' } }
}

class ConfiguredMalwareScanner implements MalwareScanner {
  async scan(_content: Buffer, _fileName: string): Promise<MalwareScanResult> {
    // Keep the production path fail-closed until a scanner adapter is supplied.
    throw new AppError(503, 'MALWARE_SCANNER_UNAVAILABLE', 'Document ingestion is paused while the malware scanner is unavailable.')
  }
}

export const createMalwareScanner = (): MalwareScanner => config.nodeEnv !== 'production' && config.malwareScannerProvider === 'disabled-in-development' ? new DevelopmentMalwareScanner() : new ConfiguredMalwareScanner()
