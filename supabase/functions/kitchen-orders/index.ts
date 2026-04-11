import { corsHeaders, withCors } from '../_shared/cors.ts';
import { getAuthContext, requireRole } from '../_shared/auth.ts';
import { createSupabaseServiceClient } from '../_shared/supabase.ts';

const supabase = createSupabaseServiceClient();

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'GET') return withCors(new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 }));

  try {
    const ctx = await getAuthContext(req);
    requireRole(ctx, ['kitchen', 'admin']);

    const url = new URL(req.url);
    const mode = url.searchParams.get('mode') ?? 'today';

    if (mode === 'weekday') {
      const rawDay =
        url.searchParams.get('day') ?? url.searchParams.get('dayOfWeek') ?? url.searchParams.get('day_of_week') ?? '';
      const day = rawDay.trim() ? Number(rawDay) : null;
      if (day !== null && (!Number.isFinite(day) || day < 1 || day > 7)) throw new Error('Invalid day_of_week');

      const { data, error } = await supabase
        .from('weekday_orders')
        .select('user_id, day_of_week, quantity, users(full_name), meals(name)')
        .match(day !== null ? { day_of_week: day } : {})
        .order('day_of_week', { ascending: true })
        .order('user_id', { ascending: true });

      if (error) throw new Error(error.message);

      const map = new Map<string, any>();
      for (const row of (data ?? []) as any[]) {
        const userId = String(row.user_id ?? '');
        if (!userId) continue;
        const rowDay = Number(row.day_of_week);
        if (!Number.isFinite(rowDay) || rowDay < 1 || rowDay > 7) continue;
        const key = `${userId}-${rowDay}`;
        const existing = map.get(key) ?? {
          id: key,
          status: 'scheduled',
          delivery_type: 'pickup',
          zip_code: null,
          created_at: new Date().toISOString(),
          day_of_week: rowDay,
          users: row.users ?? null,
          order_items: [] as Array<{ quantity: number; meals: { name: string } }>,
        };
        existing.order_items.push({
          quantity: Number(row.quantity ?? 0),
          meals: { name: String(row.meals?.name ?? '') },
        });
        map.set(key, existing);
      }

      return withCors(new Response(JSON.stringify(Array.from(map.values())), { status: 200 }));
    }

    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('orders')
      .select('*, users(full_name), order_items(quantity, meals(name))')
      .eq('order_date', today)
      .order('created_at', { ascending: true });

    if (error) throw new Error(error.message);
    return withCors(new Response(JSON.stringify(data ?? []), { status: 200 }));
  } catch (err: any) {
    const msg = String(err?.message ?? err);
    const status = msg === 'Forbidden' ? 403 : msg === 'No token provided' || msg === 'Invalid or expired token' ? 401 : 400;
    return withCors(new Response(JSON.stringify({ error: msg }), { status }));
  }
});
