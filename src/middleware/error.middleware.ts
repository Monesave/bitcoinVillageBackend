// @ts-nocheck
import { Request, Response, NextFunction } from 'express';
import { AppError } from '../../shared/src/utils';;

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // If it's our custom AppError, use its status code
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.message,
      code: err.code,
      ...(err.data && { data: err.data }),
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
  }

  // Default to 500 server error
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { 
      message: err.message,
      stack: err.stack 
    }),
  });
};

