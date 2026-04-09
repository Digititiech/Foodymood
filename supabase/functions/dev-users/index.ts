import { corsHeaders, withCors } from '../_shared/cors.ts';
import { getAuthContext, requireRole } from '../_shared/auth.ts';
import { createSupabaseServiceClient } from '../_shared/supabase.ts';

const supabase = createSupabaseServiceClient();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'GET') return withCors(new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 }));

  try {
    const ctx = await getAuthContext(req);
    requireRole(ctx, ['dev']);

    const url = new URL(req.url);
    const limitRaw = url.searchParams.get('limit');
    const limit = Math.min(Math.max(Number(limitRaw ?? 100), 1), 500);

    const { data, error } = await supabase
      .from('users')
      .select('id, email, full_name, role, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw new Error(error.message);
    return withCors(new Response(JSON.stringify(data ?? []), { status: 200 }));
  } catch (err: any) {
    const msg = String(err?.message ?? err);
    const status = msg === 'Forbidden' ? 403 : msg === 'No token provided' || msg === 'Invalid or expired token' ? 401 : 400;
    return withCors(new Response(JSON.stringify({ error: msg }), { status }));
  }
});

