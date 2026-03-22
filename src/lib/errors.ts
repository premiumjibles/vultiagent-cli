export enum ExitCode {
  SUCCESS = 0,
  USAGE = 1,
  AUTH_REQUIRED = 2,
  NETWORK = 3,
  INVALID_INPUT = 4,
  RESOURCE_NOT_FOUND = 5,
  EXTERNAL_SERVICE = 6,
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

export class InvalidChainError extends VasigError {
  readonly exitCode = ExitCode.INVALID_INPUT
  readonly code = 'INVALID_CHAIN'

  constructor(message: string, hint?: string) {
    super(message, hint)
  }
}

export class InvalidAddressError extends VasigError {
  readonly exitCode = ExitCode.INVALID_INPUT
  readonly code = 'INVALID_ADDRESS'

  constructor(message: string, hint?: string) {
    super(message, hint)
  }
}

export class InsufficientBalanceError extends VasigError {
  readonly exitCode = ExitCode.INVALID_INPUT
  readonly code = 'INSUFFICIENT_BALANCE'

  constructor(message: string, hint?: string) {
    super(message, hint)
  }
}

export class NoRouteError extends VasigError {
  readonly exitCode = ExitCode.RESOURCE_NOT_FOUND
  readonly code = 'NO_ROUTE'

  constructor(message: string, hint?: string) {
    super(message, hint)
  }
}

export class TokenNotFoundError extends VasigError {
  readonly exitCode = ExitCode.RESOURCE_NOT_FOUND
  readonly code = 'TOKEN_NOT_FOUND'

  constructor(message: string, hint?: string) {
    super(message, hint)
  }
}

export class PricingUnavailableError extends VasigError {
  readonly exitCode = ExitCode.EXTERNAL_SERVICE
  readonly code = 'PRICING_UNAVAILABLE'

  constructor(message: string, hint?: string) {
    super(message, hint)
  }
}

export function classifyError(err: Error): VasigError {
  if (err instanceof VasigError) return err
  const msg = err.message.toLowerCase()
  if (msg.includes('unsupported chain') || msg.includes('invalid chain') || msg.includes('unknown chain')) {
    return new InvalidChainError(err.message)
  }
  if (msg.includes('invalid address') || msg.includes('bad address') || msg.includes('malformed address')) {
    return new InvalidAddressError(err.message)
  }
  if (msg.includes('insufficient') && msg.includes('balance')) {
    return new InsufficientBalanceError(err.message)
  }
  if (msg.includes('no route') || msg.includes('no swap') || msg.includes('no provider')) {
    return new NoRouteError(err.message)
  }
  if (msg.includes('token not found') || msg.includes('unknown token')) {
    return new TokenNotFoundError(err.message)
  }
  if (msg.includes('pricing') || msg.includes('price unavailable') || msg.includes('price service')) {
    return new PricingUnavailableError(err.message)
  }
  return new UsageError(err.message)
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
