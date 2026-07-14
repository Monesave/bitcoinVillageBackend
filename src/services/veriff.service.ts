import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Veriff Service
 * Integrates with Veriff API for identity verification
 * API Documentation: https://stationapi.veriff.com
 */
class VeriffService {
  private apiKey: string;
  private baseURL: string;
  private client: AxiosInstance;

  constructor() {
    this.apiKey = process.env.VERIFF_API_KEY;
    // Use stationapi.veriff.com as specified, fallback to standard endpoint
    this.baseURL = process.env.VERIFF_API_URL || 'https://stationapi.veriff.com/v1';

    if (!this.apiKey) {
      console.warn('⚠️ VERIFF_API_KEY not set in environment variables');
    }

    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Content-Type': 'application/json',
        'X-AUTH-CLIENT': this.apiKey,
      },
      timeout: 30000, // 30 seconds
    });
  }

  /**
   * Create a verification session for a Villager
   * @param userId - The Villager's user ID
   * @param email - The Villager's email
   * @param lang - Language code (default: 'en')
   * @returns Verification session data
   */
  async createSession(userId: string, email: string, lang: string = 'en'): Promise<{
    id: string;
    url: string;
    sessionToken: string;
  }> {
    try {
      if (!this.apiKey) {
        throw new Error('Veriff API key not configured');
      }

      // Veriff API payload structure
      const payload = {
        verification: {
          callback: process.env.VERIFF_CALLBACK_URL || `${process.env.FRONTEND_URL || 'http://localhost:5173'}/api/verification/webhook`,
          person: {
            firstName: '', // Will be collected during verification
            lastName: '', // Will be collected during verification
          },
        },
        lang,
      };

      const response = await this.client.post('/sessions', payload);

      // Handle different response formats
      const verification = response.data?.verification || response.data;
      
      return {
        id: verification.id || verification.sessionId,
        url: verification.url || verification.host || '',
        sessionToken: verification.sessionToken || verification.id || verification.sessionId,
      };
    } catch (error: any) {
      console.error('Error creating Veriff session:', {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message,
      });
      
      // If 404, the endpoint might be wrong - provide helpful error
      if (error.response?.status === 404) {
        throw new Error('Veriff API endpoint not found. Please verify VERIFF_API_URL is correct. Check Veriff documentation for the correct endpoint.');
      }
      
      throw new Error(`Failed to create Veriff session: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Get verification status
   * @param sessionId - Veriff session ID
   * @returns Verification status and data
   */
  async getVerificationStatus(sessionId: string): Promise<{
    status: string;
    code: number;
    verification: any;
  }> {
    try {
      if (!this.apiKey) {
        throw new Error('Veriff API key not configured');
      }

      const response = await this.client.get(`/sessions/${sessionId}`);

      return {
        status: response.data.verification.status,
        code: response.data.verification.code || 0,
        verification: response.data.verification,
      };
    } catch (error: any) {
      console.error('Error getting Veriff status:', error.response?.data || error.message);
      throw new Error(`Failed to get Veriff status: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Get verification decision
   * @param sessionId - Veriff session ID
   * @returns Verification decision
   */
  async getDecision(sessionId: string): Promise<{
    status: string;
    code: number;
    verification: any;
  }> {
    try {
      if (!this.apiKey) {
        throw new Error('Veriff API key not configured');
      }

      const response = await this.client.get(`/sessions/${sessionId}/decision`);

      return {
        status: response.data.verification.status,
        code: response.data.verification.code || 0,
        verification: response.data.verification,
      };
    } catch (error: any) {
      console.error('Error getting Veriff decision:', error.response?.data || error.message);
      throw new Error(`Failed to get Veriff decision: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Verify webhook signature (for callbacks)
   * @param signature - Signature from webhook header
   * @param payload - Raw request body
   * @returns Whether signature is valid
   */
  verifyWebhookSignature(signature: string, payload: string): boolean {
    try {
      const secret = process.env.VERIFF_WEBHOOK_SECRET || '';
      if (!secret) {
        console.warn('VERIFF_WEBHOOK_SECRET not set, skipping signature verification');
        return true; // Skip verification if secret not set (development)
      }

      const hmac = crypto.createHmac('sha256', secret);
      hmac.update(payload);
      const calculatedSignature = hmac.digest('hex');

      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(calculatedSignature)
      );
    } catch (error) {
      console.error('Error verifying webhook signature:', error);
      return false;
    }
  }

  /**
   * Handle webhook callback from Veriff
   * @param payload - Webhook payload
   * @returns Parsed webhook data
   */
  parseWebhook(payload: any): {
    event: string;
    sessionId: string;
    status: string;
    verification: any;
  } {
    return {
      event: payload.type || 'unknown',
      sessionId: payload.verification?.id || '',
      status: payload.verification?.status || 'unknown',
      verification: payload.verification || {},
    };
  }
}

export const veriffService = new VeriffService();
export default veriffService;

