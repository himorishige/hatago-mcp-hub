/**
 * Simple logger for Hatago Hub
 */

export interface LogData {
  [key: string]: unknown;
}

export class Logger {
  private debugMode: boolean;
  private prefix: string;

  constructor(prefix: string = '[Hub]') {
    this.debugMode =
      process.env.DEBUG === 'true' ||
      process.env.DEBUG === '*' ||
      process.env.LOG_LEVEL === 'debug';
    this.prefix = prefix;
  }

  log(level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: LogData): void {
    // Skip debug logs if not in debug mode
    if (level === 'debug' && !this.debugMode) {
      return;
    }

    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message: `${this.prefix} ${message}`,
      ...data
    };

    // Output based on level
    switch (level) {
      case 'error':
        console.error(this.formatLog(logEntry));
        break;
      case 'warn':
        console.warn(this.formatLog(logEntry));
        break;
      case 'info':
        console.error(this.formatLog(logEntry));
        break;
      case 'debug':
        console.error(this.formatLog(logEntry));
        break;
    }
  }

  private formatLog(entry: unknown): string {
    if (this.debugMode) {
      // In debug mode, output full JSON
      return JSON.stringify(entry, null, 2);
    } else {
      // In normal mode, output simple message
      const { message, ...rest } = entry as { message: string; [key: string]: unknown };
      const extra = Object.keys(rest).length > 0 ? ` ${JSON.stringify(rest)}` : '';
      return `${message}${extra}`;
    }
  }

  debug(message: string, data?: LogData): void {
    this.log('debug', message, data);
  }

  info(message: string, data?: LogData): void {
    this.log('info', message, data);
  }

  warn(message: string, data?: LogData): void {
    this.log('warn', message, data);
  }

  error(message: string, data?: LogData): void {
    this.log('error', message, data);
  }

  /**
   * Create a child logger with additional prefix
   */
  child(prefix: string): Logger {
    return new Logger(`${this.prefix}[${prefix}]`);
  }
}
