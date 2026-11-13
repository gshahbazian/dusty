import * as Logger from 'effect/Logger'

/**
 * Logs as one flat JSON object per line, so Workers Logs indexes every field
 * (`feed_id`, `outcome`, `duration_ms`, ...) and they can be queried directly.
 * Errors go to `console.error`, so the platform marks them as errors.
 * Cloudflare adds the active trace and span ids to every line itself.
 */
const jsonLogger = Logger.withLeveledConsole(
  Logger.map(Logger.formatStructured, (entry) => {
    // Effect passes messages as a list; a single message is unwrapped.
    const message =
      Array.isArray(entry.message) && entry.message.length === 1
        ? entry.message[0]
        : entry.message

    return JSON.stringify({
      message,
      level: entry.level,
      ...entry.annotations,
      cause: entry.cause,
    })
  })
)

export const JsonLoggerLive = Logger.layer([jsonLogger])
