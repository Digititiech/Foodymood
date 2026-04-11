import { createClient } from 'npm:@supabase/supabase-js@2.101.1';

declare const Deno: {
  env: { get: (key: string) => string | undefined };
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

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

const supabase = createClient(getEnv('SUPABASE_URL'), getEnv('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'GET') return withCors(new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 }));

  try {
    const url = new URL(req.url);
    const date = url.searchParams.get('date') || new Date().toISOString().split('T')[0];

    const dow0 = new Date(`${date}T00:00:00Z`).getUTCDay();
    const dayOfWeek = dow0 === 0 ? 7 : dow0;

    const { data: weekdayRows, error: weekdayError } = await supabase
      .from('weekday_menus')
      .select('created_at, meals(*)')
      .eq('day_of_week', dayOfWeek)
      .order('created_at', { ascending: true });

    if (weekdayError) throw new Error(weekdayError.message);
    const mapped = (weekdayRows ?? []).map((r: any) => ({ menu_date: date, meals: r.meals ?? null }));

    return withCors(new Response(JSON.stringify(mapped), { status: 200 }));
  } catch (err: any) {
    return withCors(new Response(JSON.stringify({ error: String(err?.message ?? err) }), { status: 500 }));
  }
});
