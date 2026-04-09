import { createSupabaseAuthClient, createSupabaseServiceClient } from './supabase.ts';

export type Role = 'user' | 'admin' | 'kitchen' | 'dev';

export type AuthContext = {
  userId: string;
  email: string | null;
  role: Role;
  fullName: string | null;
};

export const getAuthContext = async (req: Request): Promise<AuthContext> => {
  const authorization = req.headers.get('authorization');
  if (!authorization?.toLowerCase().startsWith('bearer ')) {
    throw new Error('No token provided');
  }

  const authClient = createSupabaseAuthClient(authorization);
  const { data, error } = await authClient.auth.getUser();
  if (error || !data?.user) throw new Error('Invalid or expired token');

  const userId = data.user.id;
  const email = data.user.email ?? null;

  const svc = createSupabaseServiceClient();
  const { data: profile, error: profileError } = await svc
    .from('users')
    .select('role, full_name')
    .eq('id', userId)
    .maybeSingle();

  if (profileError || !profile?.role) throw new Error('User profile not found');

  return { userId, email, role: profile.role as Role, fullName: profile.full_name ?? null };
};

export const requireRole = (ctx: AuthContext, roles: Role[]) => {
  if (ctx.role === 'dev') return;
  if (!roles.includes(ctx.role)) throw new Error('Forbidden');
};
