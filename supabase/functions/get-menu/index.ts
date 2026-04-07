import { corsHeaders, withCors } from '../_shared/cors.ts';
import { createSupabaseServiceClient } from '../_shared/supabase.ts';

const supabase = createSupabaseServiceClient();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'GET') return withCors(new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 }));

  const url = new URL(req.url);
  const date = url.searchParams.get('date') || new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('daily_menus')
    .select('menu_date, meals(*)')
    .eq('menu_date', date);

  if (error) return withCors(new Response(JSON.stringify({ error: error.message }), { status: 500 }));
  return withCors(new Response(JSON.stringify(data ?? []), { status: 200 }));
});

