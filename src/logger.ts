import { appendFileSync } from 'fs'
import winston from 'winston'

// Create a Winston logger
export const logger = winston.createLogger({
  level: 'info', // Default log level
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} [${level}]: ${message}`
    })
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(), // Adds color to log levels
        winston.format.simple() // Simplified log format
      ),
    }),
  ],
})

export function persistLog(content: any, persist = true) {
  try {
      console.log(content)
      if (persist) {
          appendFileSync("./volumes/log.txt", `\n${new Date().toISOString()}: ${JSON.stringify(content)}`, {
              encoding: "utf8"
          })
      }
  } catch (error) {
      console.error("Log error", error)
  }
}
