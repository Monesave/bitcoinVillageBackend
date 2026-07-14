import { Request, Response, NextFunction } from 'express';
import { supabase, createUserClient } from '../services/supabase';
import { AppError } from '../../shared/src/utils';
import * as strikeService from '../services/strike';

const getAccessToken = (req: Request): string | undefined => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return undefined;
};

// Create a new Lightning invoice
export const createPayment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { listing, amount, description } = req.body;
    const userId = req.user?.id;
    const accessToken = getAccessToken(req);

    if (!userId || !accessToken) {
      throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
    }

    const db = createUserClient(accessToken);
    const dbAny = db as any;

    // 1. Create a dummy record in DB to get a correlationId (payment id)
    const { data: initialPayment, error: dbError } = await dbAny
      .from('payments')
      .insert([
        {
          user_id: userId,
          listing,
          amount,
          status: 'PENDING',
        }
      ])
      .select()
      .single();

    if (dbError || !initialPayment) {
      throw new AppError('Failed to initialize payment', 500, 'DATABASE_ERROR');
    }

    // 2. Request Invoice from Strike using the DB ID as correlationId
    // Convert decimal amount to string format for Strike (e.g., 0.0001)
    const btcAmount = Number(amount).toFixed(8);
    
    const invoice = await strikeService.createInvoice(
      btcAmount,
      'BTC',
      initialPayment.id,
      description || `Payment for listing ${listing}`
    );

    // 3. Update DB with Strike invoice ID
    await dbAny
      .from('payments')
      .update({ strike_reference: invoice.invoiceId })
      .eq('id', initialPayment.id);

    // 4. Generate the Lightning Quote (bolt11 string)
    const quote = await strikeService.getInvoiceQuote(invoice.invoiceId);

    res.status(201).json({
      success: true,
      data: {
        paymentId: initialPayment.id,
        invoiceId: invoice.invoiceId,
        lnInvoice: quote.lnInvoice,
        expiration: quote.expiration,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Get payment status
export const getPaymentStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const accessToken = getAccessToken(req);

    if (!accessToken) {
      throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
    }

    const db = createUserClient(accessToken);
    const dbAny = db as any;
    
    // Fetch payment using user's token so RLS passes
    const { data: payment, error } = await dbAny
      .from('payments')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !payment) {
      throw new AppError('Payment not found', 404, 'NOT_FOUND');
    }

    res.json({
      success: true,
      data: payment,
    });
  } catch (error) {
    next(error);
  }
};

// Handle Strike Webhooks
export const handleWebhook = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Note: In production, verify Strike Webhook Signature using req.headers['strike-signature']
    
    const event = req.body;
    
    // We only care about invoice state changes
    if (event.eventType === 'invoice.updated') {
      const invoice = event.data;
      const paymentId = invoice.correlationId;
      const status = invoice.state; // 'UNPAID', 'PENDING', 'PAID', 'CANCELLED'

      if (paymentId) {
        const supabaseAny = supabase as any;

        // Fetch the payment to see who made it and what it was for
        const { data: payment } = await supabaseAny
          .from('payments')
          .select('*')
          .eq('id', paymentId)
          .single();

        if (payment) {
          // Update payment status
          await supabaseAny
            .from('payments')
            .update({ status })
            .eq('id', paymentId);
            
          console.log(`Payment ${paymentId} updated to ${status}`);

          // If this was a successful Verification payment (no listing attached)
          if (status === 'PAID' && !payment.listing) {
            await supabaseAny
              .from('users')
              .update({ is_verified_villager: true })
              .eq('id', payment.user_id);
              
            console.log(`User ${payment.user_id} is now a Verified Villager!`);
          }

          // If this was a purchase for a listing, create an Order and hold funds in Escrow
          if (status === 'PAID' && payment.listing) {
            let sellerId = null;
            let listingType = null;

            // Check if it's a marketplace item
            const { data: mp } = await supabaseAny.from('marketplace').select('seller').eq('id', payment.listing).single();
            if (mp) {
              sellerId = mp.seller;
              listingType = 'marketplace';
            } else {
              // Check if it's a service
              const { data: svc } = await supabaseAny.from('services').select('owner_id').eq('id', payment.listing).single();
              if (svc) {
                sellerId = svc.owner_id;
                listingType = 'service';
              }
            }

            if (sellerId) {
              const amountSats = Math.floor(Number(payment.amount) * 100_000_000);

              // 1. Create the Order
              const { data: order } = await supabaseAny.from('orders').insert({
                buyer_id: payment.user_id,
                seller_id: sellerId,
                listing_id: payment.listing,
                listing_type: listingType,
                amount_sats: amountSats,
                status: 'AWAITING_FULFILLMENT'
              }).select().single();

              if (order) {
                console.log(`Created Order ${order.id} for Listing ${payment.listing}`);

                // 2. Add funds to Seller's Escrow Balance
                const { data: wallet } = await supabaseAny.from('wallets').select('escrow_balance_sats').eq('user_id', sellerId).single();
                if (wallet) {
                  await supabaseAny.from('wallets')
                    .update({ escrow_balance_sats: Number(wallet.escrow_balance_sats) + amountSats })
                    .eq('user_id', sellerId);
                  console.log(`Added ${amountSats} sats to Escrow for User ${sellerId}`);
                }
                
                // 3. Optional: Create transaction ledger entry
                await supabaseAny.from('transactions').insert({
                  user_id: sellerId,
                  transaction_type: 'escrow',
                  related_type: listingType === 'marketplace' ? 'marketplace_order' : 'service_contract',
                  related_id: order.id,
                  amount_sats: amountSats,
                  net_amount_sats: amountSats,
                  status: 'pending',
                  description: `Funds held in escrow for order ${order.id}`
                });
              }
            }
          }
        }
      }
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).send('Webhook Error');
  }
};
