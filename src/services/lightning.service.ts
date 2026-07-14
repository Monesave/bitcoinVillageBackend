import { strikeService } from './strike.service';
import { AppError, btcToSats, satsToBtc } from '../../shared/src/utils';

interface LightningInvoice {
  invoice: string; // Lightning invoice (lnbc...)
  invoiceId: string; // Strike invoice ID
  paymentHash: string; // Extracted from invoice
  amountSats: number;
  amountUsd: number;
  expiry: string;
}

interface InvoiceStatus {
  settled: boolean;
  invoiceId: string;
  state: 'UNPAID' | 'PAID' | 'CANCELLED';
  amountPaidSats?: number;
}

/**
 * Lightning service using Strike API
 * Users create invoices from the app, and we use Strike API to generate Lightning invoices
 */
class LightningService {
  /**
   * Create a Lightning invoice via Strike API
   * @param amountSats - Amount in satoshis
   * @param memo - Invoice description
   * @param correlationId - Optional correlation ID for tracking
   */
  async createInvoice(
    amountSats: number,
    memo?: string,
    correlationId?: string
  ): Promise<LightningInvoice> {
    try {
      // Convert sats to USD (approximate - you may want to use real-time rates)
      const amountBtc = satsToBtc(amountSats);
      const amountUsd = amountBtc * 50000; // Placeholder rate - use Strike rates API

      // Create invoice via Strike API
      const strikeInvoice = await strikeService.createInvoice(
        amountUsd,
        memo || 'BitcoinVillageX Payment',
        correlationId
      );

      // Generate quote to get Lightning invoice
      const quote = await strikeService.generateQuote(strikeInvoice.invoiceId);

      // Extract payment hash from Lightning invoice (lnbc...)
      // This is a simplified extraction - you may need a proper decoder
      const paymentHash = this.extractPaymentHash(quote.lnInvoice);

      return {
        invoice: quote.lnInvoice,
        invoiceId: strikeInvoice.invoiceId,
        paymentHash: paymentHash,
        amountSats,
        amountUsd,
        expiry: quote.expiration,
      };
    } catch (error: any) {
      console.error('Error creating Lightning invoice:', error);
      throw new AppError(
        error.message || 'Failed to create Lightning invoice',
        500,
        'LIGHTNING_ERROR'
      );
    }
  }

  /**
   * Check if an invoice is paid
   */
  async checkInvoiceStatus(invoiceId: string): Promise<InvoiceStatus> {
    try {
      const invoice = await strikeService.checkInvoiceStatus(invoiceId);

      return {
        settled: invoice.state === 'PAID',
        invoiceId: invoice.invoiceId,
        state: invoice.state,
        amountPaidSats: invoice.state === 'PAID' ? parseInt(invoice.amount.amount) * 100_000_000 / 50000 : undefined, // Approximate
      };
    } catch (error: any) {
      if (error.code === 'INVOICE_NOT_FOUND') {
        return {
          settled: false,
          invoiceId,
          state: 'UNPAID',
        };
      }
      throw error;
    }
  }

  /**
   * Extract payment hash from Lightning invoice
   * This is a simplified version - you may want to use a proper BOLT11 decoder
   */
  private extractPaymentHash(lnInvoice: string): string {
    // Lightning invoices are BOLT11 format: lnbc...hash
    // This is a placeholder - implement proper BOLT11 decoding
    // For now, generate a hash from the invoice
    return lnInvoice.substring(0, 64) || `hash-${Date.now()}`;
  }

  /**
   * Decode a Lightning invoice (for incoming payments)
   */
  async decodeInvoice(paymentRequest: string): Promise<{
    amountSats: number;
    description: string;
    paymentHash: string;
    expiry: number;
  }> {
    // For decoding incoming invoices, you might need a BOLT11 decoder library
    // For now, return placeholder data
    return {
      amountSats: 0,
      description: 'Decoded invoice',
      paymentHash: this.extractPaymentHash(paymentRequest),
      expiry: 3600,
    };
  }
}

export const lightningService = new LightningService();
