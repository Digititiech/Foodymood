import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import cors from 'cors';
import dotenv from 'dotenv';
import http from 'http';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

dotenv.config();

const getEnv = (key: string) => {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
};

const supabase = createClient(getEnv('SUPABASE_URL'), getEnv('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const stripe = new Stripe(getEnv('STRIPE_SECRET_KEY'), { apiVersion: '2023-10-16' as any });

type AuthenticatedUser = {
  id: string;
  email?: string;
};

type UserProfile = {
  role: 'user' | 'admin' | 'kitchen';
  full_name: string | null;
};

type AuthenticatedRequest = Request & {
  user?: AuthenticatedUser;
  userProfile?: UserProfile;
};

type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'incomplete' | 'canceled' | 'expired';

const asyncHandler =
  (handler: (req: any, res: any, next: any) => Promise<any>) => (req: any, res: any, next: any) =>
    Promise.resolve(handler(req, res, next)).catch(next);

const isUuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const getClientIp = (req: Request) => {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length) return forwarded.split(',')[0].trim();
  return req.socket.remoteAddress ?? 'unknown';
};

const log = (level: 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>) => {
  const payload = { level, message, time: new Date().toISOString(), ...(meta ?? {}) };
  if (level === 'error') console.error(JSON.stringify(payload));
  else if (level === 'warn') console.warn(JSON.stringify(payload));
  else console.log(JSON.stringify(payload));
};

const createRateLimiter = (opts: { windowMs: number; max: number }) => {
  const hits = new Map<string, { resetAt: number; count: number }>();
  return (req: Request, res: Response, next: Function) => {
    const now = Date.now();
    const key = getClientIp(req);
    const current = hits.get(key);
    if (!current || current.resetAt <= now) {
      hits.set(key, { resetAt: now + opts.windowMs, count: 1 });
      return next();
    }
    if (current.count >= opts.max) {
      log('warn', 'rate_limited', { ip: key, path: req.path });
      return res.status(429).json({ error: 'Too many requests' });
    }
    current.count += 1;
    hits.set(key, current);
    next();
  };
};

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

async function listenOnAvailablePort(app: express.Express, preferredPort: number) {
  for (let port = preferredPort; port < preferredPort + 20; port++) {
    const server = http.createServer(app);
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '0.0.0.0', () => resolve());
      });
      return { server, port };
    } catch (err: any) {
      try {
        server.close();
      } catch {}
      if (err?.code === 'EADDRINUSE') continue;
      throw err;
    }
  }
  throw new Error(`No available port found starting at ${preferredPort}`);
}

async function startServer() {
  const app = express();
  const preferredPort = Number(process.env.PORT) || 3000;

  // --- MIDDLEWARE ---
  app.use(cors());
  app.use('/api/webhooks', createRateLimiter({ windowMs: 60_000, max: 60 }));
  app.use('/api/orders', createRateLimiter({ windowMs: 60_000, max: 120 }));
  
  const requireRole =
    (roles: Array<UserProfile['role']>) => (req: AuthenticatedRequest, res: Response, next: Function) => {
      const role = req.userProfile?.role;
      if (!role || !roles.includes(role)) return res.status(403).json({ error: 'Forbidden' });
      next();
    };

  // Stripe Webhook needs raw body
  app.post('/api/webhooks', express.raw({ type: 'application/json' }), asyncHandler(async (req: Request, res: Response) => {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) return res.status(500).json({ error: 'Stripe webhook is not configured' });

    const sig = req.headers['stripe-signature'] as string;
    if (!sig) return res.status(400).json({ error: 'Missing stripe-signature header' });

    let event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err: any) {
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    const { error: insertEventError } = await supabase
      .from('stripe_events')
      .insert({ event_id: event.id, event_type: event.type, status: 'processing' });

    if (insertEventError?.code === '23505') {
      const { data: existing } = await supabase
        .from('stripe_events')
        .select('status')
        .eq('event_id', event.id)
        .maybeSingle();

      if (existing?.status === 'processed' || existing?.status === 'processing') return res.json({ received: true });

      const { data: updated, error: retryUpdateError } = await supabase
        .from('stripe_events')
        .update({ status: 'processing', last_error: null })
        .eq('event_id', event.id)
        .eq('status', 'failed')
        .select('event_id')
        .maybeSingle();

      if (retryUpdateError || !updated) return res.json({ received: true });
    } else if (insertEventError) {
      return res.status(500).json({ error: 'Failed to persist webhook event' });
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
          const shouldResetCredits =
            billingReason === 'subscription_cycle' || billingReason === 'subscription_create';

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
            await supabase
              .from('subscriptions')
              .update({ status: 'past_due' })
              .eq('stripe_subscription_id', failedInvoice.subscription);
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

          const { data: plan, error: planError } = await supabase
            .from('plans')
            .select('id')
            .eq('stripe_price_id', priceId)
            .single();
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
            await supabase
              .from('orders')
              .update({ status: 'paid', stripe_payment_id: paymentIntent })
              .eq('id', orderId);
          }
          break;
        }
      }

      await supabase
        .from('stripe_events')
        .update({ status: 'processed', processed_at: new Date().toISOString(), last_error: null })
        .eq('event_id', event.id);

      log('info', 'stripe_webhook_processed', { eventId: event.id, eventType: event.type });
      res.json({ received: true });
    } catch (err: any) {
      await supabase
        .from('stripe_events')
        .update({ status: 'failed', last_error: String(err?.message ?? err) })
        .eq('event_id', event.id);
      log('error', 'stripe_webhook_failed', { eventId: event.id, eventType: event.type, error: String(err?.message ?? err) });
      res.status(400).json({ error: 'Webhook processing failed' });
    }
  }));

  // Regular JSON parsing for other routes
  app.use(express.json());

  // --- AUTH MIDDLEWARE ---
  const authenticateUser = asyncHandler(async (req: AuthenticatedRequest, res: Response, next: Function) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      log('warn', 'auth_missing_token', { ip: getClientIp(req), path: req.path });
      return res.status(401).json({ error: 'No token provided' });
    }

    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      log('warn', 'auth_invalid_token', { ip: getClientIp(req), path: req.path });
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    req.user = { id: user.id, email: user.email ?? undefined };
    const { data: profile } = await supabase.from('users').select('role, full_name').eq('id', user.id).maybeSingle();
    if (profile?.role) req.userProfile = profile as UserProfile;
    next();
  });

  // --- API ROUTES ---

  app.get('/api/menu', asyncHandler(async (req, res) => {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('daily_menus')
      .select('menu_date, meals(*)')
      .eq('menu_date', date);
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  }));

  app.get('/api/subscription/:userId', authenticateUser, asyncHandler(async (req, res) => {
    const userId = (req as AuthenticatedRequest).user!.id;
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*, plans(*)')
      .eq('user_id', userId)
      .order('current_period_end', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error && error.code !== 'PGRST116') return res.status(500).json({ error: error.message });
    res.json(data || { message: "No active subscription" });
  }));

  app.post('/api/orders', authenticateUser, asyncHandler(async (req, res) => {
    const { subscriptionId, deliveryType, zipCode, items } = req.body;
    const userId = (req as AuthenticatedRequest).user!.id;

    if (!subscriptionId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Invalid request' });
    }

    if (!isUuid(subscriptionId)) return res.status(400).json({ error: 'Invalid subscriptionId' });

    const normalizedDeliveryType = deliveryType ?? 'pickup';
    if (normalizedDeliveryType !== 'pickup' && normalizedDeliveryType !== 'delivery') {
      return res.status(400).json({ error: 'Invalid deliveryType' });
    }

    if (normalizedDeliveryType === 'delivery') {
      if (typeof zipCode !== 'string' || zipCode.trim().length === 0) {
        return res.status(400).json({ error: 'zipCode is required for delivery' });
      }
      const { data: zone } = await supabase
        .from('delivery_zones')
        .select('zip_code')
        .eq('zip_code', zipCode)
        .eq('is_active', true)
        .maybeSingle();
      if (!zone) return res.status(400).json({ error: 'ZIP not serviceable' });
    }

    const normalizedItems = items.map((item: any) => ({
      meal_id: item.meal_id ?? item.mealId,
      quantity: item.quantity,
    }));

    for (const item of normalizedItems) {
      if (!isUuid(item.meal_id)) return res.status(400).json({ error: 'Invalid meal_id' });
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
        return res.status(400).json({ error: 'Invalid quantity' });
      }
    }

    const { data: orderId, error: createOrderError } = await supabase.rpc('create_order_atomic_with_items', {
      p_user_id: userId,
      p_subscription_id: subscriptionId,
      p_delivery_type: normalizedDeliveryType,
      p_zip_code: normalizedDeliveryType === 'delivery' ? zipCode : null,
      p_items: normalizedItems,
    });

    if (createOrderError) return res.status(400).json({ error: createOrderError.message });

    log('info', 'order_created', { userId, orderId, deliveryType: normalizedDeliveryType });
    res.json({ message: 'Order placed', orderId });
  }));

  app.get('/api/orders/:userId', authenticateUser, asyncHandler(async (req, res) => {
    const userId = (req as AuthenticatedRequest).user!.id;
    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(quantity, meals(name))')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  }));

  app.get('/api/delivery/check/:zip', asyncHandler(async (req, res) => {
    const { data, error } = await supabase
      .from('delivery_zones')
      .select('delivery_fee')
      .eq('zip_code', req.params.zip)
      .eq('is_active', true)
      .single();
    if (error || !data) return res.status(404).json({ error: "Not serviceable" });
    res.json(data);
  }));

  // --- ADMIN & KITCHEN ROUTES ---

  app.get('/api/admin/stats', authenticateUser, requireRole(['admin']), asyncHandler(async (req, res) => {
    // Simplified stats for demo
    const { count: totalUsers } = await supabase.from('users').select('*', { count: 'exact', head: true });
    const { count: activeSubs } = await supabase.from('subscriptions').select('*', { count: 'exact', head: true }).eq('status', 'active');
    const { count: todayOrders } = await supabase.from('orders').select('*', { count: 'exact', head: true }).eq('order_date', new Date().toISOString().split('T')[0]);
    
    res.json({ totalUsers, activeSubs, todayOrders });
  }));

  app.post('/api/admin/menu', authenticateUser, requireRole(['admin']), asyncHandler(async (req, res) => {
    const { date, mealIds } = req.body;

    if (typeof date !== 'string' || date.trim().length === 0) return res.status(400).json({ error: 'Invalid date' });
    if (!Array.isArray(mealIds) || mealIds.length === 0) return res.status(400).json({ error: 'mealIds is required' });
    for (const id of mealIds) {
      if (!isUuid(id)) return res.status(400).json({ error: 'Invalid meal id' });
    }

    const { error: deleteError } = await supabase.from('daily_menus').delete().eq('menu_date', date);
    if (deleteError) return res.status(500).json({ error: deleteError.message });

    const inserts = mealIds.map((id: string) => ({ menu_date: date, meal_id: id }));
    const { error: insertError } = await supabase.from('daily_menus').insert(inserts);
    if (insertError) return res.status(500).json({ error: insertError.message });

    res.json({ success: true });
  }));

  app.get('/api/kitchen/orders', authenticateUser, requireRole(['kitchen', 'admin']), asyncHandler(async (req, res) => {
    const { data, error } = await supabase
      .from('orders')
      .select('*, users(full_name), order_items(quantity, meals(name))')
      .eq('order_date', new Date().toISOString().split('T')[0])
      .order('created_at', { ascending: true });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  }));

  app.patch('/api/orders/:id/status', authenticateUser, requireRole(['kitchen', 'admin']), asyncHandler(async (req, res) => {
    const { status } = req.body;
    const { error } = await supabase.from('orders').update({ status }).eq('id', req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  }));

  // --- VITE MIDDLEWARE ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, ws: false },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.use((err: any, req: Request, res: Response, next: Function) => {
    if (res.headersSent) return next(err);
    log('error', 'unhandled_error', { path: req.path, error: String(err?.message ?? err) });
    res.status(500).json({ error: 'Internal server error' });
  });

  const { port } = await listenOnAvailablePort(app, preferredPort);
  console.log(`🚀 Server running on http://localhost:${port}`);
}

startServer();
