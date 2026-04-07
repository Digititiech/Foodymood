import { corsHeaders, withCors } from '../_shared/cors.ts';
import { createSupabaseServiceClient } from '../_shared/supabase.ts';

const supabase = createSupabaseServiceClient();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'GET') return withCors(new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 }));

  const url = new URL(req.url);
  const zip = url.searchParams.get('zip')?.trim();
  if (!zip) return withCors(new Response(JSON.stringify({ error: 'zip is required' }), { status: 400 }));

  const { data, error } = await supabase
    .from('delivery_zones')
    .select('delivery_fee')
    .eq('zip_code', zip)
    .eq('is_active', true)
    .maybeSingle();

  if (error || !data) return withCors(new Response(JSON.stringify({ error: 'Delivery not available in your area' }), { status: 404 }));
  return withCors(new Response(JSON.stringify(data), { status: 200 }));
});

