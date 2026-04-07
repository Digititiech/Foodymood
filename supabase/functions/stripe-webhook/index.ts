import Stripe from 'npm:stripe@22.0.0';
import { Buffer } from 'node:buffer';
import { corsHeaders, withCors } from '../_shared/cors.ts';
import { createSupabaseServiceClient, supabaseUrl } from '../_shared/supabase.ts';

const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
const stripeWebhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');

if (!stripeSecretKey) throw new Error('Missing required env var: STRIPE_SECRET_KEY');
if (!stripeWebhookSecret) throw new Error('Missing required env var: STRIPE_WEBHOOK_SECRET');

const stripe = new Stripe(stripeSecretKey, { apiVersion: '2023-10-16' as any });
const supabase = createSupabaseServiceClient();

type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'incomplete' | 'canceled' | 'expired';

const mapStripeSubscriptionStatus = (stripeStatus: string): SubscriptionStatus => {
  switch (stripeStatus) {
    case 'active':
      return 'active';
    case 'trialing':
      return 'trialing';
    case 'past_due':
      return 'past_due';
    case 'incomplete':
      return 'incomplete';
    case 'canceled':
      return 'canceled';
    case 'incomplete_expired':
    case 'unpaid':
    case 'paused':
    default:
      return 'expired';
  }
};

const toIsoFromUnixSeconds = (value: unknown) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return new Date(value * 1000).toISOString();
};

const isUuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return withCors(new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 }));

  const sig = req.headers.get('stripe-signature');
  if (!sig) return withCors(new Response(JSON.stringify({ error: 'Missing stripe-signature header' }), { status: 400 }));

  const raw = new Uint8Array(await req.arrayBuffer());
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(Buffer.from(raw), sig, stripeWebhookSecret);
  } catch (err: any) {
    return withCors(new Response(JSON.stringify({ error: `Webhook Error: ${err?.message ?? String(err)}` }), { status: 400 }));
  }

  const { error: insertEventError } = await supabase
    .from('stripe_events')
    .insert({ event_id: event.id, event_type: event.type, status: 'processing' });

  if (insertEventError?.code === '23505') {
    const { data: existing } = await supabase.from('stripe_events').select('status').eq('event_id', event.id).maybeSingle();
    if (existing?.status === 'processed' || existing?.status === 'processing') {
      return withCors(new Response(JSON.stringify({ received: true }), { status: 200 }));
    }

    const { data: updated, error: retryUpdateError } = await supabase
      .from('stripe_events')
      .update({ status: 'processing', last_error: null })
      .eq('event_id', event.id)
      .eq('status', 'failed')
      .select('event_id')
      .maybeSingle();

    if (retryUpdateError || !updated) return withCors(new Response(JSON.stringify({ received: true }), { status: 200 }));
  } else if (insertEventError) {
    return withCors(new Response(JSON.stringify({ error: 'Failed to persist webhook event' }), { status: 500 }));
  }

  try {
    switch (event.type) {
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as any;
        const subscriptionId = invoice?.subscription;
        if (!subscriptionId) throw new Error('Missing subscription on invoice');

        const stripeSub = await stripe.subscriptions.retrieve(subscriptionId);
        if ('deleted' in stripeSub && stripeSub.deleted) throw new Error('Subscription is deleted in Stripe');

        const { userId } = stripeSub.metadata ?? {};
        if (!userId) throw new Error('Missing required metadata: userId');
        if (!isUuid(userId)) throw new Error('Invalid metadata format: userId');

        const priceId = stripeSub.items?.data?.[0]?.price?.id;
        if (!priceId) throw new Error('Missing stripe price on subscription');

        const { data: plan, error: planError } = await supabase
          .from('plans')
          .select('id, meals_per_cycle')
          .eq('stripe_price_id', priceId)
          .single();
        if (planError || !plan) throw new Error('Plan not found for stripe_price_id');

        const stripePeriodStart = (stripeSub as any).current_period_start;
        const stripePeriodEnd = (stripeSub as any).current_period_end;
        if (!stripePeriodEnd) throw new Error('Missing current_period_end on subscription');

        const billingReason = invoice?.billing_reason;
        const shouldResetCredits = billingReason === 'subscription_cycle' || billingReason === 'subscription_create';

        const { data: existingSub } = await supabase
          .from('subscriptions')
          .select('id, remaining_credits, last_reset_period_end')
          .eq('stripe_subscription_id', subscriptionId)
          .maybeSingle();

        const periodEndIso = toIsoFromUnixSeconds(stripePeriodEnd);
        const periodStartIso = toIsoFromUnixSeconds(stripePeriodStart);

        const alreadyResetThisPeriod = Boolean(
          existingSub?.last_reset_period_end && periodEndIso && existingSub.last_reset_period_end === periodEndIso
        );

        const nextRemainingCredits =
          shouldResetCredits && !alreadyResetThisPeriod ? plan.meals_per_cycle : existingSub?.remaining_credits ?? 0;

        const nextLastResetPeriodEnd =
          shouldResetCredits && !alreadyResetThisPeriod ? periodEndIso : existingSub?.last_reset_period_end ?? null;

        await supabase.from('subscriptions').upsert(
          {
            user_id: userId,
            plan_id: plan.id,
            stripe_subscription_id: subscriptionId,
            status: mapStripeSubscriptionStatus(stripeSub.status),
            remaining_credits: nextRemainingCredits,
            current_period_start: periodStartIso,
            current_period_end: periodEndIso,
            cancel_at_period_end: Boolean(stripeSub.cancel_at_period_end),
            cancel_at: toIsoFromUnixSeconds(stripeSub.cancel_at),
            canceled_at: toIsoFromUnixSeconds(stripeSub.canceled_at),
            last_reset_period_end: nextLastResetPeriodEnd,
          },
          { onConflict: 'stripe_subscription_id' }
        );
        break;
      }

      case 'invoice.payment_failed': {
        const failedInvoice = event.data.object as any;
        if (failedInvoice?.subscription) {
          await supabase.from('subscriptions').update({ status: 'past_due' }).eq('stripe_subscription_id', failedInvoice.subscription);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const stripeSub = event.data.object as any;
        const userId = stripeSub?.metadata?.userId;
        if (!userId) throw new Error('Missing required metadata: userId');
        if (!isUuid(userId)) throw new Error('Invalid metadata format: userId');

        const subscriptionId = stripeSub?.id;
        if (!subscriptionId) throw new Error('Missing subscription id');

        const priceId = stripeSub?.items?.data?.[0]?.price?.id;
        if (!priceId) throw new Error('Missing stripe price on subscription');

        const { data: plan, error: planError } = await supabase.from('plans').select('id').eq('stripe_price_id', priceId).single();
        if (planError || !plan) throw new Error('Plan not found for stripe_price_id');

        const { data: existingSub } = await supabase
          .from('subscriptions')
          .select('remaining_credits, last_reset_period_end')
          .eq('stripe_subscription_id', subscriptionId)
          .maybeSingle();

        await supabase.from('subscriptions').upsert(
          {
            user_id: userId,
            plan_id: plan.id,
            stripe_subscription_id: subscriptionId,
            status: mapStripeSubscriptionStatus(String(stripeSub.status)),
            remaining_credits: existingSub?.remaining_credits ?? 0,
            current_period_start: toIsoFromUnixSeconds((stripeSub as any).current_period_start),
            current_period_end: toIsoFromUnixSeconds((stripeSub as any).current_period_end),
            cancel_at_period_end: Boolean(stripeSub.cancel_at_period_end),
            cancel_at: toIsoFromUnixSeconds(stripeSub.cancel_at),
            canceled_at: toIsoFromUnixSeconds(stripeSub.canceled_at),
            last_reset_period_end: existingSub?.last_reset_period_end ?? null,
          },
          { onConflict: 'stripe_subscription_id' }
        );
        break;
      }

      case 'customer.subscription.deleted': {
        const stripeSub = event.data.object as any;
        const subscriptionId = stripeSub?.id;
        if (!subscriptionId) throw new Error('Missing subscription id');

        await supabase
          .from('subscriptions')
          .update({
            status: 'canceled',
            cancel_at_period_end: false,
            canceled_at: toIsoFromUnixSeconds(stripeSub.canceled_at) ?? new Date().toISOString(),
          })
          .eq('stripe_subscription_id', subscriptionId);
        break;
      }

      case 'checkout.session.completed': {
        const session = event.data.object as any;
        if (session?.metadata?.type === 'delivery_fee') {
          const orderId = session?.metadata?.orderId;
          const paymentIntent = session?.payment_intent;
          if (!orderId) throw new Error('Missing orderId in checkout session metadata');
          if (!paymentIntent) throw new Error('Missing payment_intent on checkout session');
          await supabase.from('orders').update({ status: 'paid', stripe_payment_id: paymentIntent }).eq('id', orderId);
        }
        break;
      }
    }

    await supabase
      .from('stripe_events')
      .update({ status: 'processed', processed_at: new Date().toISOString(), last_error: null })
      .eq('event_id', event.id);

    return withCors(new Response(JSON.stringify({ received: true, project: supabaseUrl() }), { status: 200 }));
  } catch (err: any) {
    await supabase
      .from('stripe_events')
      .update({ status: 'failed', last_error: String(err?.message ?? err) })
      .eq('event_id', event.id);

    return withCors(new Response(JSON.stringify({ error: 'Webhook processing failed' }), { status: 400 }));
  }
});

