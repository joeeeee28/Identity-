declare module 's3rver' {
  interface S3rverOptions {
    address?: string
    port?: number
    directory?: string
    silent?: boolean
    resetOnClose?: boolean
    allowMismatchedSignatures?: boolean
    [key: string]: unknown
  }

  class S3rver {
    constructor(options?: S3rverOptions)
    run(callback?: (err?: Error) => void): Promise<unknown>
    close(callback?: (err?: Error) => void): Promise<unknown>
  }

  export = S3rver
}
