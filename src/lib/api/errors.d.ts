export interface DomainErrorRule {
  pattern?: RegExp
  when?: (error: unknown, message: string) => boolean
  message?: string
  status: number
}

export interface SanitizedErrorResponseOptions {
  domainErrors?: DomainErrorRule[]
  fallbackMessage?: string
  fallbackStatus?: number
  logger?: Pick<Console, 'error'> | ((message: string, error: unknown) => void) | null
  logMessage?: string
}

export function getErrorMessage(error: unknown, fallback?: string): string

export function sanitizedErrorResponse(
  error: unknown,
  options?: SanitizedErrorResponseOptions,
): Response
