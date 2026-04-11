import { createClient } from 'npm:@supabase/supabase-js@2.101.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
};

const withCors = (res: Response) => {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(corsHeaders)) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
};

declare const Deno: {
  env: { get: (key: string) => string | undefined };
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

const getEnv = (key: string) => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
};

const createSupabaseServiceClient = () =>
  createClient(getEnv('SUPABASE_URL'), getEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

const createSupabaseAuthClient = (authorizationHeader: string | null) =>
  createClient(getEnv('SUPABASE_URL'), getEnv('SUPABASE_ANON_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: authorizationHeader ? { Authorization: authorizationHeader } : {} },
  });

type Role = 'user' | 'admin' | 'kitchen' | 'dev';
type AuthContext = { userId: string; email: string | null; role: Role; fullName: string | null };

const getAuthContext = async (req: Request): Promise<AuthContext> => {
  const authorization = req.headers.get('authorization');
  if (!authorization?.toLowerCase().startsWith('bearer ')) throw new Error('No token provided');

  const authClient = createSupabaseAuthClient(authorization);
  const { data, error } = await authClient.auth.getUser();
  if (error || !data?.user) throw new Error('Invalid or expired token');

  const userId = data.user.id;
  const email = data.user.email ?? null;

  const svc = createSupabaseServiceClient();
  const { data: profile, error: profileError } = await svc.from('users').select('role, full_name').eq('id', userId).maybeSingle();
  if (profileError || !profile?.role) throw new Error('User profile not found');

  return { userId, email, role: profile.role as Role, fullName: profile.full_name ?? null };
};

const requireRole = (ctx: AuthContext, roles: Role[]) => {
  if (ctx.role === 'dev') return;
  if (!roles.includes(ctx.role)) throw new Error('Forbidden');
};

const supabase = createSupabaseServiceClient();

const isUuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const asOptionalTrimmedString = (value: unknown) => {
  if (typeof value !== 'string') return undefined;
  const v = value.trim();
  return v ? v : undefined;
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST' && req.method !== 'PATCH' && req.method !== 'DELETE')
    return withCors(new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 }));

  try {
    const ctx = await getAuthContext(req);
    requireRole(ctx, ['admin', 'kitchen']);

    const body = await req.json().catch(() => ({}));

    if (req.method === 'POST') {
      if (body?.action === 'used_in_orders') {
        const mealIds = body?.mealIds ?? [];
        if (!Array.isArray(mealIds)) throw new Error('mealIds must be an array');
        for (const id of mealIds) if (!isUuid(id)) throw new Error('Invalid meal id');

        if (mealIds.length === 0) return withCors(new Response(JSON.stringify({ usedMealIds: [] }), { status: 200 }));

        const { data, error } = await supabase.from('order_items').select('meal_id').in('meal_id', mealIds);
        if (error) throw new Error(error.message);

        const usedMealIds = Array.from(new Set((data ?? []).map((r: any) => String(r.meal_id))));
        return withCors(new Response(JSON.stringify({ usedMealIds }), { status: 200 }));
      }

      const name = asOptionalTrimmedString(body?.name);
      if (!name) throw new Error('name is required');

      const payload = {
        name,
        description: typeof body?.description === 'string' ? body.description : null,
        category: typeof body?.category === 'string' ? body.category : null,
        image_url: typeof body?.image_url === 'string' ? body.image_url : typeof body?.imageUrl === 'string' ? body.imageUrl : null,
        is_active: typeof body?.is_active === 'boolean' ? body.is_active : typeof body?.isActive === 'boolean' ? body.isActive : true,
      };

      const { data, error } = await supabase.from('meals').insert(payload).select('id, name, description, category, image_url, is_active').maybeSingle();
      if (error) throw new Error(error.message);
      return withCors(new Response(JSON.stringify({ success: true, meal: data }), { status: 200 }));
    }

    if (req.method === 'DELETE') {
      const id = body?.id;
      if (!isUuid(id)) throw new Error('Invalid id');

      const { data: hasOrderItems, error: hasOrderItemsError } = await supabase
        .from('order_items')
        .select('id')
        .eq('meal_id', id)
        .limit(1);
      if (hasOrderItemsError) throw new Error(hasOrderItemsError.message);
      if ((hasOrderItems ?? []).length > 0) throw new Error('Cannot delete dish: it has already been used in orders');

      const { error: weekdayOrdersDeleteError } = await supabase.from('weekday_orders').delete().eq('meal_id', id);
      if (weekdayOrdersDeleteError) throw new Error(weekdayOrdersDeleteError.message);

      const { error: mealDeleteError } = await supabase.from('meals').delete().eq('id', id);
      if (mealDeleteError) throw new Error(mealDeleteError.message);

      return withCors(new Response(JSON.stringify({ success: true }), { status: 200 }));
    }

    const id = body?.id;
    if (!isUuid(id)) throw new Error('Invalid id');

    const update: Record<string, unknown> = {};
    if (typeof body?.name === 'string') update.name = body.name;
    if (typeof body?.description === 'string' || body?.description === null) update.description = body.description;
    if (typeof body?.category === 'string' || body?.category === null) update.category = body.category;
    if (typeof body?.image_url === 'string' || body?.image_url === null) update.image_url = body.image_url;
    if (typeof body?.imageUrl === 'string' || body?.imageUrl === null) update.image_url = body.imageUrl;
    if (typeof body?.is_active === 'boolean') update.is_active = body.is_active;
    if (typeof body?.isActive === 'boolean') update.is_active = body.isActive;

    if (Object.keys(update).length === 0) throw new Error('No fields to update');

    const { data, error } = await supabase.from('meals').update(update).eq('id', id).select('id, name, description, category, image_url, is_active').maybeSingle();
    if (error) throw new Error(error.message);
    return withCors(new Response(JSON.stringify({ success: true, meal: data }), { status: 200 }));
  } catch (err: any) {
    const msg = String(err?.message ?? err);
    const status = msg === 'Forbidden' ? 403 : msg === 'No token provided' || msg === 'Invalid or expired token' ? 401 : 400;
    return withCors(new Response(JSON.stringify({ error: msg }), { status }));
  }
});
