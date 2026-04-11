import { corsHeaders, withCors } from '../_shared/cors.ts';
import { getAuthContext } from '../_shared/auth.ts';
import { createSupabaseServiceClient } from '../_shared/supabase.ts';

const supabase = createSupabaseServiceClient();

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

const isUuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const findLatestActiveSubscriptionId = async (userId: string) => {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .gt('current_period_end', nowIso)
    .order('current_period_end', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.id as string | undefined) ?? null;
};

const ensureTestSubscription = async (userId: string, creditLimit: number) => {
  const { data: plan, error: planError } = await supabase.from('plans').select('id').eq('name', 'Test Plan').maybeSingle();
  if (planError) throw new Error(planError.message);

  let planId = plan?.id as string | undefined;
  if (!planId) {
    const insertWithPrice = async () =>
      await supabase
        .from('plans')
        .insert({ name: 'Test Plan', meals_per_cycle: 10000, price: 0, is_active: false } as any)
        .select('id')
        .maybeSingle();

    const insertWithPriceCents = async () =>
      await supabase
        .from('plans')
        .insert({ name: 'Test Plan', meals_per_cycle: 10000, price_cents: 0, is_active: false } as any)
        .select('id')
        .maybeSingle();

    let createdPlan: { id?: string } | null = null;
    let createdPlanError: { message: string } | null = null;

    const first = await insertWithPrice();
    createdPlan = first.data as any;
    createdPlanError = first.error ? ({ message: first.error.message } as any) : null;

    if (!createdPlan?.id && createdPlanError?.message?.includes("price'")) {
      const second = await insertWithPriceCents();
      createdPlan = second.data as any;
      createdPlanError = second.error ? ({ message: second.error.message } as any) : null;
    }

    if (createdPlanError) throw new Error(createdPlanError.message);
    planId = createdPlan?.id as string | undefined;
  }

  if (!planId) throw new Error('Failed to create test plan');

  const stripeSubscriptionId = `test_${userId}`;
  const { data: sub, error: subError } = await supabase
    .from('subscriptions')
    .select('id, remaining_credits, status, current_period_end')
    .eq('stripe_subscription_id', stripeSubscriptionId)
    .maybeSingle();
  if (subError) throw new Error(subError.message);

  if (sub?.id) {
    const current = typeof sub.remaining_credits === 'number' ? sub.remaining_credits : creditLimit;
    const nextCredits = Math.min(current, creditLimit);
    const now = new Date();
    const farFuture = new Date(now.getTime() + 10 * 365 * 24 * 60 * 60 * 1000);
    const needsRenewal =
      sub.status !== 'active' ||
      typeof sub.current_period_end !== 'string' ||
      new Date(sub.current_period_end) <= now;

    if (nextCredits !== current || needsRenewal) {
      const { error: updateError } = await supabase
        .from('subscriptions')
        .update({
          remaining_credits: nextCredits,
          status: 'active',
          current_period_start: now.toISOString(),
          current_period_end: farFuture.toISOString(),
        })
        .eq('id', sub.id);
      if (updateError) throw new Error(updateError.message);
    }
    return sub.id as string;
  }

  const now = new Date();
  const farFuture = new Date(now.getTime() + 10 * 365 * 24 * 60 * 60 * 1000);

  const { data: createdSub, error: createdSubError } = await supabase
    .from('subscriptions')
    .insert({
      user_id: userId,
      plan_id: planId,
      stripe_subscription_id: stripeSubscriptionId,
      status: 'active',
      remaining_credits: creditLimit,
      current_period_start: now.toISOString(),
      current_period_end: farFuture.toISOString(),
    })
    .select('id')
    .maybeSingle();
  if (createdSubError) throw new Error(createdSubError.message);

  if (!createdSub?.id) throw new Error('Failed to create test subscription');
  return createdSub.id as string;
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return withCors(new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 }));

  try {
    const ctx = await getAuthContext(req);
    const body = await req.json().catch(() => ({}));

    const rawSubscriptionId = body?.subscriptionId ?? body?.subscription_id;
    const deliveryType = body?.deliveryType ?? body?.delivery_type ?? 'pickup';
    const zipCode = body?.zipCode ?? body?.zip_code ?? null;
    const items = body?.items;

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

    const isPrivileged = ctx.role === 'dev' || ctx.role === 'admin' || ctx.role === 'kitchen';
    const privilegedCreditLimit = ctx.role === 'dev' || ctx.role === 'admin' ? 120 : 10000;
    const subscriptionId: string | null =
      ctx.role === 'dev' || ctx.role === 'admin'
        ? await ensureTestSubscription(ctx.userId, privilegedCreditLimit)
        : isUuid(rawSubscriptionId)
          ? rawSubscriptionId
          : ctx.role === 'kitchen'
            ? await ensureTestSubscription(ctx.userId, privilegedCreditLimit)
            : await findLatestActiveSubscriptionId(ctx.userId);
    if (!subscriptionId) throw new Error('No active subscription');

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

    const run = async (subId: string) =>
      await supabase.rpc('create_order_atomic_with_items', {
        p_user_id: ctx.userId,
        p_subscription_id: subId,
        p_delivery_type: deliveryType,
        p_zip_code: deliveryType === 'delivery' ? String(zipCode).trim() : null,
        p_items: normalizedItems,
      });

    let res = await run(subscriptionId);
    if (res.error && isPrivileged) {
      const testSubId = await ensureTestSubscription(ctx.userId, privilegedCreditLimit);
      res = await run(testSubId);
    }

    if (res.error) throw new Error(res.error.message);

    return withCors(new Response(JSON.stringify({ message: 'Order placed', orderId: res.data }), { status: 200 }));
  } catch (err: any) {
    const msg = String(err?.message ?? err);
    const status = msg === 'Forbidden' ? 403 : msg === 'No token provided' || msg === 'Invalid or expired token' ? 401 : 400;
    return withCors(new Response(JSON.stringify({ error: msg }), { status }));
  }
});
