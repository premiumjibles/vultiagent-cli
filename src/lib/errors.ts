export enum ExitCode {
  SUCCESS = 0,
  USAGE = 1,
  AUTH_REQUIRED = 2,
  NETWORK = 3,
}

export abstract class VasigError extends Error {
  abstract readonly exitCode: ExitCode
  abstract readonly code: string
  readonly hint?: string

  constructor(message: string, hint?: string) {
    super(message)
    this.name = this.constructor.name
    this.hint = hint
  }
}

export class UsageError extends VasigError {
  readonly exitCode = ExitCode.USAGE
  readonly code = 'USAGE_ERROR'

  constructor(message: string, hint?: string) {
    super(message, hint)
  }
}

export class AuthRequiredError extends VasigError {
  readonly exitCode = ExitCode.AUTH_REQUIRED
  readonly code = 'AUTH_REQUIRED'

  constructor(message?: string) {
    super(
      message ?? 'Authentication required. Run vasig auth to set up credentials.',
      'Run: vasig auth'
    )
  }
}

export class NetworkError extends VasigError {
  readonly exitCode = ExitCode.NETWORK
  readonly code = 'NETWORK_ERROR'

  constructor(message: string, hint?: string) {
    super(message, hint)
  }
}

export interface ErrorJson {
  ok: false
  error: {
    code: string
    message: string
    hint?: string
  }
}

export function toErrorJson(err: Error): ErrorJson {
  if (err instanceof VasigError) {
    return {
      ok: false,
      error: {
        code: err.code,
        message: err.message,
        hint: err.hint,
      },
    }
  }
  return {
    ok: false,
    error: {
      code: 'UNKNOWN_ERROR',
      message: err.message,
    },
  }
}
