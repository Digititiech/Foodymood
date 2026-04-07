import { corsHeaders, withCors } from '../_shared/cors.ts';
import { getAuthContext, requireRole } from '../_shared/auth.ts';
import { createSupabaseServiceClient } from '../_shared/supabase.ts';

const supabase = createSupabaseServiceClient();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'GET') return withCors(new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 }));

  try {
    const ctx = await getAuthContext(req);
    requireRole(ctx, ['admin']);

    const today = new Date().toISOString().split('T')[0];
    const { count: totalUsers, error: usersError } = await supabase.from('users').select('*', { count: 'exact', head: true });
    if (usersError) throw new Error(usersError.message);

    const { count: activeSubs, error: subsError } = await supabase
      .from('subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');
    if (subsError) throw new Error(subsError.message);

    const { count: todayOrders, error: ordersError } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('order_date', today);
    if (ordersError) throw new Error(ordersError.message);

    return withCors(new Response(JSON.stringify({ totalUsers, activeSubs, todayOrders }), { status: 200 }));
  } catch (err: any) {
    const msg = String(err?.message ?? err);
    const status = msg === 'Forbidden' ? 403 : msg === 'No token provided' || msg === 'Invalid or expired token' ? 401 : 400;
    return withCors(new Response(JSON.stringify({ error: msg }), { status }));
  }
});

