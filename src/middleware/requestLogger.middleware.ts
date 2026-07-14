// @ts-nocheck
import { Request, Response, NextFunction } from 'express';
import morgan from 'morgan';
import fs from 'fs';
import path from 'path';

// Custom token for user ID in logs
morgan.token('user-id', (req: Request) => {
  return req.user?.id || 'anonymous';
});

// Custom token for request body (limited size)
morgan.token('req-body', (req: Request) => {
  if (req.body && Object.keys(req.body).length > 0) {
    // Only log body for non-sensitive endpoints
    const sensitivePaths = ['/auth/login', '/auth/register', '/payments'];
    const isSensitive = sensitivePaths.some((path) => req.path.includes(path));
    
    if (isSensitive) {
      return '[REDACTED]';
    }
    
    // Limit body size in logs
    const bodyStr = JSON.stringify(req.body);
    return bodyStr.length > 500 ? bodyStr.substring(0, 500) + '...' : bodyStr;
  }
  return '-';
});

// Custom format for development
export const devFormat = ':method :url :status :response-time ms - :user-id - :req-body';

// Custom format for production (more concise)
export const prodFormat = ':remote-addr :method :url :status :response-time ms :user-id';

// Create logs directory if it doesn't exist
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Create write streams for log files
const accessLogStream = fs.createWriteStream(
  path.join(logsDir, 'access.log'),
  { flags: 'a' }
);

const errorLogStream = fs.createWriteStream(
  path.join(logsDir, 'error.log'),
  { flags: 'a' }
);

// Development logger (console)
export const devLogger = morgan(devFormat, {
  skip: (req: Request, res: Response) => {
    // Skip health checks in development
    return req.path === '/health';
  },
});

// Production logger (file + console)
export const prodLogger = morgan(prodFormat, {
  stream: accessLogStream,
  skip: (req: Request, res: Response) => {
    // Skip health checks in production logs
    return req.path === '/health';
  },
});

// Error logger middleware
export const errorLogger = (err: Error, req: Request, res: Response, next: NextFunction) => {
  const logEntry = {
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    userId: req.user?.id || 'anonymous',
    error: {
      message: err.message,
      stack: err.stack,
    },
  };

  // Write to error log file
  errorLogStream.write(JSON.stringify(logEntry) + '\n');

  // Also log to console in development
  if (process.env.NODE_ENV !== 'production') {
    console.error('Error logged:', logEntry);
  }

  next(err);
};

// Request logger based on environment
export const requestLogger = process.env.NODE_ENV === 'production' ? prodLogger : devLogger;

// Custom logging middleware for API requests
export const apiLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();

  // Log request details
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`, {
      ip: req.ip,
      userId: req.user?.id || 'anonymous',
      query: req.query,
    });
  }

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logEntry = {
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userId: req.user?.id || 'anonymous',
      userAgent: req.get('user-agent'),
    };

    // Log slow requests (>1 second)
    if (duration > 1000) {
      console.warn(`⚠️ Slow request detected:`, logEntry);
    }

    // Log errors
    if (res.statusCode >= 400) {
      console.error(`❌ Error response:`, logEntry);
    }
  });

  next();
};

