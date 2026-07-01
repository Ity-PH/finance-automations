interface RateLimitEntry {
  count: number
  resetAt: number
  violations: number
}

const store = new Map<string, RateLimitEntry>()

const WINDOW_MS = 60_000
const MAX_REQUESTS = 10
const ALERT_THRESHOLD = 10  // consecutive requests that all 400/fail before alerting

setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of store.entries()) {
    if (now > entry.resetAt) store.delete(key)
  }
}, WINDOW_MS * 5)

export function checkRateLimit(ip: string, route: string): { allowed: boolean; remaining: number } {
  const now = Date.now()
  const entry = store.get(ip)

  if (!entry || now > entry.resetAt) {
    store.set(ip, { count: 1, resetAt: now + WINDOW_MS, violations: 0 })
    return { allowed: true, remaining: MAX_REQUESTS - 1 }
  }

  entry.count++

  if (entry.count > MAX_REQUESTS) {
    if (entry.count === MAX_REQUESTS + 1) {
      console.warn(`[SECURITY] Rate limit exceeded — ip=${ip} route=${route} count=${entry.count}`)
    }
    return { allowed: false, remaining: 0 }
  }

  return { allowed: true, remaining: MAX_REQUESTS - entry.count }
}

export function recordViolation(ip: string, route: string) {
  const entry = store.get(ip)
  if (!entry) return
  entry.violations++
  if (entry.violations >= ALERT_THRESHOLD) {
    console.warn(`[SECURITY] Possible brute-force probe — ip=${ip} route=${route} violations=${entry.violations}`)
    entry.violations = 0
  }
}
