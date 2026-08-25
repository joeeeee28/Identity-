import { z } from 'zod'

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export const asAppError = (error: unknown) => {
  if (error instanceof AppError) return error
  if (error instanceof z.ZodError) return new AppError(400, 'VALIDATION_ERROR', 'The request did not pass validation.')
  return new AppError(500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.')
}
