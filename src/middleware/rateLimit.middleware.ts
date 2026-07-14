// @ts-nocheck

import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

// Extend Request type to include rateLimit
declare global {
  namespace Express {
    interface Request {
      rateLimit?: {
        limit: number;
        current: number;
        remaining: number;
        resetTime: Date;
      };
    }
  }
}

// General API rate limiter (applied to all API routes)
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again later.',
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: 'Too many requests from this IP, please try again later.',
      retryAfter: Math.round(req.rateLimit?.resetTime ? (req.rateLimit.resetTime - Date.now()) / 1000 : 900),
    });
  },
});

// Strict rate limiter for authentication endpoints
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs (login attempts)
  message: {
    success: false,
    error: 'Too many authentication attempts, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful requests
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: 'Too many authentication attempts, please try again later.',
      retryAfter: Math.round(req.rateLimit?.resetTime ? (req.rateLimit.resetTime - Date.now()) / 1000 : 900),
    });
  },
});

// Strict rate limiter for payment endpoints
export const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit each IP to 20 payment requests per windowMs
  message: {
    success: false,
    error: 'Too many payment requests, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: 'Too many payment requests, please try again later.',
      retryAfter: Math.round(req.rateLimit?.resetTime ? (req.rateLimit.resetTime - Date.now()) / 1000 : 900),
    });
  },
});

// Strict rate limiter for admin endpoints
export const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Limit each IP to 50 admin requests per windowMs
  message: {
    success: false,
    error: 'Too many admin requests, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: 'Too many admin requests, please try again later.',
      retryAfter: Math.round(req.rateLimit?.resetTime ? (req.rateLimit.resetTime - Date.now()) / 1000 : 900),
    });
  },
});

// Rate limiter for public endpoints (listings, campaigns, etc.)
export const publicLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // Limit each IP to 30 requests per minute
  message: {
    success: false,
    error: 'Too many requests, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: 'Too many requests, please try again later.',
      retryAfter: Math.round(req.rateLimit?.resetTime ? (req.rateLimit.resetTime - Date.now()) / 1000 : 60),
    });
  },
});

// Create a custom rate limiter function
export const createRateLimiter = (windowMs: number, max: number, message?: string) => {
  return rateLimit({
    windowMs,
    max,
    message: message || {
      success: false,
      error: 'Too many requests, please try again later.',
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
};

