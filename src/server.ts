import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import { errorHandler } from './middleware/error.middleware';
import { notFoundHandler } from './middleware/notFound.middleware';
import { requestLogger, apiLogger, errorLogger } from './middleware/requestLogger.middleware';
import { apiLimiter } from './middleware/rateLimit.middleware';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(compression());
app.use(requestLogger); // Enhanced request logging
app.use(apiLogger); // Custom API logger
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Apply general API rate limiting to all API routes
app.use('/api', apiLimiter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// API Routes
import apiRoutes from './routes';
app.use('/api', apiRoutes);

// Error handling middleware (must be last)
app.use(notFoundHandler);
app.use(errorLogger); // Log errors before handling
app.use(errorHandler);

// Start server locally or in non-serverless environments
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🌐 Health check: http://localhost:${PORT}/health`);
  });
}

export default app;

