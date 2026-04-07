import { corsHeaders, withCors } from '../_shared/cors.ts';
import { getAuthContext, requireRole } from '../_shared/auth.ts';
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
    requireRole(ctx, ['admin']);

    const body = await req.json().catch(() => ({}));
    const date = body?.date;
    const mealIds = body?.mealIds ?? body?.meal_ids;

    if (typeof date !== 'string' || !date.trim()) throw new Error('Invalid date');
    if (!Array.isArray(mealIds) || mealIds.length === 0) throw new Error('mealIds is required');
    for (const id of mealIds) if (!isUuid(id)) throw new Error('Invalid meal id');

    const { error: deleteError } = await supabase.from('daily_menus').delete().eq('menu_date', date);
    if (deleteError) throw new Error(deleteError.message);

    const inserts = mealIds.map((id: string) => ({ menu_date: date, meal_id: id }));
    const { error: insertError } = await supabase.from('daily_menus').insert(inserts);
    if (insertError) throw new Error(insertError.message);

    return withCors(new Response(JSON.stringify({ success: true }), { status: 200 }));
  } catch (err: any) {
    const msg = String(err?.message ?? err);
    const status = msg === 'Forbidden' ? 403 : msg === 'No token provided' || msg === 'Invalid or expired token' ? 401 : 400;
    return withCors(new Response(JSON.stringify({ error: msg }), { status }));
  }
});

