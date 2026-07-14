// Commission Calculation
import { PLATFORM_FEE_PERCENTAGE } from '../constants';

// Bitcoin Utilities
export function satsToBtc(sats: number): number {
  return sats / 100_000_000;
}

export function btcToSats(btc: number): number {
  return Math.round(btc * 100_000_000);
}

export function usdToSats(usd: number, btcUsdRate: number): number {
  const btc = usd / btcUsdRate;
  return Math.round(btc * 100_000_000);
}

export function satsToUsd(sats: number, btcUsdRate: number): number {
  const btc = sats / 100_000_000;
  return btc * btcUsdRate;
}

export function formatSats(sats: number): string {
  if (sats >= 1_000_000_000) {
    return `${(sats / 1_000_000_000).toFixed(2)}B sats`;
  }
  if (sats >= 1_000_000) {
    return `${(sats / 1_000_000).toFixed(2)}M sats`;
  }
  if (sats >= 1_000) {
    return `${(sats / 1_000).toFixed(2)}K sats`;
  }
  return `${sats} sats`;
}

export function formatBtc(btc: number): string {
  if (btc >= 1) {
    return `${btc.toFixed(8)} BTC`;
  }
  return `${(btc * 100_000_000).toFixed(0)} sats`;
}

// Commission Calculation
export function calculateCommission(amountSats: number, feePercentage: number = PLATFORM_FEE_PERCENTAGE): number {
  return Math.round((amountSats * feePercentage) / 100);
}

export function calculateNetAmount(amountSats: number, feePercentage: number = PLATFORM_FEE_PERCENTAGE): number {
  const commission = calculateCommission(amountSats, feePercentage);
  return amountSats - commission;
}

// Validation Utilities
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function isValidPhoneNumber(phone: string): boolean {
  const phoneRegex = /^\+?[1-9]\d{1,14}$/;
  return phoneRegex.test(phone);
}

export function isValidUsername(username: string): boolean {
  const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
  return usernameRegex.test(username);
}

// Date Utilities
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getDaysUntil(date: Date | string): number {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

// String Utilities
export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length) + '...';
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Array Utilities
export function paginate<T>(array: T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  return array.slice(start, end);
}

// Error Handling
export class AppError extends Error {
  public data?: any;
  
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string,
    data?: any
  ) {
    super(message);
    this.name = 'AppError';
    this.data = data;
    Error.captureStackTrace(this, this.constructor);
  }
}

// API Response Helpers
export function successResponse<T>(data: T, message?: string) {
  return {
    success: true,
    data,
    message,
  };
}

export function errorResponse(message: string, code?: string) {
  return {
    success: false,
    error: message,
    code,
  };
}

