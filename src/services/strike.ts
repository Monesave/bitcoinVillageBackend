import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const STRIKE_API_KEY = process.env.STRIKE_API_KEY || 'E8F4A626F56CEC9F1ABAD099918D87AA6DD5B078F9A339E5CAD93AAB312D4EC9';
const STRIKE_API_URL = 'https://api.strike.me/v1';

const strikeClient = axios.create({
  baseURL: STRIKE_API_URL,
  headers: {
    Authorization: `Bearer ${STRIKE_API_KEY}`,
    'Content-Type': 'application/json',
  },
});

export interface StrikeInvoice {
  invoiceId: string;
  amount: {
    amount: string;
    currency: string;
  };
  state: string;
  created: string;
  correlationId: string;
  description: string;
}

export interface StrikeQuote {
  quoteId: string;
  description: string;
  lnInvoice: string;
  expiration: string;
  expirationInSec: number;
}

export const createInvoice = async (
  amount: string, 
  currency: string = 'BTC', 
  correlationId: string, 
  description: string
): Promise<StrikeInvoice> => {
  try {
    const response = await strikeClient.post('/invoices', {
      correlationId,
      description,
      amount: {
        amount,
        currency,
      },
    });
    return response.data;
  } catch (error: any) {
    console.error('Strike createInvoice error:', error.response?.data || error.message);
    throw new Error('Failed to create Strike invoice');
  }
};

export const getInvoiceQuote = async (invoiceId: string): Promise<StrikeQuote> => {
  try {
    const response = await strikeClient.post(`/invoices/${invoiceId}/quote`);
    return response.data;
  } catch (error: any) {
    console.error('Strike getInvoiceQuote error:', error.response?.data || error.message);
    throw new Error('Failed to generate Lightning invoice quote');
  }
};

export const getInvoice = async (invoiceId: string): Promise<StrikeInvoice> => {
  try {
    const response = await strikeClient.get(`/invoices/${invoiceId}`);
    return response.data;
  } catch (error: any) {
    console.error('Strike getInvoice error:', error.response?.data || error.message);
    throw new Error('Failed to fetch Strike invoice');
  }
};
