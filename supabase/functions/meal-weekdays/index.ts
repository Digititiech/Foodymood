import { createClient } from 'npm:@supabase/supabase-js@2.101.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
};

const withCors = (res: Response) => {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(corsHeaders)) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
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

declare const Deno: {
  env: { get: (key: string) => string | undefined };
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

const isUuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const isValidDayOfWeek = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 7;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return withCors(new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 }));

  try {
    const ctx = await getAuthContext(req);
    requireRole(ctx, ['admin', 'kitchen']);

    const body = await req.json().catch(() => ({}));
    const mealId = body?.mealId ?? body?.meal_id;
    const weekdays = body?.weekdays ?? body?.days ?? [];

    if (!isUuid(mealId)) throw new Error('Invalid mealId');
    if (!Array.isArray(weekdays)) throw new Error('weekdays must be an array');
    for (const d of weekdays) if (!isValidDayOfWeek(d)) throw new Error('Invalid weekday');

    const uniqueDays = Array.from(new Set(weekdays as number[]));

    const { error: deleteError } = await supabase.from('weekday_menus').delete().eq('meal_id', mealId);
    if (deleteError) throw new Error(deleteError.message);

    if (uniqueDays.length > 0) {
      const inserts = uniqueDays.map((day_of_week) => ({ day_of_week, meal_id: mealId }));
      const { error: insertError } = await supabase.from('weekday_menus').insert(inserts);
      if (insertError) throw new Error(insertError.message);
    }

    return withCors(new Response(JSON.stringify({ success: true }), { status: 200 }));
  } catch (err: any) {
    const msg = String(err?.message ?? err);
    const status = msg === 'Forbidden' ? 403 : msg === 'No token provided' || msg === 'Invalid or expired token' ? 401 : 400;
    return withCors(new Response(JSON.stringify({ error: msg }), { status }));
  }
});
