import { Request, Response, NextFunction } from 'express';
import { supabase, createUserClient } from '../services/supabase';
import { AppError } from '../../shared/src/utils';

const getAccessToken = (req: Request): string | undefined => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return undefined;
};

// Get orders where user is buyer or seller
export const getOrders = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    const accessToken = getAccessToken(req);

    if (!userId || !accessToken) {
      throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
    }

    const db = createUserClient(accessToken);
    const role = req.query.role as 'buyer' | 'seller';

    const dbAny = db as any;
    let query = dbAny.from('orders').select('*').order('created_at', { ascending: false });

    if (role === 'buyer') {
      query = query.eq('buyer_id', userId);
    } else if (role === 'seller') {
      query = query.eq('seller_id', userId);
    } else {
      query = query.or(`buyer_id.eq.${userId},seller_id.eq.${userId}`);
    }

    const { data: orders, error } = await query;

    if (error) {
      throw new AppError('Failed to fetch orders', 500, 'DATABASE_ERROR');
    }

    res.json({
      success: true,
      data: orders,
    });
  } catch (error) {
    next(error);
  }
};

// Update order status (Escrow Release Logic)
export const updateOrderStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { status, shippingDetails } = req.body;
    const userId = req.user?.id;
    const accessToken = getAccessToken(req);

    if (!userId || !accessToken) {
      throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
    }

    const db = createUserClient(accessToken);
    const dbAny = db as any;
    const supabaseAny = supabase as any;

    // Fetch the order
    const { data: order, error: fetchError } = await dbAny
      .from('orders')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !order) {
      throw new AppError('Order not found', 404, 'NOT_FOUND');
    }

    // Authorization checks
    if (status === 'SHIPPED' && order.seller_id !== userId) {
      throw new AppError('Only the seller can mark as shipped', 403, 'FORBIDDEN');
    }

    if (status === 'COMPLETED' && order.buyer_id !== userId) {
      throw new AppError('Only the buyer can mark as completed', 403, 'FORBIDDEN');
    }

    // Update the order
    const updateData: any = { status };
    if (shippingDetails) updateData.shipping_details = shippingDetails;

    const { error: updateError } = await dbAny
      .from('orders')
      .update(updateData)
      .eq('id', id);

    if (updateError) {
      throw new AppError('Failed to update order', 500, 'DATABASE_ERROR');
    }

    // Escrow Release Logic
    if (status === 'COMPLETED' && order.status !== 'COMPLETED') {
      // Deduct from escrow_balance_sats and add to balance_sats for the seller
      const { data: wallet } = await supabaseAny.from('wallets').select('*').eq('user_id', order.seller_id).single();
      if (wallet) {
        // Platform fee 2.5%
        const feePercent = 0.025;
        const feeSats = Math.floor(order.amount_sats * feePercent);
        const netSats = order.amount_sats - feeSats;

        await supabaseAny.from('wallets')
          .update({
            escrow_balance_sats: Number(wallet.escrow_balance_sats) - order.amount_sats,
            balance_sats: Number(wallet.balance_sats) + netSats,
            total_earned_sats: Number(wallet.total_earned_sats) + netSats
          })
          .eq('user_id', order.seller_id);

        // Update transaction status to completed
        await supabaseAny.from('transactions')
          .update({
            status: 'completed',
            commission_sats: feeSats,
            net_amount_sats: netSats,
            description: `Escrow released for order ${order.id}. Fee: 2.5%`
          })
          .eq('related_id', order.id);
      }
    }

    res.json({
      success: true,
      data: { ...order, ...updateData },
    });
  } catch (error) {
    next(error);
  }
};
