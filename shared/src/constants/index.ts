// Platform Constants
export const PLATFORM_FEE_PERCENTAGE = 2.5;
export const VERRIFF_VERIFICATION_FEE_USD = 10.0;

// Transaction Constants
export const TRANSACTION_TYPES = {
  PAYMENT: 'payment',
  WITHDRAWAL: 'withdrawal',
  DEPOSIT: 'deposit',
  ESCROW: 'escrow',
  COMMISSION: 'commission',
} as const;

export const TRANSACTION_STATUSES = {
  PENDING: 'pending',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
} as const;

// Order Constants
export const ORDER_STATUSES = {
  PENDING_PAYMENT: 'pending_payment',
  PAID: 'paid',
  SHIPPED: 'shipped',
  DELIVERED: 'delivered',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  DISPUTED: 'disputed',
} as const;

// Service Constants
export const SERVICE_PRICE_TYPES = {
  FIXED: 'fixed',
  HOURLY: 'hourly',
  MILESTONE: 'milestone',
} as const;

export const DEFAULT_REVISION_LIMIT = 2;
export const DEFAULT_AUTO_COMPLETE_DAYS = 14;
export const DEFAULT_AUTO_RELEASE_DAYS = 7;

// Bounty Constants
export const BOUNTY_CATEGORIES = {
  BUG: 'bug',
  LOST_ITEM: 'lost_item',
  RESEARCH: 'research',
  CHALLENGE: 'challenge',
} as const;

export const BOUNTY_STATUSES = {
  OPEN: 'open',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const;

// Campaign Constants
export const CAMPAIGN_STATUSES = {
  ACTIVE: 'active',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  ENDED: 'ended',
} as const;

// Verification Constants
export const VERIFICATION_STATUSES = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  EXPIRED: 'expired',
} as const;

// Dispute Constants
export const DISPUTE_TYPES = {
  MARKETPLACE_ORDER: 'marketplace_order',
  SERVICE_CONTRACT: 'service_contract',
  BOUNTY: 'bounty',
} as const;

export const DISPUTE_STATUSES = {
  OPEN: 'open',
  UNDER_REVIEW: 'under_review',
  RESOLVED: 'resolved',
  CLOSED: 'closed',
} as const;

// Wallet Types
export const WALLET_TYPES = {
  STRIKE: 'strike',
  ORUKKA: 'orukka',
  ORUKKA_BUSINESS: 'orukka_business',
  ORUKKA_P2P: 'orukka_p2p',
  MONESAVE: 'monesave',
} as const;

// Ring Types
export const RING_TYPES = {
  PAYMENT_RING: 'payment_ring',
  BUSINESS_RING: 'business_ring',
} as const;

// Rating Constants
export const MIN_RATING = 1;
export const MAX_RATING = 5;

// Pagination
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// File Upload Limits
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const ALLOWED_DOCUMENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

// Bitcoin/Lightning Constants
export const SATS_PER_BTC = 100_000_000;
export const MIN_PAYMENT_SATS = 1;
export const MAX_PAYMENT_SATS = 21_000_000 * SATS_PER_BTC; // Max BTC supply

// Time Constants (in seconds)
export const ONE_DAY = 86400;
export const ONE_WEEK = 604800;
export const ONE_MONTH = 2592000;

