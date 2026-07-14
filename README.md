# BitcoinVillageX Backend

Express/TypeScript backend API server for BitcoinVillageX.

## Tech Stack

- **Express.js** - Web framework
- **TypeScript** - Type safety
- **Supabase** - Database and authentication
- **Zod** - Schema validation
- **Helmet** - Security headers
- **CORS** - Cross-origin resource sharing
- **Morgan** - HTTP request logger

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Configuration

Create a `.env` file:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
NODE_ENV=development
PORT=3000
FRONTEND_URL=http://localhost:5173

SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Veriff Verification
VERIFF_API_KEY=your_veriff_api_key
VERIFF_API_URL=https://stationapi.veriff.com/v1
VERIFF_CALLBACK_URL=http://localhost:5173/api/verification/webhook
VERIFF_WEBHOOK_SECRET=your_veriff_webhook_secret

# Strike API (for payments)
STRIKE_API_KEY=your_strike_api_key
STRIKE_RECEIVER_HANDLE=orukka@strike.me

# Admin
ADMIN_EMAILS=admin@example.com,another@example.com

# Add other environment variables as needed
```

### 3. Run Development Server

```bash
npm run dev
```

The API will be available at `http://localhost:3000`

## Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run type-check` - Type check without emitting

## Project Structure

```
backend/
├── src/
│   ├── routes/          # API route handlers
│   │   ├── auth.routes.ts
│   │   ├── users.routes.ts
│   │   ├── marketplace.routes.ts
│   │   ├── services.routes.ts
│   │   ├── bounties.routes.ts
│   │   ├── crowdfunding.routes.ts
│   │   ├── payments.routes.ts
│   │   └── admin.routes.ts
│   ├── controllers/     # Route controllers
│   ├── services/        # Business logic
│   │   ├── supabase.ts
│   │   ├── lightning.service.ts
│   │   ├── escrow.service.ts
│   │   └── commission.service.ts
│   ├── middleware/      # Express middleware
│   │   ├── auth.middleware.ts
│   │   ├── validation.middleware.ts
│   │   ├── error.middleware.ts
│   │   └── notFound.middleware.ts
│   ├── utils/           # Utility functions
│   ├── types/           # TypeScript types
│   └── server.ts        # Server entry point
├── .env.example         # Environment variables template
└── package.json
```

## API Endpoints

### Health Check

```
GET /health
```

Returns server status and uptime.

### Authentication

```
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
POST /api/auth/oauth/google
```

### Users

```
GET    /api/users/:id
PUT    /api/users/:id
GET    /api/users/:id/profile
PUT    /api/users/:id/profile
```

### Marketplace

```
GET    /api/marketplace/listings
POST   /api/marketplace/listings
GET    /api/marketplace/listings/:id
PUT    /api/marketplace/listings/:id
DELETE /api/marketplace/listings/:id
POST   /api/marketplace/orders
GET    /api/marketplace/orders/:id
```

### Services

```
GET    /api/services/listings
POST   /api/services/listings
GET    /api/services/contracts/:id
POST   /api/services/contracts/:id/milestones
```

### Bounties

```
GET    /api/bounties
POST   /api/bounties
GET    /api/bounties/:id
POST   /api/bounties/:id/submissions
```

### Crowdfunding

```
GET    /api/crowdfunding/campaigns
POST   /api/crowdfunding/campaigns
GET    /api/crowdfunding/campaigns/:id
POST   /api/crowdfunding/campaigns/:id/donations
```

### Payments

```
POST   /api/payments/lightning/invoice
GET    /api/payments/lightning/:hash
POST   /api/payments/withdraw
```

### Verification

```
POST   /api/verification/request
GET    /api/verification/status
GET    /api/verification/payment/:paymentHash/status
POST   /api/verification/webhook
```

## Middleware

### Authentication

Use `authenticate` middleware to protect routes:

```typescript
import { authenticate } from '../middleware/auth.middleware';

router.get('/protected', authenticate, (req, res) => {
  // req.user is available here
  res.json({ user: req.user });
});
```

### Validation

Use `validate` middleware with Zod schemas:

```typescript
import { validate } from '../middleware/validation.middleware';
import { z } from 'zod';

const schema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(6),
  }),
});

router.post('/register', validate(schema), (req, res) => {
  // req.body is validated
});
```

## Error Handling

The API uses a centralized error handler. Throw `AppError` for custom errors:

```typescript
import { AppError } from '@shared/utils';

throw new AppError('User not found', 404, 'USER_NOT_FOUND');
```

## Features

### ✅ Completed
- Basic Express server setup
- TypeScript configuration
- Error handling middleware
- Authentication middleware
- Validation middleware
- Supabase service integration
- Health check endpoint

### ⏭️ TODO
- [x] Implement authentication routes
- [x] User management routes
- [x] Payment processing routes
- [x] Lightning integration (via Strike API)
- [x] Platform fee calculation
- [x] Marketplace routes
- [x] Services routes
- [x] Bounties routes
- [x] Crowdfunding routes
- [x] Admin routes
- [x] Rate limiting
- [x] Request logging
- [ ] API documentation (Swagger/OpenAPI)

## Development

### Running in Development

```bash
npm run dev
```

Uses `tsx watch` for hot reload.

### Building for Production

```bash
npm run build
npm start
```

## Testing

API endpoints can be tested using:
- Postman
- curl
- HTTPie
- Frontend application

Example health check:

```bash
curl http://localhost:3000/health
```

## Security

- Helmet.js for security headers
- CORS configuration
- Input validation with Zod
- Authentication middleware
- Rate limiting (to be implemented)

## Related Documentation

- Main project README: `../README.md`
- Frontend README: `../frontend/README.md`
- Payment model: `../PAYMENT_MODEL.md`

