import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config({ path: './.env' });

async function test() {
  console.log('Testing DB insert...');
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: user, error: userError } = await supabase.from('users').select('id').limit(1).single();
  if (userError) {
    console.error('Failed to get user:', userError);
    return;
  }

  const { data: initialPayment, error: dbError } = await supabase
    .from('payments')
    .insert([
      {
        user_id: user.id,
        amount: 0.0001,
        status: 'PENDING',
      }
    ])
    .select()
    .single();

  if (dbError) {
    console.error('DB Insert Error:', dbError);
    return;
  }
  console.log('DB Insert Success:', initialPayment);

  console.log('Testing Strike API...');
  const STRIKE_API_KEY = process.env.STRIKE_API_KEY || 'E8F4A626F56CEC9F1ABAD099918D87AA6DD5B078F9A339E5CAD93AAB312D4EC9';
  const strikeClient = axios.create({
    baseURL: 'https://api.strike.me/v1',
    headers: {
      Authorization: `Bearer ${STRIKE_API_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  try {
    const response = await strikeClient.post('/invoices', {
      correlationId: initialPayment.id,
      description: 'Test invoice',
      amount: {
        amount: '0.0001',
        currency: 'BTC',
      },
    });
    console.log('Strike Create Success:', response.data);
  } catch (err: any) {
    console.error('Strike Error:', err.response?.data || err.message);
  }
}

test();
