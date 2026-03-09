export function log(level: 'info' | 'warn' | 'error', event: string, extra?: Record<string, unknown>) {
  console.log(JSON.stringify({
    level,
    event,
    timestamp: new Date().toISOString(),
    ...extra,
  }))
}
