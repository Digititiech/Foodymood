import { corsHeaders, withCors } from '../_shared/cors.ts';
import { getAuthContext } from '../_shared/auth.ts';
import { createSupabaseServiceClient } from '../_shared/supabase.ts';

const supabase = createSupabaseServiceClient();

const isUuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return withCors(new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 }));

  try {
    const ctx = await getAuthContext(req);
    const body = await req.json().catch(() => ({}));

    const subscriptionId = body?.subscriptionId ?? body?.subscription_id;
    const deliveryType = body?.deliveryType ?? body?.delivery_type ?? 'pickup';
    const zipCode = body?.zipCode ?? body?.zip_code ?? null;
    const items = body?.items;

    if (!isUuid(subscriptionId)) throw new Error('Invalid subscriptionId');
    if (deliveryType !== 'pickup' && deliveryType !== 'delivery') throw new Error('Invalid deliveryType');
    if (!Array.isArray(items) || items.length === 0) throw new Error('Items are required');

    const normalizedItems = items.map((item: any) => ({
      meal_id: item.meal_id ?? item.mealId,
      quantity: item.quantity,
    }));

    for (const item of normalizedItems) {
      if (!isUuid(item.meal_id)) throw new Error('Invalid meal_id');
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) throw new Error('Invalid quantity');
    }

    if (deliveryType === 'delivery') {
      const zip = typeof zipCode === 'string' ? zipCode.trim() : '';
      if (!zip) throw new Error('zipCode is required for delivery');
      const { data: zone } = await supabase
        .from('delivery_zones')
        .select('zip_code')
        .eq('zip_code', zip)
        .eq('is_active', true)
        .maybeSingle();
      if (!zone) throw new Error('Delivery not available in your area');
    }

    const { data: orderId, error } = await supabase.rpc('create_order_atomic_with_items', {
      p_user_id: ctx.userId,
      p_subscription_id: subscriptionId,
      p_delivery_type: deliveryType,
      p_zip_code: deliveryType === 'delivery' ? String(zipCode).trim() : null,
      p_items: normalizedItems,
    });

    if (error) throw new Error(error.message);

    return withCors(new Response(JSON.stringify({ message: 'Order placed', orderId }), { status: 200 }));
  } catch (err: any) {
    const msg = String(err?.message ?? err);
    const status = msg === 'Forbidden' ? 403 : msg === 'No token provided' || msg === 'Invalid or expired token' ? 401 : 400;
    return withCors(new Response(JSON.stringify({ error: msg }), { status }));
  }
});

