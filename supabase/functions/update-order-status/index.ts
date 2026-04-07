import { corsHeaders, withCors } from '../_shared/cors.ts';
import { getAuthContext, requireRole } from '../_shared/auth.ts';
import { createSupabaseServiceClient } from '../_shared/supabase.ts';

const supabase = createSupabaseServiceClient();

const isUuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'PATCH') return withCors(new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 }));

  try {
    const ctx = await getAuthContext(req);
    requireRole(ctx, ['kitchen', 'admin']);

    const body = await req.json().catch(() => ({}));
    const orderId = body?.orderId ?? body?.order_id;
    const status = body?.status;

    if (!isUuid(orderId)) throw new Error('Invalid orderId');
    if (typeof status !== 'string' || !status.trim()) throw new Error('Invalid status');

    const { error } = await supabase.from('orders').update({ status }).eq('id', orderId);
    if (error) throw new Error(error.message);

    return withCors(new Response(JSON.stringify({ success: true }), { status: 200 }));
  } catch (err: any) {
    const msg = String(err?.message ?? err);
    const status = msg === 'Forbidden' ? 403 : msg === 'No token provided' || msg === 'Invalid or expired token' ? 401 : 400;
    return withCors(new Response(JSON.stringify({ error: msg }), { status }));
  }
});

