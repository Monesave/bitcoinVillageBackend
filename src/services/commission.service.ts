// @ts-nocheck
import { calculateCommission, calculateNetAmount, PLATFORM_FEE_PERCENTAGE } from "../../shared/src/utils";

/**
 * Calculate platform commission for a transaction
 */
export const calculateTransactionCommission = (amountSats: number): {
  amountSats: number;
  commissionSats: number;
  netAmountSats: number;
  feePercentage: number;
} => {
  const commissionSats = calculateCommission(amountSats, PLATFORM_FEE_PERCENTAGE);
  const netAmountSats = calculateNetAmount(amountSats, PLATFORM_FEE_PERCENTAGE);

  return {
    amountSats,
    commissionSats,
    netAmountSats,
    feePercentage: PLATFORM_FEE_PERCENTAGE,
  };
};

/**
 * Create commission transaction record
 */
export const createCommissionTransaction = async (
  userId: string,
  relatedType: string,
  relatedId: string,
  commissionSats: number
) => {
  const { supabase } = await import('./supabase');

  const { data, error } = await supabase
    .from('transactions')
    .insert({
      user_id: userId,
      transaction_type: 'commission',
      related_type: relatedType,
      related_id: relatedId,
      amount_sats: commissionSats,
      commission_sats: 0,
      net_amount_sats: commissionSats,
      status: 'completed',
      description: `Platform commission (${PLATFORM_FEE_PERCENTAGE}%)`,
      completed_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating commission transaction:', error);
    return null;
  }

  return data;
};

