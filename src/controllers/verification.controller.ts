// @ts-nocheck
import { Request, Response, NextFunction } from 'express';
import { supabase } from '../services/supabase';
import { veriffService } from '../services/veriff.service';
import { lightningService } from '../services/lightning.service';
import { strikeService } from '../services/strike.service';
import { AppError, usdToSats } from '../../shared/src/utils';

// Request verification (step 1: create verification session and payment invoice)
export const requestVerification = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError('Villager not authenticated', 401, 'UNAUTHORIZED');
    }

    // Check if Villager already has a pending or approved verification
    const { data: existingVerification } = await supabase
      .from('verifications')
      .select('*')
      .eq('user_id', req.user.id)
      .in('status', ['pending', 'approved'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (existingVerification) {
      const existingData = existingVerification as any;
      if (existingData.status === 'approved') {
        throw new AppError('Villager is already verified', 400, 'ALREADY_VERIFIED');
      }
      if (existingData.status === 'pending') {
        // Return existing verification session
        return res.json({
          success: true,
          message: 'Verification already in progress',
          data: {
            verification: existingVerification,
            paymentRequired: existingData.payment_status !== 'completed',
          },
        });
      }
    }

    // Get Villager profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', req.user.id)
      .single();

    if (!profile) {
      throw new AppError('Villager profile not found', 404, 'PROFILE_NOT_FOUND');
    }

    // Create Veriff verification session
    let veriffSession;
    try {
      veriffSession = await veriffService.createSession(
        req.user.id,
        req.user.email || '',
        'en'
      );
    } catch (error: any) {
      // If Veriff API fails, we'll still create the verification record
      // but mark it as needing Veriff setup
      console.error('Veriff session creation failed:', error.message);
      veriffSession = {
        id: `temp_${Date.now()}`,
        url: '',
        sessionToken: '',
      };
    }

    // Calculate payment amount: USD 10.00 in sats
    const paymentAmountUsd = 10.00;
    
    // Get current BTC/USD rate from Strike
    let paymentAmountSats = 0;
    try {
      const rate = await strikeService.getRate();
      paymentAmountSats = usdToSats(paymentAmountUsd, rate);
    } catch (error) {
      // Fallback rate if Strike API fails
      const fallbackRate = 50000; // Placeholder rate
      paymentAmountSats = usdToSats(paymentAmountUsd, fallbackRate);
      console.warn('Using fallback rate for verification fee calculation');
    }

    // Create Lightning invoice for payment
    let lightningInvoice;
    let lightningPaymentHash;
    
    try {
      lightningInvoice = await lightningService.createInvoice(
        paymentAmountSats,
        `Villager Verification Fee - ${req.user.email || req.user.id}`,
        `verification_${req.user.id}`
      );
      lightningPaymentHash = lightningInvoice.paymentHash;
    } catch (error: any) {
      throw new AppError(`Failed to create payment invoice: ${error.message}`, 500, 'INVOICE_ERROR');
    }

    // Create verification record
    const { data: verification, error: verificationError } = await (supabase
      .from('verifications')
      .insert({
        user_id: req.user.id,
        verriff_session_id: veriffSession.id,
        status: 'pending',
        payment_amount_usd: paymentAmountUsd,
        payment_amount_sats: paymentAmountSats,
        lightning_invoice: lightningInvoice.invoice,
        lightning_payment_hash: lightningPaymentHash,
        payment_status: 'pending',
      } as any) as any)
      .select()
      .single();

    if (verificationError) {
      throw new AppError('Failed to create verification record', 500, 'DATABASE_ERROR');
    }

    // Create transaction record
    if (!verification) {
      throw new AppError('Failed to create verification record', 500, 'DATABASE_ERROR');
    }
    
    const verificationData = verification as any;
    await supabase
      .from('transactions')
      // @ts-ignore - Supabase type inference issue
      .insert({
        user_id: req.user.id,
        transaction_type: 'verification_fee',
        related_type: 'verification',
        related_id: verificationData.id,
        amount_sats: paymentAmountSats,
        commission_sats: 0,
        net_amount_sats: paymentAmountSats,
        status: 'pending',
        lightning_invoice: lightningInvoice.invoice,
        lightning_payment_hash: lightningPaymentHash,
        description: 'Villager Verification Fee',
        metadata: {
          payment_amount_usd: paymentAmountUsd,
          verriff_session_id: veriffSession.id,
        },
      } as any);

    res.status(201).json({
      success: true,
      message: 'Verification request created successfully',
      data: {
        verification: {
          ...verification,
          veriffUrl: veriffSession.url,
          veriffSessionId: veriffSession.id,
        },
        payment: {
          invoice: lightningInvoice.invoice,
          paymentHash: lightningPaymentHash,
          amountSats: paymentAmountSats,
          amountUsd: paymentAmountUsd,
          expiry: lightningInvoice.expiry,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// Check payment status and proceed to Veriff verification
export const checkPaymentStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError('Villager not authenticated', 401, 'UNAUTHORIZED');
    }

    const { paymentHash } = req.params;

    // Get verification by payment hash
    const { data: verification, error: verificationError } = await supabase
      .from('verifications')
      .select('*')
      .eq('lightning_payment_hash', paymentHash)
      .eq('user_id', req.user.id)
      .single();

    if (verificationError || !verification) {
      throw new AppError('Verification not found', 404, 'VERIFICATION_NOT_FOUND');
    }

    // Check payment status via Lightning service
    let paymentSettled = false;
    if (verification.payment_status !== 'completed') {
      try {
        const status = await lightningService.checkInvoiceStatus(verification.lightning_payment_hash);
        paymentSettled = status.settled;

        if (paymentSettled) {
          // Update verification payment status
          await supabase
            .from('verifications')
            .update({ payment_status: 'completed' })
            .eq('id', verification.id);

          // Update transaction status
          await supabase
            .from('transactions')
            .update({
              status: 'completed',
              completed_at: new Date().toISOString(),
            })
            .eq('lightning_payment_hash', paymentHash);

          // Payment completed - Veriff URL will be returned separately
        }
      } catch (error: any) {
        console.error('Error checking payment status:', error);
      }
    } else {
      paymentSettled = true;
    }

    // Get Veriff session URL if payment is settled
    let veriffUrl = '';
    let veriffSessionId = verification.verriff_session_id;
    
    if (paymentSettled) {
      // If session doesn't exist or needs refresh, create new one
      if (!veriffSessionId || veriffSessionId.startsWith('temp_')) {
        try {
          const session = await veriffService.createSession(
            req.user.id,
            req.user.email || '',
            'en'
          );
          veriffUrl = session.url;
          veriffSessionId = session.id;
          
          // Update verification with new session ID
          await supabase
            .from('verifications')
            .update({ verriff_session_id: veriffSessionId })
            .eq('id', verification.id);
        } catch (error: any) {
          console.error('Error creating Veriff session:', error);
          // If Veriff fails, still allow proceeding (they can retry)
        }
      } else {
        // Use existing session - Veriff URL is typically constructed from session ID
        // You may need to fetch it from Veriff API or construct it based on your setup
        try {
          const status = await veriffService.getVerificationStatus(veriffSessionId);
          veriffUrl = status.verification?.url || '';
        } catch (error) {
          console.error('Error getting Veriff session URL:', error);
        }
      }
    }

    res.json({
      success: true,
      data: {
        verification: {
          ...verification,
          payment_status: paymentSettled ? 'completed' : verification.payment_status,
        },
        paymentSettled,
        veriffUrl,
        veriffSessionId,
        nextStep: paymentSettled ? 'veriff_verification' : 'payment_pending',
      },
    });
  } catch (error) {
    next(error);
  }
};

// Get verification status
export const getVerificationStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError('Villager not authenticated', 401, 'UNAUTHORIZED');
    }

    const { data: verification, error } = await supabase
      .from('verifications')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !verification) {
      return res.json({
        success: true,
        data: {
          verified: false,
          verification: null,
        },
      });
    }

    // Check Veriff status if payment is completed
    let veriffStatus = null;
    if (verification.payment_status === 'completed' && verification.verriff_session_id) {
      try {
        veriffStatus = await veriffService.getVerificationStatus(verification.verriff_session_id);
        
        // Update verification status if changed
        if (veriffStatus.status !== verification.status) {
          const updates: any = {
            status: veriffStatus.status,
            verification_data: veriffStatus.verification,
          };

          if (veriffStatus.status === 'approved' || veriffStatus.status === 'success') {
            updates.verified_at = new Date().toISOString();
            
            // Update profile to show verified badge
            await supabase
              .from('profiles')
              .update({
                is_verified_villager: true,
                verification_date: new Date().toISOString(),
              })
              .eq('id', req.user.id);
          }

          await supabase
            .from('verifications')
            .update(updates)
            .eq('id', verification.id);
        }
      } catch (error: any) {
        console.error('Error checking Veriff status:', error);
      }
    }

    res.json({
      success: true,
      data: {
        verified: verification.status === 'approved' || verification.status === 'success',
        verification: {
          ...verification,
          veriffStatus,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// Veriff webhook handler
export const veriffWebhook = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const signature = req.headers['x-signature'] as string;
    const payload = JSON.stringify(req.body);

    // Verify webhook signature
    if (!veriffService.verifyWebhookSignature(signature, payload)) {
      throw new AppError('Invalid webhook signature', 401, 'INVALID_SIGNATURE');
    }

    const webhook = veriffService.parseWebhook(req.body);
    
    // Find verification by session ID
    const { data: verification, error } = await supabase
      .from('verifications')
      .select('*')
      .eq('verriff_session_id', webhook.sessionId)
      .single();

    if (error || !verification) {
      console.error('Verification not found for session:', webhook.sessionId);
      return res.json({ success: true }); // Return success to Veriff even if not found
    }

    const verificationData = verification as any;

    // Update verification status
    const updates: any = {
      status: webhook.status,
      verification_data: webhook.verification,
    };

    if (webhook.status === 'approved' || webhook.status === 'success') {
      updates.verified_at = new Date().toISOString();
      
      // Update profile to show verified badge
      await supabase
        .from('profiles')
        // @ts-ignore - Supabase type inference issue
        .update({
          is_verified_villager: true,
          verification_date: new Date().toISOString(),
        } as any)
        .eq('id', verificationData.user_id);
    }

    await supabase
      .from('verifications')
      // @ts-ignore - Supabase type inference issue
      .update(updates)
      .eq('id', verificationData.id);

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
};

