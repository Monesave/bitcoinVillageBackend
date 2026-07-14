// @ts-nocheck

import { supabase } from './supabase';
import { calculateCommission, calculateNetAmount, PLATFORM_FEE_PERCENTAGE, AppError } from '../../shared/src/utils';

interface CreateEscrowParams {
  buyerId: string;
  sellerId: string;
  amountSats: number;
  relatedType: 'marketplace_order' | 'service_contract' | 'bounty';
  relatedId: string;
  autoReleaseDays?: number;
}

/**
 * Create an escrow account for a transaction
 */
export const createEscrow = async (params: CreateEscrowParams) => {
  const { buyerId, sellerId, amountSats, relatedType, relatedId, autoReleaseDays = 7 } = params;

  // Calculate commission and net amount
  const commissionSats = calculateCommission(amountSats, PLATFORM_FEE_PERCENTAGE);
  const netAmountSats = calculateNetAmount(amountSats, PLATFORM_FEE_PERCENTAGE);

  // Create transaction record
  const { data: transaction, error: txError } = await supabase
    .from('transactions')
    .insert({
      user_id: buyerId,
      transaction_type: 'escrow',
      related_type: relatedType,
      related_id: relatedId,
      amount_sats: amountSats,
      commission_sats: commissionSats,
      net_amount_sats: netAmountSats,
      status: 'pending',
      description: `Escrow for ${relatedType}`,
    })
    .select()
    .single();

  if (txError || !transaction) {
    throw new AppError('Failed to create transaction', 500, 'TRANSACTION_ERROR');
  }

  // Calculate auto-release timestamp
  const autoReleaseAt = new Date();
  autoReleaseAt.setDate(autoReleaseAt.getDate() + autoReleaseDays);

  // Create escrow account
  const { data: escrow, error: escrowError } = await supabase
    .from('escrow_accounts')
    .insert({
      transaction_id: transaction.id,
      buyer_id: buyerId,
      seller_id: sellerId,
      amount_sats: netAmountSats,
      status: 'pending',
      auto_release_at: autoReleaseAt.toISOString(),
    })
    .select()
    .single();

  if (escrowError || !escrow) {
    // Rollback transaction if escrow creation fails
    await supabase.from('transactions').delete().eq('id', transaction.id);
    throw new AppError('Failed to create escrow', 500, 'ESCROW_ERROR');
  }

  // Update buyer's pending balance
  const { data: buyerWallet } = await supabase
    .from('wallets')
    .select('*')
    .eq('user_id', buyerId)
    .single();

  if (buyerWallet) {
    await supabase
      .from('wallets')
      .update({
        pending_balance_sats: buyerWallet.pending_balance_sats + amountSats,
      })
      .eq('user_id', buyerId);
  }

  return { transaction, escrow };
};

/**
 * Release escrow funds to seller
 */
export const releaseEscrow = async (escrowId: string) => {
  const { data: escrow, error: escrowError } = await supabase
    .from('escrow_accounts')
    .select('*, transaction:transactions(*)')
    .eq('id', escrowId)
    .single();

  if (escrowError || !escrow) {
    throw new AppError('Escrow not found', 404, 'ESCROW_NOT_FOUND');
  }

  if (escrow.status !== 'pending') {
    throw new AppError('Escrow already processed', 400, 'ESCROW_ALREADY_PROCESSED');
  }

  // Update escrow status
  const { error: updateError } = await supabase
    .from('escrow_accounts')
    .update({
      status: 'released',
      released_at: new Date().toISOString(),
    })
    .eq('id', escrowId);

  if (updateError) {
    throw new AppError('Failed to release escrow', 500, 'ESCROW_ERROR');
  }

  // Update transaction status
  await supabase
    .from('transactions')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', escrow.transaction_id);

  // Transfer funds from buyer's pending to seller's balance
  const { data: buyerWallet } = await supabase
    .from('wallets')
    .select('*')
    .eq('user_id', escrow.buyer_id)
    .single();

  const { data: sellerWallet } = await supabase
    .from('wallets')
    .select('*')
    .eq('user_id', escrow.seller_id)
    .single();

  if (buyerWallet) {
    await supabase
      .from('wallets')
      .update({
        pending_balance_sats: buyerWallet.pending_balance_sats - (escrow.transaction as any).amount_sats,
      })
      .eq('user_id', escrow.buyer_id);
  }

  if (sellerWallet) {
    await supabase
      .from('wallets')
      .update({
        balance_sats: sellerWallet.balance_sats + escrow.amount_sats,
        total_earned_sats: sellerWallet.total_earned_sats + escrow.amount_sats,
      })
      .eq('user_id', escrow.seller_id);
  }

  // Create commission transaction
  const commissionSats = (escrow.transaction as any).commission_sats;
  if (commissionSats > 0) {
    await supabase.from('transactions').insert({
      user_id: escrow.seller_id,
      transaction_type: 'commission',
      related_type: (escrow.transaction as any).related_type,
      related_id: (escrow.transaction as any).related_id,
      amount_sats: commissionSats,
      commission_sats: 0,
      net_amount_sats: commissionSats,
      status: 'completed',
      description: 'Platform commission',
    });
  }

  return escrow;
};

/**
 * Refund escrow to buyer
 */
export const refundEscrow = async (escrowId: string, reason?: string) => {
  const { data: escrow, error: escrowError } = await supabase
    .from('escrow_accounts')
    .select('*, transaction:transactions(*)')
    .eq('id', escrowId)
    .single();

  if (escrowError || !escrow) {
    throw new AppError('Escrow not found', 404, 'ESCROW_NOT_FOUND');
  }

  if (escrow.status !== 'pending') {
    throw new AppError('Escrow already processed', 400, 'ESCROW_ALREADY_PROCESSED');
  }

  // Update escrow status
  const { error: updateError } = await supabase
    .from('escrow_accounts')
    .update({
      status: 'refunded',
      released_at: new Date().toISOString(),
    })
    .eq('id', escrowId);

  if (updateError) {
    throw new AppError('Failed to refund escrow', 500, 'ESCROW_ERROR');
  }

  // Update transaction status
  await supabase
    .from('transactions')
    .update({
      status: 'cancelled',
      description: reason || 'Escrow refunded',
    })
    .eq('id', escrow.transaction_id);

  // Return funds to buyer
  const { data: buyerWallet } = await supabase
    .from('wallets')
    .select('*')
    .eq('user_id', escrow.buyer_id)
    .single();

  if (buyerWallet) {
    await supabase
      .from('wallets')
      .update({
        pending_balance_sats: buyerWallet.pending_balance_sats - (escrow.transaction as any).amount_sats,
        balance_sats: buyerWallet.balance_sats + (escrow.transaction as any).amount_sats,
      })
      .eq('user_id', escrow.buyer_id);
  }

  return escrow;
};

/**
 * Check and auto-release expired escrows
 */
export const checkAutoReleaseEscrows = async () => {
  const now = new Date().toISOString();

  const { data: expiredEscrows, error } = await supabase
    .from('escrow_accounts')
    .select('*')
    .eq('status', 'pending')
    .lte('auto_release_at', now);

  if (error) {
    console.error('Error checking auto-release escrows:', error);
    return;
  }

  if (!expiredEscrows || expiredEscrows.length === 0) {
    return;
  }

  // Release each expired escrow
  for (const escrow of expiredEscrows) {
    try {
      await releaseEscrow(escrow.id);
      console.log(`Auto-released escrow ${escrow.id}`);
    } catch (error) {
      console.error(`Failed to auto-release escrow ${escrow.id}:`, error);
    }
  }
};

