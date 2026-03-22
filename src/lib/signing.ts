const MAX_SIGN_RETRIES = 1
const RETRY_DELAY_MS = 15_000

function isMpcTimeout(err: unknown): boolean {
  return err instanceof Error && err.message.toLowerCase().includes('timeout')
}

export async function signWithRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown
  for (let attempt = 0; attempt <= MAX_SIGN_RETRIES; attempt++) {
    try {
      // Suppress SDK console.log during signing
      const origLog = console.log
      console.log = () => {}
      try {
        return await fn()
      } finally {
        console.log = origLog
      }
    } catch (err) {
      lastErr = err
      if (!isMpcTimeout(err) || attempt === MAX_SIGN_RETRIES) break
      process.stderr.write(`⚠ MPC signing timed out, retrying in ${RETRY_DELAY_MS / 1000}s...\n`)
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
    }
  }
  throw lastErr
}
