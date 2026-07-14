// @ts-nocheck
import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { AppError } from '../../shared/src/utils';

export const validate = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = error.errors.map((err) => ({
          path: err.path.join('.'),
          message: err.message,
        }));
        
        throw new AppError(
          'Validation failed',
          400,
          'VALIDATION_ERROR',
          errors
        );
      }
      next(error);
    }
  };
};

