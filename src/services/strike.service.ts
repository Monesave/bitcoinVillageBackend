import axios from 'axios';
import { AppError } from '../../shared/src/utils';;
import dotenv from 'dotenv';

interface StrikeInvoice {
  invoiceId: string;  
  amount: {
    amount: string;
    currency: string;
  };
  state: 'UNPAID' | 'PAID' | 'CANCELLED';
  created: string;
  correlationId: string;
  description: string;
  issuerId: string;
  receiverId?: string;
  payerId?: string;
}

interface StrikeQuote {
  quoteId: string;
  description: string;
  lnInvoice: string;
  onchainAddress: string;
  expiration: string;
  sourceAmount: {
    amount: string;
    currency: string;
  };
  targetAmount: {
    amount: string;
    currency: string;
  };
  conversionRate: {
    amount: string;
    sourceCurrency: string;
    targetCurrency: string;
  };
}

dotenv.config();

class StrikeService {
  private apiKey: string;
  private apiUrl: string;
  private receiverHandle: string; // Your Strike handle (e.g., orukka@strike.me)

  constructor() {
    this.apiKey = process.env.STRIKE_API_KEY || '';
    this.apiUrl = process.env.STRIKE_API_URL || 'https://api.strike.me';
    this.receiverHandle = process.env.STRIKE_RECEIVER_HANDLE || 'orukka@strike.me';

    if (!this.apiKey) {
      console.warn('⚠️ Strike API key not configured');
    }
  }

  /**
   * Create an invoice for a receiver (your Strike handle)
   * Users will pay this invoice
   */
  async createInvoice(
    amountUsd: number,
    description?: string,
    correlationId?: string
  ): Promise<StrikeInvoice> {
    if (!this.apiKey) {
      throw new AppError('Strike API not configured', 500, 'STRIKE_NOT_CONFIGURED');
    }

    try {
      // Extract handle from receiverHandle (remove @strike.me if present)
      const handle = this.receiverHandle.replace('@strike.me', '');

      const response = await axios.post(
        `${this.apiUrl}/v1/invoices/handle/${handle}`,
        {
          correlationId: correlationId || `invoice-${Date.now()}`,
          description: description || 'BitcoinVillageX Payment',
          amount: {
            amount: amountUsd.toFixed(2),
            currency: 'USD',
          },
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return response.data;
    } catch (error: any) {
      console.error('Error creating Strike invoice:', error);
      throw new AppError(
        error.response?.data?.message || 'Failed to create invoice',
        500,
        'STRIKE_ERROR'
      );
    }
  }

  /**
   * Generate a payment quote for an invoice to get Lightning invoice
   */
  async generateQuote(invoiceId: string): Promise<StrikeQuote> {
    if (!this.apiKey) {
      throw new AppError('Strike API not configured', 500, 'STRIKE_NOT_CONFIGURED');
    }

    try {
      const response = await axios.post(
        `${this.apiUrl}/v1/invoices/${invoiceId}/quote`,
        {},
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return response.data;
    } catch (error: any) {
      console.error('Error generating quote:', error);
      throw new AppError(
        error.response?.data?.message || 'Failed to generate quote',
        500,
        'STRIKE_ERROR'
      );
    }
  }

  /**
   * Check invoice status
   */
  async checkInvoiceStatus(invoiceId: string): Promise<StrikeInvoice> {
    if (!this.apiKey) {
      throw new AppError('Strike API not configured', 500, 'STRIKE_NOT_CONFIGURED');
    }

    try {
      const response = await axios.get(
        `${this.apiUrl}/v1/invoices/${invoiceId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
          },
        }
      );

      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        throw new AppError('Invoice not found', 404, 'INVOICE_NOT_FOUND');
      }
      console.error('Error checking invoice status:', error);
      throw new AppError(
        error.response?.data?.message || 'Failed to check invoice status',
        500,
        'STRIKE_ERROR'
      );
    }
  }

  /**
   * Get current BTC/USD rate
   */
  async getRate(): Promise<number> {
    try {
      // Strike API might have a rates endpoint - using placeholder for now
      // You can implement actual rate fetching from Strike API when available
      // For now, return a reasonable default
      return 50000; // Placeholder rate - update with actual Strike rates API
    } catch (error: any) {
      console.error('Error getting rate, using fallback:', error);
      return 50000; // Fallback rate
    }
  }

  /**
   * Convert USD to BTC using Strike API
   */
  async convertUsdToBtc(amountUsd: number): Promise<number> {
    const rate = await this.getRate();
    return amountUsd / rate;
  }

  /**
   * Get account profile
   */
  async getProfile(): Promise<any> {
    if (!this.apiKey) {
      throw new AppError('Strike API not configured', 500, 'STRIKE_NOT_CONFIGURED');
    }

    try {
      const response = await axios.get(
        `${this.apiUrl}/v1/accounts/profile`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
          },
        }
      );

      return response.data;
    } catch (error: any) {
      console.error('Error getting profile:', error);
      throw new AppError(
        error.response?.data?.message || 'Failed to get profile',
        500,
        'STRIKE_ERROR'
      );
    }
  }
}

export const strikeService = new StrikeService();

