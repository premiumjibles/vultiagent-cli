export enum ExitCode {
  SUCCESS = 0,
  USAGE = 1,
  AUTH_REQUIRED = 2,
  NETWORK = 3,
  INVALID_INPUT = 4,
  RESOURCE_NOT_FOUND = 5,
  EXTERNAL_SERVICE = 6,
}

export const EXIT_CODE_DESCRIPTIONS: Record<ExitCode, string> = {
  [ExitCode.SUCCESS]: 'Success',
  [ExitCode.USAGE]: 'Usage error (bad arguments, unknown command)',
  [ExitCode.AUTH_REQUIRED]: 'Authentication required',
  [ExitCode.NETWORK]: 'Network error (retryable)',
  [ExitCode.INVALID_INPUT]: 'Invalid input (bad chain, address, amount)',
  [ExitCode.RESOURCE_NOT_FOUND]: 'Resource not found (token, route)',
  [ExitCode.EXTERNAL_SERVICE]: 'External service error (retryable)',
}

export abstract class VasigError extends Error {
  abstract readonly exitCode: ExitCode
  abstract readonly code: string
  readonly hint?: string
  readonly suggestions?: string[]
  readonly retryable: boolean = false

  constructor(message: string, hint?: string, suggestions?: string[]) {
    super(message)
    this.name = this.constructor.name
    this.hint = hint
    this.suggestions = suggestions
  }
}

export class UsageError extends VasigError {
  readonly exitCode = ExitCode.USAGE
  readonly code = 'USAGE_ERROR'
}

export class AuthRequiredError extends VasigError {
  readonly exitCode = ExitCode.AUTH_REQUIRED
  readonly code = 'AUTH_REQUIRED'

  constructor(message?: string) {
    super(
      message ?? 'Authentication required. Run vasig auth to set up credentials.',
      'Run: vasig auth',
      ['vasig auth setup'],
    )
  }
}

export class NetworkError extends VasigError {
  readonly exitCode = ExitCode.NETWORK
  readonly code = 'NETWORK_ERROR'
  override readonly retryable = true
}

export class InvalidChainError extends VasigError {
  readonly exitCode = ExitCode.INVALID_INPUT
  readonly code = 'INVALID_CHAIN'
}

export class InvalidAddressError extends VasigError {
  readonly exitCode = ExitCode.INVALID_INPUT
  readonly code = 'INVALID_ADDRESS'
}

export class InsufficientBalanceError extends VasigError {
  readonly exitCode = ExitCode.INVALID_INPUT
  readonly code = 'INSUFFICIENT_BALANCE'
}

export class NoRouteError extends VasigError {
  readonly exitCode = ExitCode.RESOURCE_NOT_FOUND
  readonly code = 'NO_ROUTE'
}

export class TokenNotFoundError extends VasigError {
  readonly exitCode = ExitCode.RESOURCE_NOT_FOUND
  readonly code = 'TOKEN_NOT_FOUND'
}

export class PricingUnavailableError extends VasigError {
  readonly exitCode = ExitCode.EXTERNAL_SERVICE
  readonly code = 'PRICING_UNAVAILABLE'
  override readonly retryable = true
}

const SDK_NOISE_REPLACEMENTS: [RegExp, string][] = [
  [/ContractFunctionExecutionError/i, 'Contract call failed'],
  [/eth_sendTransaction[\s\S]*?format[\s\S]*?error/i, 'Transaction format error'],
  [/Cannot convert .* to a BigInt/i, 'Invalid amount'],
  [/\bNaN\b/, 'Invalid numeric value'],
]

const SDK_STRIP_PATTERNS: RegExp[] = [
  /\[LI\.FI SDK v[^\]]*\]\s*/g,
  /\s*(?:Check\s+)?https?:\/\/docs\.li\.fi\S*.*$/gim,
  /\n*\s*Details:[\s\S]*/i,
  /\n*\s*Contract Call:[\s\S]*/i,
  /Version: @lifi\/sdk@[\d.]+/gi,
]

export function cleanSdkMessage(message: string): string {
  if (!message) return message

  for (const [pattern, replacement] of SDK_NOISE_REPLACEMENTS) {
    if (pattern.test(message)) return replacement
  }

  let cleaned = message
  for (const pattern of SDK_STRIP_PATTERNS) {
    cleaned = cleaned.replace(pattern, '').trim()
  }

  return cleaned.replace(/\n{3,}/g, '\n\n').trim() || message
}

export function classifyError(err: Error): VasigError {
  if (err instanceof VasigError) return err
  const cleaned = cleanSdkMessage(err.message)
  const msg = cleaned.toLowerCase()
  if (msg.includes('unsupported chain') || msg.includes('invalid chain') || msg.includes('unknown chain')) {
    return new InvalidChainError(cleaned)
  }
  if (msg.includes('invalid address') || msg.includes('bad address') || msg.includes('malformed address')) {
    return new InvalidAddressError(cleaned)
  }
  if (msg.includes('insufficient') && msg.includes('balance')) {
    return new InsufficientBalanceError(cleaned)
  }
  if (msg.includes('no route') || msg.includes('no swap') || msg.includes('no provider')) {
    return new NoRouteError(cleaned)
  }
  if (msg.includes('token not found') || msg.includes('unknown token')) {
    return new TokenNotFoundError(cleaned)
  }
  if (msg.includes('pricing') || msg.includes('price unavailable') || msg.includes('price service')) {
    return new PricingUnavailableError(cleaned)
  }
  return new UsageError(cleaned)
}

export interface ErrorJson {
  ok: false
  v: number
  error: {
    code: string
    message: string
    hint?: string
    suggestions?: string[]
    retryable: boolean
  }
}

export function toErrorJson(err: Error): ErrorJson {
  if (err instanceof VasigError) {
    const json: ErrorJson = {
      ok: false,
      v: 1,
      error: {
        code: err.code,
        message: err.message,
        hint: err.hint,
        retryable: err.retryable,
      },
    }
    if (err.suggestions?.length) json.error.suggestions = err.suggestions
    return json
  }
  return {
    ok: false,
    v: 1,
    error: {
      code: 'UNKNOWN_ERROR',
      message: err.message,
      retryable: false,
    },
  }
}
