import React, { useCallback, useRef, useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, useNavigate, Navigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ShoppingBag, 
  CreditCard, 
  Truck, 
  MapPin, 
  ChevronRight, 
  CheckCircle2, 
  AlertCircle,
  Clock,
  UtensilsCrossed,
  User,
  LogOut,
  LayoutDashboard,
  ChefHat,
  Plus,
  Calendar,
  BarChart3,
  Users
} from 'lucide-react';

import LandingPage from './components/LandingPage';
import { supabase } from './lib/supabase';
import type { Session } from '@supabase/supabase-js';

// --- TYPES ---
interface Plan { id: string; name: string; meals_per_cycle: number; price_cents: number; }
interface Meal { id: string; name: string; description: string | null; category: string | null; image_url?: string | null; is_active?: boolean | null; }
interface Subscription { id: string; remaining_credits: number; current_period_end: string; status: string; plans?: Plan | null; }
interface UserData { id: string; name: string; email: string; role: 'user' | 'admin' | 'kitchen' | 'dev'; }
type Order = {
  id: string;
  status: string;
  delivery_type: 'pickup' | 'delivery';
  zip_code: string | null;
  created_at: string;
  order_items: Array<{ quantity: number; meals: { name: string } }>;
};

type AdminStats = { totalUsers: number | null; activeSubs: number | null; todayOrders: number | null };
type KitchenOrder = {
  id: string;
  status: string;
  delivery_type: 'pickup' | 'delivery';
  zip_code: string | null;
  created_at: string;
  day_of_week?: number;
  users: { full_name: string | null } | null;
  order_items: Array<{ quantity: number; meals: { name: string } }>;
};

type DevUserAccount = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: UserData['role'];
  created_at: string;
};

const todayIsoDate = () => new Date().toISOString().split('T')[0];
const isoDateFromDate = (d: Date) => new Date(d.getTime()).toISOString().split('T')[0];
const startOfWeekIso = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  const day = d.getDay();
  const diff = (day + 6) % 7;
  d.setDate(d.getDate() - diff);
  return isoDateFromDate(d);
};
const addDaysIso = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return isoDateFromDate(d);
};

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const functionsBaseUrl = `${supabaseUrl.replace(/\/$/, '')}/functions/v1`;

async function getEdgeAuthToken(explicitToken?: string) {
  const { data } = await supabase.auth.getSession();
  let session = data.session ?? null;
  const now = Math.floor(Date.now() / 1000);

  if (session?.expires_at && session.expires_at <= now + 30) {
    const refreshed = await supabase.auth.refreshSession();
    session = refreshed.data.session ?? session;
  }

  if (session?.access_token) return session.access_token;
  if (typeof explicitToken === 'string' && explicitToken.trim()) return explicitToken.trim();
  return undefined;
}

async function edgeRequest<T>(
  fn: string,
  opts?: { method?: string; body?: unknown; token?: string; query?: Record<string, string | undefined> }
) {
  const qs = opts?.query
    ? `?${new URLSearchParams(Object.entries(opts.query).filter(([, v]) => typeof v === 'string') as Array<[string, string]>).toString()}`
    : '';

  const token = await getEdgeAuthToken(opts?.token);

  const res = await fetch(`${functionsBaseUrl}/${fn}${qs}`, {
    method: opts?.method ?? (opts?.body ? 'POST' : 'GET'),
    headers: {
      apikey: supabaseAnonKey,
      authorization: `Bearer ${token ?? supabaseAnonKey}`,
      ...(opts?.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
  });

  const text = await res.text();
  const data = text ? (() => { try { return JSON.parse(text); } catch { return { error: text }; } })() : null;

  if (!res.ok) {
    const message = data?.error ?? data?.message ?? res.statusText ?? 'Request failed';
    throw new Error(`${res.status}: ${message}`);
  }

  return data as T;
}

// --- COMPONENTS ---

const Navbar = ({ user, onLogout }: { user: UserData | null, onLogout: () => void | Promise<void> }) => (
  <nav className="sticky top-0 z-50 border-b border-neutral-100 bg-white/80 backdrop-blur-xl">
    <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6">
      <Link to="/" className="flex items-center gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500 text-white shadow-lg shadow-orange-200">
          <UtensilsCrossed size={24} />
        </div>
        <span className="text-xl font-bold tracking-tight text-neutral-900">FoodyMood</span>
      </Link>
      
      <div className="flex items-center gap-6">
        {user ? (
          <>
            <div className="hidden md:flex items-center gap-6 text-sm font-bold text-neutral-500 mr-4">
              {user.role === 'user' && <Link to="/dashboard" className="hover:text-orange-500 transition-all">My Meals</Link>}
              {user.role === 'admin' && <Link to="/admin" className="hover:text-orange-500 transition-all">Admin</Link>}
              {user.role === 'kitchen' && <Link to="/kitchen" className="hover:text-orange-500 transition-all">Kitchen</Link>}
              {user.role === 'dev' && (
                <>
                  <Link to="/dev" className="hover:text-orange-500 transition-all">Dev</Link>
                  <Link to="/dashboard" className="hover:text-orange-500 transition-all">My Meals</Link>
                  <Link to="/admin" className="hover:text-orange-500 transition-all">Admin</Link>
                  <Link to="/kitchen" className="hover:text-orange-500 transition-all">Kitchen</Link>
                </>
              )}
            </div>
            <div className="flex items-center gap-3 pl-6 border-l border-neutral-100">
              <div className="hidden sm:block text-right">
                <p className="text-xs font-bold text-neutral-900 leading-none">{user.name}</p>
                <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mt-1">{user.role === 'dev' ? 'Dev' : user.role}</p>
              </div>
              <button onClick={onLogout} className="flex h-10 w-10 items-center justify-center rounded-xl border border-neutral-100 hover:bg-neutral-50 transition-all text-neutral-400 hover:text-red-500">
                <LogOut size={18} />
              </button>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-4">
            <Link to="/login" className="text-sm font-bold text-neutral-600 hover:text-neutral-900">Login</Link>
            <Link to="/signup" className="rounded-full bg-neutral-900 px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-neutral-200 hover:bg-neutral-800 transition-all">
              Sign Up
            </Link>
          </div>
        )}
      </div>
    </div>
  </nav>
);

// --- PAGES ---

const SignupPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    if (error) {
      setMessage({ type: 'error', text: error.message });
      setLoading(false);
      return;
    }
    setMessage({ type: 'success', text: 'Account created. Check your email if confirmation is required, then log in.' });
    setLoading(false);
    navigate('/login');
  };

  return (
    <div className="mx-auto max-w-md px-4 py-24">
      <div className="rounded-[2.5rem] bg-white p-10 shadow-2xl shadow-neutral-200/50 border border-neutral-100">
        <h2 className="text-3xl font-bold mb-2">Join FoodyMood</h2>
        <p className="text-neutral-500 mb-8">Start your journey to better eating.</p>
        <AnimatePresence>
          {message && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`mb-6 p-4 rounded-2xl flex items-center gap-3 ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'}`}
            >
              {message.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
              <span className="font-bold text-sm">{message.text}</span>
            </motion.div>
          )}
        </AnimatePresence>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 ml-1">Full Name</label>
            <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} className="w-full rounded-2xl border border-neutral-100 bg-neutral-50 p-4 mt-1 focus:bg-white focus:ring-4 focus:ring-orange-500/10 transition-all outline-none" placeholder="John Doe" required />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 ml-1">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full rounded-2xl border border-neutral-100 bg-neutral-50 p-4 mt-1 focus:bg-white focus:ring-4 focus:ring-orange-500/10 transition-all outline-none" placeholder="john@example.com" required />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 ml-1">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full rounded-2xl border border-neutral-100 bg-neutral-50 p-4 mt-1 focus:bg-white focus:ring-4 focus:ring-orange-500/10 transition-all outline-none" placeholder="••••••••" required />
          </div>
          <button type="submit" disabled={loading} className="w-full rounded-2xl bg-orange-500 py-4 font-bold text-white shadow-xl shadow-orange-200 hover:bg-orange-600 transition-all disabled:opacity-50">
            {loading ? 'Creating...' : 'Create Account'}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-neutral-500">
          Already have an account? <Link to="/login" className="text-orange-500 font-bold">Login</Link>
        </p>
      </div>
    </div>
  );
};

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMessage({ type: 'error', text: error.message });
      setLoading(false);
      return;
    }

    const userId = data.user?.id;
    if (!userId) {
      setMessage({ type: 'error', text: 'Login failed: missing user id' });
      setLoading(false);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .maybeSingle();

    if (profileError) {
      setMessage({ type: 'error', text: profileError.message });
      setLoading(false);
      return;
    }

    const role = (profile?.role ?? 'user') as UserData['role'];
    navigate(role === 'dev' ? '/dev' : role === 'admin' ? '/admin' : role === 'kitchen' ? '/kitchen' : '/dashboard');
    setLoading(false);
  };

  return (
    <div className="mx-auto max-w-md px-4 py-24">
      <div className="rounded-[2.5rem] bg-white p-10 shadow-2xl shadow-neutral-200/50 border border-neutral-100">
        <h2 className="text-3xl font-bold mb-2">Welcome Back</h2>
        <p className="text-neutral-500 mb-8">Sign in to manage your meals.</p>
        <AnimatePresence>
          {message && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`mb-6 p-4 rounded-2xl flex items-center gap-3 ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'}`}
            >
              {message.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
              <span className="font-bold text-sm">{message.text}</span>
            </motion.div>
          )}
        </AnimatePresence>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 ml-1">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full rounded-2xl border border-neutral-100 bg-neutral-50 p-4 mt-1 focus:bg-white focus:ring-4 focus:ring-orange-500/10 transition-all outline-none" placeholder="john@example.com" required />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 ml-1">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full rounded-2xl border border-neutral-100 bg-neutral-50 p-4 mt-1 focus:bg-white focus:ring-4 focus:ring-orange-500/10 transition-all outline-none" placeholder="••••••••" required />
          </div>
          <button type="submit" disabled={loading} className="w-full rounded-2xl bg-orange-500 py-4 font-bold text-white shadow-xl shadow-orange-200 hover:bg-orange-600 transition-all disabled:opacity-50">
            {loading ? 'Signing in...' : 'Login'}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-neutral-500">
          Don't have an account? <Link to="/signup" className="text-orange-500 font-bold">Sign up</Link>
        </p>
      </div>
    </div>
  );
};

const UserDashboard = ({ user, accessToken }: { user: UserData; accessToken: string }) => {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [weekdayMeals, setWeekdayMeals] = useState<Record<number, Meal[]>>({});
  const [orders, setOrders] = useState<Order[]>([]);
  const [weekdayCart, setWeekdayCart] = useState<Record<number, Record<string, number>>>({});
  const [selectedDayOfWeek, setSelectedDayOfWeek] = useState<number>(() => {
    const dow0 = new Date().getDay();
    return dow0 === 0 ? 7 : dow0;
  });
  const [deliveryType, setDeliveryType] = useState<'pickup' | 'delivery'>('pickup');
  const [zipCode, setZipCode] = useState('');
  const [loadingData, setLoadingData] = useState(true);
  const [loadingMenu, setLoadingMenu] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadingAction, setLoadingAction] = useState<'save_weekly' | 'place_order' | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const mountedRef = useRef(true);
  const loadedDaysRef = useRef<Set<number>>(new Set());
  const didLoadWeekdayOrdersRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const isPrivilegedOrderUser = user.role === 'dev' || user.role === 'admin' || user.role === 'kitchen';

  const refresh = useCallback(async () => {
    setLoadingData(true);
    try {
      const [subRaw, orderRows] = await Promise.all([
        edgeRequest<Subscription | null>('get-subscription', { token: accessToken }),
        edgeRequest<Order[]>('get-orders', { token: accessToken }),
      ]);

      if (!mountedRef.current) return;

      setSubscription(subRaw);
      setOrders(orderRows ?? []);

      if (!didLoadWeekdayOrdersRef.current) {
        const { data, error } = await supabase
          .from('weekday_orders')
          .select('day_of_week, meal_id, quantity')
          .eq('user_id', user.id);
        if (error) throw new Error(error.message);

        const next: Record<number, Record<string, number>> = {};
        for (const row of (data ?? []) as any[]) {
          const day = Number(row.day_of_week);
          const mealId = String(row.meal_id);
          const quantity = Number(row.quantity);
          if (!Number.isFinite(day) || day < 1 || day > 7) continue;
          if (!mealId || !Number.isFinite(quantity) || quantity <= 0) continue;
          next[day] = next[day] ? { ...next[day], [mealId]: quantity } : { [mealId]: quantity };
        }

        setWeekdayCart(next);
        didLoadWeekdayOrdersRef.current = true;
      }
    } catch (err: any) {
      if (!mountedRef.current) return;
      setMessage({ type: 'error', text: err?.message ?? 'Failed to load dashboard' });
    } finally {
      if (mountedRef.current) setLoadingData(false);
    }
  }, [user.id, accessToken]);

  const weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const loadDay = useCallback(async (day: number) => {
    setLoadingMenu(true);
    setMessage(null);
    try {
      const [menuRes, cartRes] = await Promise.all([
        supabase
          .from('weekday_menus')
          .select('created_at, meals(id, name, description, category, image_url, is_active)')
          .eq('day_of_week', day)
          .order('created_at', { ascending: true }),
        supabase
          .from('weekday_orders')
          .select('meal_id, quantity')
          .eq('day_of_week', day)
          .eq('user_id', user.id),
      ]);

      if (menuRes.error) throw new Error(menuRes.error.message);
      if (cartRes.error) throw new Error(cartRes.error.message);

      const meals = (menuRes.data ?? [])
        .map((r: any) => r.meals as Meal | null)
        .filter((m: Meal | null): m is Meal => Boolean(m))
        .filter((m) => m.is_active !== false);

      const cart: Record<string, number> = {};
      for (const row of (cartRes.data ?? []) as any[]) {
        const mealId = String(row.meal_id);
        const quantity = Number(row.quantity);
        if (!mealId || !Number.isFinite(quantity) || quantity <= 0) continue;
        cart[mealId] = quantity;
      }

      if (!mountedRef.current) return;

      setWeekdayMeals((p) => ({ ...p, [day]: meals }));
      setWeekdayCart((p) => ({ ...p, [day]: cart }));
      loadedDaysRef.current.add(day);
    } catch (err: any) {
      if (!mountedRef.current) return;
      setMessage({ type: 'error', text: err?.message ?? 'Failed to load menu' });
    } finally {
      if (mountedRef.current) setLoadingMenu(false);
    }
  }, [user.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (loadedDaysRef.current.has(selectedDayOfWeek)) return;
    loadDay(selectedDayOfWeek);
  }, [selectedDayOfWeek, loadDay]);

  useEffect(() => {
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);

  const dayMeals = weekdayMeals[selectedDayOfWeek] ?? [];
  const cart = weekdayCart[selectedDayOfWeek] ?? {};
  const eligibleCredits = subscription?.plans?.meals_per_cycle ?? null;
  const balanceCredits = subscription?.remaining_credits ?? null;
  const privilegedCreditLimit = user.role === 'dev' || user.role === 'admin' ? 120 : null;
  const effectiveEligibleCredits =
    typeof privilegedCreditLimit === 'number' ? privilegedCreditLimit : typeof eligibleCredits === 'number' ? eligibleCredits : null;
  const effectiveBalanceCredits =
    typeof privilegedCreditLimit === 'number'
      ? Math.min(typeof balanceCredits === 'number' ? balanceCredits : privilegedCreditLimit, privilegedCreditLimit)
      : typeof balanceCredits === 'number'
        ? balanceCredits
        : null;
  const totalAllCartItems = (Object.values(weekdayCart) as Array<Record<string, number>>).reduce((sum: number, dayCart) => {
    const dayTotal = (Object.values(dayCart ?? {}) as number[]).reduce((a: number, b: number) => a + b, 0);
    return sum + dayTotal;
  }, 0);
  const totalCartItems = (Object.values(cart) as number[]).reduce((a: number, b: number) => a + b, 0);

  const setCartForDay = (updater: (prev: Record<string, number>) => Record<string, number>) => {
    setWeekdayCart((p) => ({ ...p, [selectedDayOfWeek]: updater(p[selectedDayOfWeek] ?? {}) }));
  };

  const addToCart = (id: string) => {
    if (typeof effectiveBalanceCredits === 'number' && totalAllCartItems >= effectiveBalanceCredits) {
      setMessage({ type: 'error', text: 'No meals left' });
      return;
    }
    setCartForDay((p) => ({ ...p, [id]: ((p[id] as number) || 0) + 1 }));
  };
  const removeFromCart = (id: string) =>
    setCartForDay((p) => {
      const current = (p[id] as number) || 0;
      if (current <= 1) {
        const { [id]: _, ...rest } = p;
        return rest;
      }
      return { ...p, [id]: current - 1 };
    });

  const saveWeekdayOrder = async () => {
    setMessage(null);

    if (!isPrivilegedOrderUser) {
      if (!subscription) {
        setMessage({ type: 'error', text: 'No active subscription' });
        return;
      }

      if (subscription.status !== 'active' && subscription.status !== 'trialing') {
        setMessage({ type: 'error', text: 'Subscription is not active' });
        return;
      }
    }

    if (totalAllCartItems <= 0) {
      setMessage({ type: 'error', text: 'Cannot submit an empty order' });
      return;
    }

    if (typeof effectiveBalanceCredits === 'number' && totalAllCartItems > effectiveBalanceCredits) {
      setMessage({ type: 'error', text: 'No meals left' });
      return;
    }

    if (deliveryType === 'delivery') {
      if (!zipCode.trim()) {
        setMessage({ type: 'error', text: 'Invalid ZIP' });
        return;
      }
      try {
        await edgeRequest('check-zip', { query: { zip: zipCode.trim() } });
      } catch (err: any) {
        setMessage({ type: 'error', text: err?.message ?? 'Delivery not available in your area' });
        return;
      }
    }

    const rows = Object.entries(weekdayCart).flatMap(([dayKey, dayCart]) => {
      const day = Number(dayKey);
      if (!Number.isFinite(day) || day < 1 || day > 7) return [];
      return Object.entries(dayCart ?? {}).map(([mealId, quantity]) => ({
        user_id: user.id,
        day_of_week: day,
        meal_id: mealId,
        quantity,
      }));
    });

    setLoading(true);
    setLoadingAction('save_weekly');
    try {
      const { error: delError } = await supabase
        .from('weekday_orders')
        .delete()
        .eq('user_id', user.id);
      if (delError) throw new Error(delError.message);

      if (rows.length > 0) {
        const { error: insertError } = await supabase.from('weekday_orders').insert(rows);
        if (insertError) throw new Error(insertError.message);
      }

      setMessage({ type: 'success', text: 'Weekly order saved' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message ?? 'Failed to save order' });
    } finally {
      setLoading(false);
      setLoadingAction(null);
    }
  };

  const placeOrderNow = async () => {
    setMessage(null);

    if (!isPrivilegedOrderUser) {
      if (!subscription) {
        setMessage({ type: 'error', text: 'No active subscription' });
        return;
      }

      if (subscription.status !== 'active' && subscription.status !== 'trialing') {
        setMessage({ type: 'error', text: 'Subscription is not active' });
        return;
      }
    }

    if (totalAllCartItems <= 0) {
      setMessage({ type: 'error', text: 'Cannot submit an empty order' });
      return;
    }

    if (typeof effectiveBalanceCredits === 'number' && totalAllCartItems > effectiveBalanceCredits) {
      setMessage({ type: 'error', text: 'No meals left' });
      return;
    }

    if (deliveryType === 'delivery') {
      if (!zipCode.trim()) {
        setMessage({ type: 'error', text: 'Invalid ZIP' });
        return;
      }
      try {
        await edgeRequest('check-zip', { query: { zip: zipCode.trim() } });
      } catch (err: any) {
        setMessage({ type: 'error', text: err?.message ?? 'Delivery not available in your area' });
        return;
      }
    }

    const items = Object.values(weekdayCart).flatMap((dayCart) =>
      Object.entries(dayCart ?? {}).map(([mealId, quantity]) => ({ meal_id: mealId, quantity }))
    );

    setLoading(true);
    setLoadingAction('place_order');
    try {
      const res = await edgeRequest<{ message: string; orderId: string }>('create-order', {
        token: accessToken,
        method: 'POST',
        body: {
          subscriptionId: subscription?.id,
          deliveryType,
          zipCode: deliveryType === 'delivery' ? zipCode.trim() : null,
          items,
        },
      });

      await refresh();
      setMessage({ type: 'success', text: `Order placed (#${res.orderId.slice(0, 8)})` });
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message ?? 'Failed to place order' });
    } finally {
      setLoading(false);
      setLoadingAction(null);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-neutral-900">Welcome back, {user.name}</h1>
          <p className="text-neutral-500 mt-2">What would you like to eat today?</p>
        </div>
        {(subscription || typeof privilegedCreditLimit === 'number') && (
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Eligible Credits</p>
              <p className="text-2xl font-black text-neutral-900">{effectiveEligibleCredits ?? '—'}</p>
            </div>
            <div className="h-12 w-[1px] bg-neutral-200" />
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Balance Credits</p>
              <p className="text-2xl font-black text-orange-500">{effectiveBalanceCredits ?? '—'}</p>
            </div>
            {subscription && (
              <>
                <div className="h-12 w-[1px] bg-neutral-200" />
                <div className="text-right">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Expires</p>
                  <p className="text-sm font-bold text-neutral-900">{new Date(subscription.current_period_end).toLocaleDateString()}</p>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <AnimatePresence>
        {message && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`mb-8 p-4 rounded-2xl flex items-center gap-3 ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'}`}
          >
            {message.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
            <span className="font-bold text-sm">{message.text}</span>
            <button onClick={() => setMessage(null)} className="ml-auto text-xs font-bold uppercase tracking-widest">Dismiss</button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-8">
          <section>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold">Weekly Menu</h2>
            </div>
            <div className="mb-6 flex flex-wrap gap-2">
              {weekdayLabels.map((label, idx) => {
                const day = idx + 1;
                const active = selectedDayOfWeek === day;
                return (
                  <button
                    key={label}
                    onClick={() => setSelectedDayOfWeek(day)}
                    className={`rounded-full px-4 py-2 text-sm font-black transition-all ${active ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-700 border border-neutral-100 hover:bg-neutral-50'}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <div className="grid gap-6 sm:grid-cols-2">
              {loadingData || loadingMenu ? (
                <div className="rounded-[2rem] bg-white p-8 shadow-xl shadow-neutral-200/50 border border-neutral-100 text-neutral-500 font-bold">
                  Loading menu...
                </div>
              ) : dayMeals.length === 0 ? (
                <div className="rounded-[2rem] bg-white p-8 shadow-xl shadow-neutral-200/50 border border-neutral-100 text-neutral-500 font-bold">
                  No dishes assigned for {weekdayLabels[selectedDayOfWeek - 1]}
                </div>
              ) : dayMeals.map(meal => (
                <motion.div 
                  key={meal.id} 
                  whileHover={{ y: -5 }}
                  className="rounded-[2rem] bg-white p-5 shadow-xl shadow-neutral-200/50 border border-neutral-100"
                >
                  <div className="relative mb-4">
                    <img src={meal.image_url || `https://picsum.photos/seed/${meal.id}/600/400`} className="rounded-2xl w-full aspect-[4/3] object-cover" referrerPolicy="no-referrer" />
                    <span className="absolute top-3 left-3 px-3 py-1 bg-white/90 backdrop-blur-md rounded-full text-[10px] font-bold uppercase tracking-widest text-orange-500 shadow-sm">
                      {meal.category || 'Meal'}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-neutral-900">{meal.name}</h3>
                  <p className="text-sm text-neutral-500 mt-2 line-clamp-2 leading-relaxed">{meal.description || ''}</p>
                  <div className="mt-6 flex items-center justify-between">
                    <div className="flex items-center gap-4 bg-neutral-50 p-1.5 rounded-full border border-neutral-100">
                      <button 
                        onClick={() => removeFromCart(meal.id)} 
                        className="h-10 w-10 rounded-full bg-white border border-neutral-200 flex items-center justify-center hover:bg-neutral-50 transition-all shadow-sm"
                      >
                        -
                      </button>
                      <span className="font-black text-neutral-900 w-4 text-center">{cart[meal.id] || 0}</span>
                      <button 
                        onClick={() => addToCart(meal.id)} 
                        className="h-10 w-10 rounded-full bg-neutral-900 text-white flex items-center justify-center hover:bg-neutral-800 transition-all shadow-lg shadow-neutral-200"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </section>

          <section className="rounded-[2.5rem] bg-white p-8 shadow-2xl shadow-neutral-200/50 border border-neutral-100">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold">Order History</h2>
              <button onClick={refresh} className="text-xs font-bold uppercase tracking-widest text-neutral-400 hover:text-neutral-700 transition-all">
                Refresh
              </button>
            </div>
            {loadingData ? (
              <div className="text-neutral-500 font-bold">Loading orders...</div>
            ) : orders.length === 0 ? (
              <div className="text-neutral-500 font-bold">No orders yet</div>
            ) : (
              <div className="space-y-4">
                {orders.slice(0, 6).map((order) => (
                  <div key={order.id} className="rounded-3xl border border-neutral-100 p-5 bg-neutral-50/40">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="px-3 py-1 bg-white rounded-full text-[10px] font-black uppercase tracking-widest text-neutral-500 border border-neutral-100">
                        {order.id.slice(0, 8)}
                      </span>
                      <span className="px-3 py-1 bg-white rounded-full text-[10px] font-black uppercase tracking-widest text-neutral-500 border border-neutral-100">
                        {order.status}
                      </span>
                      <span className="ml-auto text-xs font-bold text-neutral-400 flex items-center gap-1">
                        <Clock size={14} /> {new Date(order.created_at).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-sm font-bold text-neutral-900">
                      {order.order_items.map((i) => `${i.meals.name} x${i.quantity}`).join(', ')}
                    </div>
                    <div className="mt-3 text-xs font-bold text-neutral-400 uppercase tracking-widest flex items-center gap-2">
                      {order.delivery_type === 'delivery' ? <Truck size={14} className="text-orange-500" /> : <MapPin size={14} className="text-orange-500" />}
                      {order.delivery_type} {order.zip_code ? `• ${order.zip_code}` : ''}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="space-y-8">
          <div className="rounded-[2.5rem] bg-white p-8 shadow-2xl shadow-neutral-200/50 border border-neutral-100 sticky top-24">
            <h3 className="text-xl font-bold mb-8 flex items-center gap-2">
              <ShoppingBag size={22} className="text-orange-500" /> 
              Order Summary
            </h3>
            
            {totalAllCartItems === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-neutral-50 rounded-full flex items-center justify-center mx-auto mb-4 text-neutral-300">
                  <UtensilsCrossed size={32} />
                </div>
                <p className="text-neutral-400 text-sm">Your cart is empty.<br />Add some delicious meals!</p>
              </div>
            ) : (
              <>
                <div className="space-y-4 mb-8">
                  {weekdayLabels.map((label, idx) => {
                    const day = idx + 1;
                    const dayCart = weekdayCart[day] ?? {};
                    const dayTotal = (Object.values(dayCart) as number[]).reduce((a: number, b: number) => a + b, 0);
                    const items = Object.entries(dayCart);
                    if (items.length === 0) return null;
                    return (
                      <div key={label} className="rounded-3xl border border-neutral-100 bg-neutral-50/40 p-5">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <span className="px-3 py-1 bg-white rounded-full text-[10px] font-black uppercase tracking-widest text-neutral-500 border border-neutral-100">
                            {label}
                          </span>
                          <span className="text-xs font-black text-orange-500">{dayTotal} Credits</span>
                        </div>
                        <div className="space-y-3">
                          {items.map(([id, q]) => (
                            <div key={`${label}-${id}`} className="flex justify-between items-center">
                              <div className="flex flex-col">
                                <span className="text-sm font-bold text-neutral-900">{(weekdayMeals[day] ?? []).find((m) => m.id === id)?.name ?? id}</span>
                                <span className="text-[10px] text-neutral-400 uppercase tracking-widest">x{q} Meals</span>
                              </div>
                              <span className="text-sm font-black text-orange-500">{q} Credits</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
                
                <div className="h-[1px] bg-neutral-100 mb-8" />

                <div className="space-y-6 mb-8">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 ml-1">Delivery Method</label>
                    <div className="flex gap-2 p-1.5 bg-neutral-50 rounded-2xl mt-2 border border-neutral-100">
                      <button 
                        onClick={() => setDeliveryType('pickup')} 
                        className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all ${deliveryType === 'pickup' ? 'bg-white text-orange-500 shadow-sm' : 'text-neutral-400 hover:text-neutral-600'}`}
                      >
                        Pickup
                      </button>
                      <button 
                        onClick={() => setDeliveryType('delivery')} 
                        className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all ${deliveryType === 'delivery' ? 'bg-white text-orange-500 shadow-sm' : 'text-neutral-400 hover:text-neutral-600'}`}
                      >
                        Delivery
                      </button>
                    </div>
                  </div>

                  {deliveryType === 'delivery' && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                      <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 ml-1">ZIP Code</label>
                      <div className="relative mt-2">
                        <MapPin size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-300" />
                        <input 
                          type="text" 
                          placeholder="Enter ZIP" 
                          value={zipCode} 
                          onChange={e => setZipCode(e.target.value)} 
                          className="w-full rounded-2xl border border-neutral-100 bg-neutral-50 p-4 pl-12 text-sm focus:bg-white focus:ring-4 focus:ring-orange-500/10 transition-all outline-none" 
                        />
                      </div>
                    </motion.div>
                  )}
                </div>

                <div className="flex justify-between items-center mb-8">
                  <span className="text-sm font-bold text-neutral-900">Total Credits</span>
                  <span className="text-2xl font-black text-neutral-900">{totalAllCartItems}</span>
                </div>
                {typeof effectiveBalanceCredits === 'number' && (
                  <div className="mb-8 flex justify-between items-center">
                    <span className="text-sm font-bold text-neutral-900">Balance Credits</span>
                    <span className="text-sm font-black text-orange-500">{effectiveBalanceCredits}</span>
                  </div>
                )}

                <div className="space-y-3">
                  <button
                    onClick={placeOrderNow}
                    disabled={loading}
                    className="w-full rounded-2xl bg-orange-500 py-5 font-bold text-white shadow-2xl shadow-orange-200 hover:bg-orange-600 hover:-translate-y-1 transition-all disabled:opacity-50 disabled:translate-y-0"
                  >
                    {loading && loadingAction === 'place_order' ? (
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Processing...
                      </div>
                    ) : 'Place Order'}
                  </button>

                  <button
                    onClick={saveWeekdayOrder}
                    disabled={loading}
                    className="w-full rounded-2xl border border-neutral-100 bg-white py-5 font-bold text-neutral-900 shadow-xl shadow-neutral-200/50 hover:bg-neutral-50 hover:-translate-y-1 transition-all disabled:opacity-50 disabled:translate-y-0"
                  >
                    {loading && loadingAction === 'save_weekly' ? (
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-4 h-4 border-2 border-neutral-300/60 border-t-neutral-900 rounded-full animate-spin" />
                        Processing...
                      </div>
                    ) : 'Save Weekly Order'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const AdminDashboard = ({ accessToken }: { accessToken: string }) => {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [editingMealId, setEditingMealId] = useState<string | null>(null);
  const [mealName, setMealName] = useState('');
  const [mealCategory, setMealCategory] = useState('');
  const [mealDescription, setMealDescription] = useState('');
  const [mealImageUrl, setMealImageUrl] = useState('');
  const [mealImageFile, setMealImageFile] = useState<File | null>(null);
  const [mealImagePreviewUrl, setMealImagePreviewUrl] = useState<string | null>(null);
  const [mealIsActive, setMealIsActive] = useState(true);
  const [mealSaving, setMealSaving] = useState(false);
  const [mealWeekdays, setMealWeekdays] = useState<number[]>([]);
  const [weekdayAssignments, setWeekdayAssignments] = useState<Record<string, number[]>>({});
  const [viewDayOfWeek, setViewDayOfWeek] = useState<number>(1);
  const [panel, setPanel] = useState<'manage' | 'weekday'>('manage');

  useEffect(() => {
    return () => {
      if (mealImagePreviewUrl) URL.revokeObjectURL(mealImagePreviewUrl);
    };
  }, [mealImagePreviewUrl]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const [statsData, mealsRes, weekdayRes] = await Promise.all([
        edgeRequest<AdminStats>('admin-stats', { token: accessToken }),
        supabase.from('meals').select('id, name, description, category, image_url, is_active').order('created_at', { ascending: false }),
        supabase.from('weekday_menus').select('meal_id, day_of_week'),
      ]);

      if (mealsRes.error) throw new Error(mealsRes.error.message);
      if (weekdayRes.error) throw new Error(weekdayRes.error.message);

      setStats(statsData);
      setMeals((mealsRes.data ?? []) as Meal[]);
      const map: Record<string, number[]> = {};
      for (const row of (weekdayRes.data ?? []) as any[]) {
        const mealId = String(row.meal_id);
        const day = Number(row.day_of_week);
        if (!Number.isFinite(day)) continue;
        map[mealId] = map[mealId] ? [...map[mealId], day] : [day];
      }
      for (const k of Object.keys(map)) map[k] = Array.from(new Set(map[k])).sort((a, b) => a - b);
      setWeekdayAssignments(map);
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message ?? 'Failed to load admin dashboard' });
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  const activeMeals = meals.filter((m) => m.is_active !== false);
  const weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const setMealImageFileSafe = (file: File | null) => {
    if (mealImagePreviewUrl) URL.revokeObjectURL(mealImagePreviewUrl);
    setMealImagePreviewUrl(file ? URL.createObjectURL(file) : null);
    setMealImageFile(file);
  };

  const uploadMealImage = async (file: File, mealId: string) => {
    if (!file.type?.startsWith('image/')) throw new Error('Please select an image file');
    if (file.size > 5 * 1024 * 1024) throw new Error('Image must be 5MB or smaller');

    const originalExt = file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase() : undefined;
    const ext = originalExt && /^[a-z0-9]+$/i.test(originalExt) ? originalExt : 'jpg';
    const path = `meals/${mealId}/${crypto.randomUUID()}.${ext}`;

    const { error } = await supabase.storage.from('meal-images').upload(path, file, {
      upsert: true,
      contentType: file.type || undefined,
    });
    if (error) throw new Error(error.message);

    const { data } = supabase.storage.from('meal-images').getPublicUrl(path);
    return data.publicUrl;
  };

  const resetMealForm = () => {
    setEditingMealId(null);
    setMealName('');
    setMealCategory('');
    setMealDescription('');
    setMealImageUrl('');
    setMealImageFileSafe(null);
    setMealIsActive(true);
    setMealWeekdays([]);
  };

  const startEditMeal = (meal: Meal) => {
    setEditingMealId(meal.id);
    setMealName(meal.name ?? '');
    setMealCategory(meal.category ?? '');
    setMealDescription(meal.description ?? '');
    setMealImageUrl(meal.image_url ?? '');
    setMealImageFileSafe(null);
    setMealIsActive(meal.is_active !== false);
    setMealWeekdays(weekdayAssignments[meal.id] ?? []);
  };

  const saveMeal = async () => {
    const name = mealName.trim();
    if (!name) {
      setMessage({ type: 'error', text: 'Dish name is required' });
      return;
    }

    setMealSaving(true);
    setMessage(null);
    try {
      if (editingMealId) {
        const finalImageUrl = mealImageFile
          ? await uploadMealImage(mealImageFile, editingMealId)
          : mealImageUrl.trim()
            ? mealImageUrl.trim()
            : null;

        await edgeRequest<{ success: true; meal: Meal | null }>('meals-admin', {
          token: accessToken,
          method: 'PATCH',
          body: {
            id: editingMealId,
            name,
            category: mealCategory.trim() ? mealCategory.trim() : null,
            description: mealDescription.trim() ? mealDescription.trim() : null,
            imageUrl: finalImageUrl,
            isActive: mealIsActive,
          },
        });
        await edgeRequest('meal-weekdays', { token: accessToken, body: { mealId: editingMealId, weekdays: mealWeekdays } });
        setMessage({ type: 'success', text: 'Dish updated' });
      } else {
        const created = await edgeRequest<{ success: true; meal: Meal | null }>('meals-admin', {
          token: accessToken,
          method: 'POST',
          body: {
            name,
            category: mealCategory.trim() ? mealCategory.trim() : null,
            description: mealDescription.trim() ? mealDescription.trim() : null,
            imageUrl: null,
            isActive: mealIsActive,
          },
        });
        const createdId = created?.meal?.id;
        if (createdId && mealImageFile) {
          const url = await uploadMealImage(mealImageFile, createdId);
          await edgeRequest('meals-admin', {
            token: accessToken,
            method: 'PATCH',
            body: { id: createdId, imageUrl: url },
          });
        }
        if (createdId) await edgeRequest('meal-weekdays', { token: accessToken, body: { mealId: createdId, weekdays: mealWeekdays } });
        setMessage({ type: 'success', text: 'Dish created' });
      }

      resetMealForm();
      await refresh();
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message ?? 'Failed to save dish' });
    } finally {
      setMealSaving(false);
    }
  };

  const toggleMealActive = async (meal: Meal) => {
    setMealSaving(true);
    setMessage(null);
    try {
      await edgeRequest('meals-admin', {
        token: accessToken,
        method: 'PATCH',
        body: { id: meal.id, is_active: meal.is_active === false ? true : false },
      });
      setMessage({ type: 'success', text: 'Dish updated' });
      await refresh();
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message ?? 'Failed to update dish' });
    } finally {
      setMealSaving(false);
    }
  };

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-12">
        <h1 className="text-4xl font-extrabold tracking-tight text-neutral-900">Admin Control Center</h1>
        <p className="text-neutral-500 mt-2">Manage your business operations and daily menus.</p>
      </div>

      <AnimatePresence>
        {message && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`mb-8 p-4 rounded-2xl flex items-center gap-3 ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'}`}
          >
            {message.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
            <span className="font-bold text-sm">{message.text}</span>
            <button onClick={() => setMessage(null)} className="ml-auto text-xs font-bold uppercase tracking-widest">Dismiss</button>
          </motion.div>
        )}
      </AnimatePresence>
      
      <div className="grid gap-6 sm:grid-cols-3 mb-12">
        {[
          { label: 'Total Users', value: stats?.totalUsers, icon: <Users className="text-blue-500" />, color: 'bg-blue-50' },
          { label: 'Active Subs', value: stats?.activeSubs, icon: <BarChart3 className="text-green-500" />, color: 'bg-green-50' },
          { label: 'Today\'s Orders', value: stats?.todayOrders, icon: <ShoppingBag className="text-orange-500" />, color: 'bg-orange-50' }
        ].map((stat, i) => (
          <div key={i} className="rounded-[2rem] bg-white p-8 shadow-xl shadow-neutral-200/50 border border-neutral-100">
            <div className={`w-12 h-12 ${stat.color} rounded-2xl flex items-center justify-center mb-6`}>
              {stat.icon}
            </div>
            <div className="text-3xl font-black text-neutral-900">{loading ? '—' : stat.value?.toLocaleString() || 0}</div>
            <div className="text-xs font-bold uppercase tracking-widest text-neutral-400 mt-1">{stat.label}</div>
          </div>
        ))}
      </div>

      <div className="mb-10 flex flex-wrap gap-2">
        <button
          onClick={() => setPanel('manage')}
          className={`rounded-full px-5 py-3 text-sm font-black transition-all ${panel === 'manage' ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-700 border border-neutral-100 hover:bg-neutral-50'}`}
        >
          Menu Builder
        </button>
        <button
          onClick={() => setPanel('weekday')}
          className={`rounded-full px-5 py-3 text-sm font-black transition-all ${panel === 'weekday' ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-700 border border-neutral-100 hover:bg-neutral-50'}`}
        >
          Weekday Menu
        </button>
      </div>

      {panel === 'manage' && (
      <section className="rounded-[2.5rem] bg-white p-10 shadow-2xl shadow-neutral-200/50 border border-neutral-100">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-10 gap-6">
          <div>
            <h3 className="text-2xl font-bold text-neutral-900 flex items-center gap-3">
              <Plus size={24} className="text-orange-500" />
              Meals / Dish Catalog
            </h3>
            <p className="text-neutral-500 text-sm mt-1">Create and edit dishes directly from the dashboard.</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={refresh} className="rounded-2xl border border-neutral-100 bg-neutral-50 px-5 py-4 font-bold text-neutral-700 hover:bg-neutral-100 transition-all">
              Refresh
            </button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 mb-6">
          <input
            value={mealName}
            onChange={(e) => setMealName(e.target.value)}
            placeholder="Dish name"
            className="rounded-2xl border border-neutral-100 bg-neutral-50 p-4 focus:bg-white focus:ring-4 focus:ring-orange-500/10 transition-all outline-none font-bold"
          />
          <input
            value={mealCategory}
            onChange={(e) => setMealCategory(e.target.value)}
            placeholder="Category (optional)"
            className="rounded-2xl border border-neutral-100 bg-neutral-50 p-4 focus:bg-white focus:ring-4 focus:ring-orange-500/10 transition-all outline-none font-bold"
          />
          <textarea
            value={mealDescription}
            onChange={(e) => setMealDescription(e.target.value)}
            placeholder="Description (optional)"
            className="md:col-span-2 rounded-2xl border border-neutral-100 bg-neutral-50 p-4 focus:bg-white focus:ring-4 focus:ring-orange-500/10 transition-all outline-none font-bold min-h-[100px]"
          />
          <div className="md:col-span-2">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-bold uppercase tracking-widest text-neutral-400">Upload Image (optional)</div>
              {mealImageFile && (
                <button
                  type="button"
                  onClick={() => setMealImageFileSafe(null)}
                  className="text-xs font-black text-neutral-700 hover:text-neutral-900"
                >
                  Remove
                </button>
              )}
            </div>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                setMealImageFileSafe(file);
              }}
              className="mt-2 w-full rounded-2xl border border-neutral-100 bg-neutral-50 p-4 font-bold text-neutral-700 file:mr-4 file:rounded-xl file:border-0 file:bg-neutral-900 file:px-4 file:py-2 file:font-black file:text-white hover:bg-neutral-100 transition-all outline-none"
            />
            {(mealImagePreviewUrl || mealImageUrl) && (
              <div className="mt-3 overflow-hidden rounded-2xl border border-neutral-100 bg-white">
                <img
                  src={mealImagePreviewUrl ?? mealImageUrl}
                  className="h-48 w-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
            )}
          </div>
        </div>

        <div className="mb-10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <label className="flex items-center gap-3 font-bold text-neutral-700">
              <input type="checkbox" checked={mealIsActive} onChange={(e) => setMealIsActive(e.target.checked)} className="h-5 w-5 rounded border-neutral-200" />
              Active
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={resetMealForm}
                disabled={mealSaving}
                className="rounded-2xl border border-neutral-100 bg-neutral-50 px-5 py-3 font-bold text-neutral-700 hover:bg-neutral-100 transition-all disabled:opacity-50"
              >
                Clear
              </button>
              <button
                onClick={saveMeal}
                disabled={mealSaving}
                className="rounded-2xl bg-neutral-900 px-6 py-3 font-bold text-white shadow-xl shadow-neutral-200 hover:bg-neutral-800 transition-all disabled:opacity-50"
              >
                {mealSaving ? 'Saving...' : editingMealId ? 'Save Changes' : 'Create Dish'}
              </button>
            </div>
          </div>

          <div className="mt-6">
            <div className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-3">Weekdays</div>
            <div className="flex flex-wrap gap-2">
              {weekdayLabels.map((label, idx) => {
                const day = idx + 1;
                const active = mealWeekdays.includes(day);
                return (
                  <button
                    key={label}
                    onClick={() => setMealWeekdays((p) => active ? p.filter((d) => d !== day) : [...p, day])}
                    className={`rounded-full px-4 py-2 text-sm font-black transition-all ${active ? 'bg-neutral-900 text-white' : 'bg-neutral-50 text-neutral-700 border border-neutral-100 hover:bg-neutral-100'}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {loading ? (
            <div className="text-neutral-500 font-bold">Loading dishes...</div>
          ) : meals.map((meal) => (
            <div key={meal.id} className="rounded-3xl border border-neutral-100 bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-bold text-neutral-900 text-lg leading-tight">{meal.name}</div>
                  <div className="mt-1 text-xs font-bold uppercase tracking-widest text-neutral-400">{meal.category || 'Uncategorized'}</div>
                </div>
                <div className={`rounded-full px-3 py-1 text-xs font-black ${meal.is_active === false ? 'bg-neutral-100 text-neutral-500' : 'bg-green-50 text-green-700'}`}>
                  {meal.is_active === false ? 'Inactive' : 'Active'}
                </div>
              </div>
              <div className="mt-4 text-xs font-bold text-neutral-400">
                {(() => {
                  const days = weekdayAssignments[meal.id] ?? [];
                  return `Days: ${days.length ? days.map((d) => weekdayLabels[d - 1]).join(', ') : '—'}`;
                })()}
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  onClick={() => startEditMeal(meal)}
                  disabled={mealSaving}
                  className="rounded-2xl border border-neutral-100 bg-neutral-50 px-4 py-2 font-bold text-neutral-700 hover:bg-neutral-100 transition-all disabled:opacity-50"
                >
                  Edit
                </button>
                <button
                  onClick={() => toggleMealActive(meal)}
                  disabled={mealSaving}
                  className="rounded-2xl border border-neutral-100 bg-neutral-50 px-4 py-2 font-bold text-neutral-700 hover:bg-neutral-100 transition-all disabled:opacity-50"
                >
                  {meal.is_active === false ? 'Activate' : 'Deactivate'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
      )}

      {panel === 'weekday' && (
      <section className="rounded-[2.5rem] bg-white p-10 shadow-2xl shadow-neutral-200/50 border border-neutral-100">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-10 gap-6">
          <div>
            <h3 className="text-2xl font-bold text-neutral-900 flex items-center gap-3">
              <Calendar size={24} className="text-orange-500" />
              Weekday Menu
            </h3>
            <p className="text-neutral-500 text-sm mt-1">View dishes assigned to each weekday.</p>
          </div>
        </div>

        <div className="mb-8 flex flex-wrap gap-2">
          {weekdayLabels.map((label, idx) => {
            const day = idx + 1;
            const active = viewDayOfWeek === day;
            return (
              <button
                key={label}
                onClick={() => setViewDayOfWeek(day)}
                className={`rounded-full px-4 py-2 text-sm font-black transition-all ${active ? 'bg-neutral-900 text-white' : 'bg-neutral-50 text-neutral-700 border border-neutral-100 hover:bg-neutral-100'}`}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {loading ? (
            <div className="text-neutral-500 font-bold">Loading...</div>
          ) : (() => {
            const items = activeMeals.filter((m) => (weekdayAssignments[m.id] ?? []).includes(viewDayOfWeek));
            if (items.length === 0) return <div className="text-neutral-500 font-bold">No dishes assigned.</div>;
            return items.map((meal) => (
              <div key={meal.id} className="rounded-3xl border border-neutral-100 bg-white p-6 shadow-sm">
                <div className="font-bold text-neutral-900 text-lg leading-tight">{meal.name}</div>
                <div className="mt-1 text-xs font-bold uppercase tracking-widest text-neutral-400">{meal.category || 'Uncategorized'}</div>
              </div>
            ));
          })()}
        </div>
      </section>
      )}
    </div>
  );
};

const KitchenDashboard = ({ accessToken }: { accessToken: string }) => {
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [editingMealId, setEditingMealId] = useState<string | null>(null);
  const [mealName, setMealName] = useState('');
  const [mealCategory, setMealCategory] = useState('');
  const [mealDescription, setMealDescription] = useState('');
  const [mealImageUrl, setMealImageUrl] = useState('');
  const [mealImageFile, setMealImageFile] = useState<File | null>(null);
  const [mealImagePreviewUrl, setMealImagePreviewUrl] = useState<string | null>(null);
  const [mealIsActive, setMealIsActive] = useState(true);
  const [mealSaving, setMealSaving] = useState(false);
  const [mealWeekdays, setMealWeekdays] = useState<number[]>([]);
  const [weekdayAssignments, setWeekdayAssignments] = useState<Record<string, number[]>>({});
  const [viewDayOfWeek, setViewDayOfWeek] = useState<number>(1);
  const [kitchenTab, setKitchenTab] = useState<'menu' | 'weekdayMenu' | 'todayOrders' | 'weekdayOrders'>(() => 'todayOrders');
  const [weekdayOrdersLayout, setWeekdayOrdersLayout] = useState<'kanban' | 'list'>(() => 'kanban');
  const [confirmDeleteMeal, setConfirmDeleteMeal] = useState<Meal | null>(null);
  const [mealsUsedInOrders, setMealsUsedInOrders] = useState<Record<string, true>>({});
  const [hoverDeleteMealId, setHoverDeleteMealId] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (mealImagePreviewUrl) URL.revokeObjectURL(mealImagePreviewUrl);
    };
  }, [mealImagePreviewUrl]);

  const setMealImageFileSafe = (file: File | null) => {
    if (mealImagePreviewUrl) URL.revokeObjectURL(mealImagePreviewUrl);
    setMealImagePreviewUrl(file ? URL.createObjectURL(file) : null);
    setMealImageFile(file);
  };

  const uploadMealImage = async (file: File, mealId: string) => {
    if (!file.type?.startsWith('image/')) throw new Error('Please select an image file');
    if (file.size > 5 * 1024 * 1024) throw new Error('Image must be 5MB or smaller');

    const originalExt = file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase() : undefined;
    const ext = originalExt && /^[a-z0-9]+$/i.test(originalExt) ? originalExt : 'jpg';
    const path = `meals/${mealId}/${crypto.randomUUID()}.${ext}`;

    const { error } = await supabase.storage.from('meal-images').upload(path, file, {
      upsert: true,
      contentType: file.type || undefined,
    });
    if (error) throw new Error(error.message);

    const { data } = supabase.storage.from('meal-images').getPublicUrl(path);
    return data.publicUrl;
  };

  const refresh = useCallback(async (silent?: boolean) => {
    if (!silent) setLoading(true);
    try {
      if (kitchenTab === 'todayOrders' || kitchenTab === 'weekdayOrders') {
        const ordersData = await edgeRequest<KitchenOrder[]>('kitchen-orders', {
          token: accessToken,
          query: kitchenTab === 'weekdayOrders' ? { mode: 'weekday' } : undefined,
        });
        setOrders(ordersData ?? []);
      }

      if (kitchenTab === 'menu' || kitchenTab === 'weekdayMenu') {
        const [mealsRes, weekdayRes] = await Promise.all([
          supabase.from('meals').select('id, name, description, category, image_url, is_active').order('created_at', { ascending: false }),
          supabase.from('weekday_menus').select('meal_id, day_of_week'),
        ]);
        if (mealsRes.error) throw new Error(mealsRes.error.message);
        if (weekdayRes.error) throw new Error(weekdayRes.error.message);
        const mealsList = (mealsRes.data ?? []) as Meal[];
        setMeals(mealsList);
        try {
          const mealIds = mealsList.map((m) => m.id);
          const usage = await edgeRequest<{ usedMealIds: string[] }>('meals-admin', {
            token: accessToken,
            method: 'POST',
            body: { action: 'used_in_orders', mealIds },
          });
          const used: Record<string, true> = {};
          for (const id of (usage?.usedMealIds ?? [])) used[String(id)] = true;
          setMealsUsedInOrders(used);
        } catch {
          setMealsUsedInOrders({});
        }
        const map: Record<string, number[]> = {};
        for (const row of (weekdayRes.data ?? []) as any[]) {
          const mealId = String(row.meal_id);
          const day = Number(row.day_of_week);
          if (!Number.isFinite(day)) continue;
          map[mealId] = map[mealId] ? [...map[mealId], day] : [day];
        }
        for (const k of Object.keys(map)) map[k] = Array.from(new Set(map[k])).sort((a, b) => a - b);
        setWeekdayAssignments(map);
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message ?? 'Failed to load kitchen orders' });
    } finally {
      if (!silent) setLoading(false);
    }
  }, [accessToken, kitchenTab]);

  useEffect(() => {
    refresh();
    if (kitchenTab === 'todayOrders' || kitchenTab === 'weekdayOrders') {
      const id = window.setInterval(() => refresh(true), 10_000);
      return () => window.clearInterval(id);
    }
  }, [refresh, kitchenTab]);

  const activeMeals = meals.filter((m) => m.is_active !== false);
  const weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const scheduledOrdersByDay = weekdayLabels.map((_, idx) => {
    const day = idx + 1;
    return {
      day,
      label: weekdayLabels[idx],
      orders: (orders ?? []).filter((o) => o.status === 'scheduled' && o.day_of_week === day),
    };
  });

  const resetMealForm = () => {
    setEditingMealId(null);
    setMealName('');
    setMealCategory('');
    setMealDescription('');
    setMealImageUrl('');
    setMealImageFileSafe(null);
    setMealIsActive(true);
    setMealWeekdays([]);
  };

  const startEditMeal = (meal: Meal) => {
    setEditingMealId(meal.id);
    setMealName(meal.name ?? '');
    setMealCategory(meal.category ?? '');
    setMealDescription(meal.description ?? '');
    setMealImageUrl(meal.image_url ?? '');
    setMealImageFileSafe(null);
    setMealIsActive(meal.is_active !== false);
    setMealWeekdays(weekdayAssignments[meal.id] ?? []);
  };

  const saveMeal = async () => {
    const name = mealName.trim();
    if (!name) {
      setMessage({ type: 'error', text: 'Dish name is required' });
      return;
    }

    setMealSaving(true);
    setMessage(null);
    try {
      if (editingMealId) {
        const finalImageUrl = mealImageFile
          ? await uploadMealImage(mealImageFile, editingMealId)
          : mealImageUrl.trim()
            ? mealImageUrl.trim()
            : null;

        await edgeRequest<{ success: true; meal: Meal | null }>('meals-admin', {
          token: accessToken,
          method: 'PATCH',
          body: {
            id: editingMealId,
            name,
            category: mealCategory.trim() ? mealCategory.trim() : null,
            description: mealDescription.trim() ? mealDescription.trim() : null,
            imageUrl: finalImageUrl,
            isActive: mealIsActive,
          },
        });
        await edgeRequest('meal-weekdays', { token: accessToken, body: { mealId: editingMealId, weekdays: mealWeekdays } });
        setMessage({ type: 'success', text: 'Dish updated' });
      } else {
        const created = await edgeRequest<{ success: true; meal: Meal | null }>('meals-admin', {
          token: accessToken,
          method: 'POST',
          body: {
            name,
            category: mealCategory.trim() ? mealCategory.trim() : null,
            description: mealDescription.trim() ? mealDescription.trim() : null,
            imageUrl: null,
            isActive: mealIsActive,
          },
        });
        const createdId = created?.meal?.id;
        if (createdId && mealImageFile) {
          const url = await uploadMealImage(mealImageFile, createdId);
          await edgeRequest('meals-admin', {
            token: accessToken,
            method: 'PATCH',
            body: { id: createdId, imageUrl: url },
          });
        }
        if (createdId) await edgeRequest('meal-weekdays', { token: accessToken, body: { mealId: createdId, weekdays: mealWeekdays } });
        setMessage({ type: 'success', text: 'Dish created' });
      }

      resetMealForm();
      await refresh(true);
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message ?? 'Failed to save dish' });
    } finally {
      setMealSaving(false);
    }
  };

  const toggleMealActive = async (meal: Meal) => {
    setMealSaving(true);
    setMessage(null);
    try {
      await edgeRequest('meals-admin', {
        token: accessToken,
        method: 'PATCH',
        body: { id: meal.id, is_active: meal.is_active === false ? true : false },
      });
      setMessage({ type: 'success', text: 'Dish updated' });
      await refresh(true);
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message ?? 'Failed to update dish' });
    } finally {
      setMealSaving(false);
    }
  };

  const performDeleteMeal = async (meal: Meal) => {
    setMealSaving(true);
    setMessage(null);
    try {
      await edgeRequest('meals-admin', { token: accessToken, method: 'DELETE', body: { id: meal.id } });
      if (editingMealId === meal.id) resetMealForm();
      setMessage({ type: 'success', text: 'Dish deleted' });
      await refresh(true);
    } catch (err: any) {
      const msg = String(err?.message ?? 'Failed to delete dish');
      if (msg.includes('already been used in orders')) {
        setMealsUsedInOrders((prev) => ({ ...prev, [meal.id]: true }));
        setMessage({ type: 'info', text: 'Cannot delete dish: it has already been used in orders' });
      } else {
        setMessage({ type: 'error', text: msg });
      }
    } finally {
      setMealSaving(false);
    }
  };

  const requestDeleteMeal = (meal: Meal) => {
    if (mealsUsedInOrders[meal.id]) {
      setHoverDeleteMealId(meal.id);
      return;
    }
    setConfirmDeleteMeal(meal);
  };

  const updateStatus = async (id: string, status: string) => {
    setMessage(null);
    try {
      await edgeRequest('update-order-status', { token: accessToken, method: 'PATCH', body: { orderId: id, status } });
      setOrders(p => p.map(o => o.id === id ? { ...o, status } : o));
      setMessage({ type: 'success', text: 'Status updated' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message ?? 'Failed to update status' });
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between mb-12">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-neutral-900 flex items-center gap-4">
            <ChefHat size={40} className="text-orange-500" /> 
            Kitchen Display
          </h1>
          <p className="text-neutral-500 mt-2">
            {kitchenTab === 'todayOrders'
              ? "Live order feed for today's preparations."
              : kitchenTab === 'weekdayOrders'
                ? 'Weekly scheduled orders by weekday.'
                : 'Manage dishes and weekday menus.'}
          </p>
        </div>
        <div className="px-6 py-3 bg-orange-50 rounded-2xl border border-orange-100">
          <span className="text-sm font-bold text-orange-600">
            {kitchenTab === 'todayOrders'
              ? `${orders.length} Active Orders`
              : kitchenTab === 'weekdayOrders'
                ? `${orders.length} Scheduled Orders`
                : `${meals.length} Dishes`}
          </span>
        </div>
      </div>

      <div className="grid gap-6">
        <AnimatePresence>
          {message && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`p-4 rounded-2xl flex items-center gap-3 ${
                message.type === 'success'
                  ? 'bg-green-50 text-green-700 border border-green-100'
                  : message.type === 'info'
                    ? 'bg-neutral-50 text-neutral-700 border border-neutral-100'
                    : 'bg-red-50 text-red-700 border border-red-100'
              }`}
            >
              {message.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
              <span className="font-bold text-sm">{message.text}</span>
              <button onClick={() => setMessage(null)} className="ml-auto text-xs font-bold uppercase tracking-widest">Dismiss</button>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {confirmDeleteMeal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.98, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98, y: 10 }}
                className="w-full max-w-md rounded-[2.5rem] bg-white p-8 shadow-2xl shadow-neutral-900/20 border border-neutral-100"
              >
                <div className="text-2xl font-black text-neutral-900">Delete dish?</div>
                <div className="mt-2 text-sm font-bold text-neutral-500">
                  This will permanently delete “{confirmDeleteMeal.name}”. This cannot be undone.
                </div>
                <div className="mt-8 flex flex-col sm:flex-row gap-3 sm:justify-end">
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteMeal(null)}
                    disabled={mealSaving}
                    className="px-6 py-3 rounded-2xl bg-neutral-100 text-neutral-900 font-bold hover:bg-neutral-200 transition-all disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const meal = confirmDeleteMeal;
                      setConfirmDeleteMeal(null);
                      await performDeleteMeal(meal);
                    }}
                    disabled={mealSaving}
                    className="px-6 py-3 rounded-2xl bg-red-600 text-white font-bold shadow-xl shadow-red-200 hover:bg-red-700 transition-all disabled:opacity-50"
                  >
                    {mealSaving ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setKitchenTab('menu')}
            className={`rounded-full px-5 py-3 text-sm font-black transition-all ${kitchenTab === 'menu' ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-700 border border-neutral-100 hover:bg-neutral-50'}`}
          >
            Menu Builder
          </button>
          <button
            onClick={() => setKitchenTab('weekdayMenu')}
            className={`rounded-full px-5 py-3 text-sm font-black transition-all ${kitchenTab === 'weekdayMenu' ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-700 border border-neutral-100 hover:bg-neutral-50'}`}
          >
            Weekday Menu
          </button>
          <button
            onClick={() => setKitchenTab('todayOrders')}
            className={`rounded-full px-5 py-3 text-sm font-black transition-all ${kitchenTab === 'todayOrders' ? 'bg-orange-500 text-white shadow-xl shadow-orange-200' : 'bg-white text-neutral-700 border border-neutral-100 hover:bg-neutral-50'}`}
          >
            Today Orders
          </button>
          <button
            onClick={() => setKitchenTab('weekdayOrders')}
            className={`rounded-full px-5 py-3 text-sm font-black transition-all ${kitchenTab === 'weekdayOrders' ? 'bg-orange-500 text-white shadow-xl shadow-orange-200' : 'bg-white text-neutral-700 border border-neutral-100 hover:bg-neutral-50'}`}
          >
            Weekday Orders
          </button>
        </div>

        {kitchenTab === 'weekdayOrders' && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setWeekdayOrdersLayout('kanban')}
              className={`rounded-full px-5 py-3 text-sm font-black transition-all ${weekdayOrdersLayout === 'kanban' ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-700 border border-neutral-100 hover:bg-neutral-50'}`}
            >
              Kanban View
            </button>
            <button
              onClick={() => setWeekdayOrdersLayout('list')}
              className={`rounded-full px-5 py-3 text-sm font-black transition-all ${weekdayOrdersLayout === 'list' ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-700 border border-neutral-100 hover:bg-neutral-50'}`}
            >
              List View
            </button>
          </div>
        )}

        {kitchenTab === 'menu' && (
        <section className="rounded-[2.5rem] bg-white p-10 shadow-2xl shadow-neutral-200/50 border border-neutral-100">
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-10 gap-6">
            <div>
              <h3 className="text-2xl font-bold text-neutral-900 flex items-center gap-3">
                <Plus size={24} className="text-orange-500" />
                Meals / Dish Catalog
              </h3>
              <p className="text-neutral-500 text-sm mt-1">Create and edit dishes directly from the dashboard.</p>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => refresh()} className="rounded-2xl border border-neutral-100 bg-neutral-50 px-5 py-4 font-bold text-neutral-700 hover:bg-neutral-100 transition-all">
                Refresh
              </button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 mb-6">
            <input
              value={mealName}
              onChange={(e) => setMealName(e.target.value)}
              placeholder="Dish name"
              className="rounded-2xl border border-neutral-100 bg-neutral-50 p-4 focus:bg-white focus:ring-4 focus:ring-orange-500/10 transition-all outline-none font-bold"
            />
            <input
              value={mealCategory}
              onChange={(e) => setMealCategory(e.target.value)}
              placeholder="Category (optional)"
              className="rounded-2xl border border-neutral-100 bg-neutral-50 p-4 focus:bg-white focus:ring-4 focus:ring-orange-500/10 transition-all outline-none font-bold"
            />
            <textarea
              value={mealDescription}
              onChange={(e) => setMealDescription(e.target.value)}
              placeholder="Description (optional)"
              className="md:col-span-2 rounded-2xl border border-neutral-100 bg-neutral-50 p-4 focus:bg-white focus:ring-4 focus:ring-orange-500/10 transition-all outline-none font-bold min-h-[100px]"
            />
          <div className="md:col-span-2">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-bold uppercase tracking-widest text-neutral-400">Upload Image (optional)</div>
              {mealImageFile && (
                <button
                  type="button"
                  onClick={() => setMealImageFileSafe(null)}
                  className="text-xs font-black text-neutral-700 hover:text-neutral-900"
                >
                  Remove
                </button>
              )}
            </div>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                setMealImageFileSafe(file);
              }}
              className="mt-2 w-full rounded-2xl border border-neutral-100 bg-neutral-50 p-4 font-bold text-neutral-700 file:mr-4 file:rounded-xl file:border-0 file:bg-neutral-900 file:px-4 file:py-2 file:font-black file:text-white hover:bg-neutral-100 transition-all outline-none"
            />
            {(mealImagePreviewUrl || mealImageUrl) && (
              <div className="mt-3 overflow-hidden rounded-2xl border border-neutral-100 bg-white">
                <img
                  src={mealImagePreviewUrl ?? mealImageUrl}
                  className="h-48 w-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
            )}
          </div>
          </div>

          <div className="mb-10">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <label className="flex items-center gap-3 font-bold text-neutral-700">
                <input type="checkbox" checked={mealIsActive} onChange={(e) => setMealIsActive(e.target.checked)} className="h-5 w-5 rounded border-neutral-200" />
                Active
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={resetMealForm}
                  disabled={mealSaving}
                  className="rounded-2xl border border-neutral-100 bg-neutral-50 px-5 py-3 font-bold text-neutral-700 hover:bg-neutral-100 transition-all disabled:opacity-50"
                >
                  Clear
                </button>
                <button
                  onClick={saveMeal}
                  disabled={mealSaving}
                  className="rounded-2xl bg-neutral-900 px-6 py-3 font-bold text-white shadow-xl shadow-neutral-200 hover:bg-neutral-800 transition-all disabled:opacity-50"
                >
                  {mealSaving ? 'Saving...' : editingMealId ? 'Save Changes' : 'Create Dish'}
                </button>
              </div>
            </div>

            <div className="mt-6">
              <div className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-3">Weekdays</div>
              <div className="flex flex-wrap gap-2">
                {weekdayLabels.map((label, idx) => {
                  const day = idx + 1;
                  const active = mealWeekdays.includes(day);
                  return (
                    <button
                      key={label}
                      onClick={() => setMealWeekdays((p) => active ? p.filter((d) => d !== day) : [...p, day])}
                      className={`rounded-full px-4 py-2 text-sm font-black transition-all ${active ? 'bg-neutral-900 text-white' : 'bg-neutral-50 text-neutral-700 border border-neutral-100 hover:bg-neutral-100'}`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {loading ? (
              <div className="text-neutral-500 font-bold">Loading dishes...</div>
            ) : meals.map((meal) => (
              <div key={meal.id} className="rounded-3xl border border-neutral-100 bg-white p-6 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-bold text-neutral-900 text-lg leading-tight">{meal.name}</div>
                    <div className="mt-1 text-xs font-bold uppercase tracking-widest text-neutral-400">{meal.category || 'Uncategorized'}</div>
                  </div>
                  <div className={`rounded-full px-3 py-1 text-xs font-black ${meal.is_active === false ? 'bg-neutral-100 text-neutral-500' : 'bg-green-50 text-green-700'}`}>
                    {meal.is_active === false ? 'Inactive' : 'Active'}
                  </div>
                </div>
                <div className="mt-4 text-xs font-bold text-neutral-400">
                  {(() => {
                    const days = weekdayAssignments[meal.id] ?? [];
                    return `Days: ${days.length ? days.map((d) => weekdayLabels[d - 1]).join(', ') : '—'}`;
                  })()}
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  <button
                    onClick={() => startEditMeal(meal)}
                    disabled={mealSaving}
                    className="rounded-2xl border border-neutral-100 bg-neutral-50 px-4 py-2 font-bold text-neutral-700 hover:bg-neutral-100 transition-all disabled:opacity-50"
                  >
                    Edit
                  </button>
                  <div className="relative">
                    <button
                      onClick={() => requestDeleteMeal(meal)}
                      onMouseEnter={() => {
                        if (mealsUsedInOrders[meal.id]) setHoverDeleteMealId(meal.id);
                      }}
                      onMouseLeave={() => {
                        if (hoverDeleteMealId === meal.id) setHoverDeleteMealId(null);
                      }}
                      disabled={mealSaving}
                      className={`rounded-2xl border px-4 py-2 font-bold transition-all disabled:opacity-50 ${
                        mealsUsedInOrders[meal.id]
                          ? 'border-neutral-100 bg-neutral-50 text-neutral-400 cursor-not-allowed'
                          : 'border-red-100 bg-red-50 text-red-700 hover:bg-red-100'
                      }`}
                    >
                      Delete
                    </button>
                    {mealsUsedInOrders[meal.id] && hoverDeleteMealId === meal.id && (
                      <div className="absolute left-1/2 top-[-10px] -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-bold text-neutral-700 shadow-lg">
                        Used in orders • Can’t delete
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => toggleMealActive(meal)}
                    disabled={mealSaving}
                    className="rounded-2xl border border-neutral-100 bg-neutral-50 px-4 py-2 font-bold text-neutral-700 hover:bg-neutral-100 transition-all disabled:opacity-50"
                  >
                    {meal.is_active === false ? 'Activate' : 'Deactivate'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
        )}

        {kitchenTab === 'weekdayMenu' && (
        <section className="rounded-[2.5rem] bg-white p-10 shadow-2xl shadow-neutral-200/50 border border-neutral-100">
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-10 gap-6">
            <div>
              <h3 className="text-2xl font-bold text-neutral-900 flex items-center gap-3">
                <Calendar size={24} className="text-orange-500" />
                Weekday Menu
              </h3>
              <p className="text-neutral-500 text-sm mt-1">View dishes assigned to each weekday.</p>
            </div>
          </div>

          <div className="mb-8 flex flex-wrap gap-2">
            {weekdayLabels.map((label, idx) => {
              const day = idx + 1;
              const active = viewDayOfWeek === day;
              return (
                <button
                  key={label}
                  onClick={() => setViewDayOfWeek(day)}
                  className={`rounded-full px-4 py-2 text-sm font-black transition-all ${active ? 'bg-neutral-900 text-white' : 'bg-neutral-50 text-neutral-700 border border-neutral-100 hover:bg-neutral-100'}`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {loading ? (
              <div className="text-neutral-500 font-bold">Loading...</div>
            ) : (() => {
              const items = activeMeals.filter((m) => (weekdayAssignments[m.id] ?? []).includes(viewDayOfWeek));
              if (items.length === 0) return <div className="text-neutral-500 font-bold">No dishes assigned.</div>;
              return items.map((meal) => (
                <button
                  key={meal.id}
                  type="button"
                  onClick={() => {
                    setKitchenTab('menu');
                    startEditMeal(meal);
                  }}
                  className="text-left rounded-3xl border border-neutral-100 bg-white p-6 shadow-sm hover:bg-neutral-50 transition-all"
                >
                  <div className="font-bold text-neutral-900 text-lg leading-tight">{meal.name}</div>
                  <div className="mt-1 text-xs font-bold uppercase tracking-widest text-neutral-400">{meal.category || 'Uncategorized'}</div>
                </button>
              ));
            })()}
          </div>
        </section>
        )}

        {(kitchenTab === 'todayOrders' || kitchenTab === 'weekdayOrders') && (
          <AnimatePresence>
            {loading ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-[2.5rem] bg-white p-8 shadow-xl shadow-neutral-200/50 border border-neutral-100 text-neutral-500 font-bold">
                Loading orders...
              </motion.div>
            ) : orders.length === 0 ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-[2.5rem] bg-white p-8 shadow-xl shadow-neutral-200/50 border border-neutral-100 text-neutral-500 font-bold">
                No orders yet
              </motion.div>
            ) : kitchenTab === 'weekdayOrders' ? (
              weekdayOrdersLayout === 'kanban' ? (
                <div className="overflow-x-auto pb-2">
                  <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${weekdayLabels.length}, minmax(320px, 1fr))` }}>
                    {scheduledOrdersByDay.map((col) => (
                      <div key={`kanban-${col.day}`} className="rounded-[2.5rem] bg-white p-6 shadow-xl shadow-neutral-200/50 border border-neutral-100">
                        <div className="flex items-center justify-between mb-6">
                          <div className="text-lg font-black text-neutral-900">{col.label}</div>
                          <div className="text-xs font-black uppercase tracking-widest text-neutral-400">{col.orders.length}</div>
                        </div>
                        {col.orders.length === 0 ? (
                          <div className="text-neutral-500 font-bold">No scheduled orders</div>
                        ) : (
                          <div className="space-y-4">
                            {col.orders.map((order) => (
                              <div key={order.id} className="rounded-3xl border border-neutral-100 bg-neutral-50/40 p-5">
                                <div className="flex items-center gap-3 mb-3">
                                  <span className="px-3 py-1 bg-white rounded-full text-[10px] font-black uppercase tracking-widest text-neutral-500 border border-neutral-100">
                                    scheduled
                                  </span>
                                  <span className="ml-auto text-xs font-bold text-neutral-400">{order.users?.full_name || 'Customer'}</span>
                                </div>
                                <div className="text-sm font-bold text-neutral-900">
                                  {order.order_items.map((i) => `${i.meals.name} x${i.quantity}`).join(', ')}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {scheduledOrdersByDay.map((section) => (
                    <div key={`list-${section.day}`} className="rounded-[2.5rem] bg-white p-8 shadow-xl shadow-neutral-200/50 border border-neutral-100">
                      <div className="flex items-center justify-between mb-6">
                        <div className="text-2xl font-black text-neutral-900">{section.label}</div>
                        <div className="text-xs font-black uppercase tracking-widest text-neutral-400">{section.orders.length} orders</div>
                      </div>
                      {section.orders.length === 0 ? (
                        <div className="text-neutral-500 font-bold">No scheduled orders</div>
                      ) : (
                        <div className="grid gap-4">
                          {section.orders.map((order) => (
                            <div key={order.id} className="rounded-3xl border border-neutral-100 bg-neutral-50/40 p-6">
                              <div className="flex items-center gap-3 mb-4">
                                <span className="px-3 py-1 bg-white rounded-full text-[10px] font-black uppercase tracking-widest text-neutral-500 border border-neutral-100">
                                  scheduled
                                </span>
                                <span className="ml-auto text-xs font-bold text-neutral-400">{order.users?.full_name || 'Customer'}</span>
                              </div>
                              <div className="text-sm font-bold text-neutral-900">
                                {order.order_items.map((i) => `${i.meals.name} x${i.quantity}`).join(', ')}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )
            ) : (
              orders.map(order => (
              <motion.div 
                key={order.id} 
                layout
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="rounded-[2.5rem] bg-white p-8 shadow-xl shadow-neutral-200/50 border border-neutral-100 flex flex-col lg:flex-row lg:items-center justify-between gap-8"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="px-4 py-1 bg-neutral-100 rounded-full text-[10px] font-black uppercase tracking-widest text-neutral-500">#{order.id}</span>
                    <span className={`px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                      order.status === 'pending' ? 'bg-yellow-100 text-yellow-700' : 
                      order.status === 'prepared' ? 'bg-blue-100 text-blue-700' : 
                      'bg-green-100 text-green-700'
                    }`}>
                      {order.status}
                    </span>
                    <span className="text-xs font-bold text-neutral-400 flex items-center gap-1 ml-auto lg:ml-0">
                      <Clock size={14} /> {new Date(order.created_at).toLocaleTimeString()}
                    </span>
                  </div>
                  <h3 className="text-2xl font-black text-neutral-900 mb-2">{order.users?.full_name || 'Customer'}</h3>
                  <p className="text-lg text-neutral-600 font-medium leading-relaxed">
                    {order.order_items.map((i) => `${i.meals.name} x${i.quantity}`).join(', ')}
                  </p>
                  <div className="mt-6 flex items-center gap-6">
                    <div className="flex items-center gap-2 text-xs font-bold text-neutral-400 uppercase tracking-widest">
                      {order.delivery_type === 'delivery' ? <Truck size={16} className="text-orange-500" /> : <MapPin size={16} className="text-orange-500" />}
                      {order.delivery_type} {order.zip_code && `• ${order.zip_code}`}
                    </div>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                  <button 
                    onClick={() => updateStatus(order.id, 'prepared')} 
                    className="px-8 py-4 rounded-2xl bg-neutral-100 text-neutral-900 font-bold hover:bg-neutral-200 transition-all"
                  >
                    Mark Prepared
                  </button>
                  <button 
                    onClick={() => updateStatus(order.id, 'delivered')} 
                    className="px-8 py-4 rounded-2xl bg-orange-500 text-white font-bold shadow-xl shadow-orange-200 hover:bg-orange-600 transition-all"
                  >
                    Mark Delivered
                  </button>
                </div>
              </motion.div>
            )))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
};

const DevDashboard = ({ accessToken }: { accessToken: string }) => {
  const navigate = useNavigate();
  const [users, setUsers] = useState<DevUserAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const data = await edgeRequest<DevUserAccount[]>('dev-users', { token: accessToken, query: { limit: '200' } });
      setUsers(data ?? []);
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message ?? 'Failed to load users' });
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div className="mx-auto max-w-7xl px-6 py-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-10">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-neutral-900 flex items-center gap-4">
            <LayoutDashboard className="text-orange-500" />
            Dev Console
          </h1>
          <p className="text-neutral-500 font-bold mt-3">Super admin view. Access all dashboards and review user accounts.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button onClick={() => navigate('/dashboard')} className="rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-neutral-200 hover:bg-neutral-800 transition-all">
            View User
          </button>
          <button onClick={() => navigate('/admin')} className="rounded-full bg-white px-5 py-2.5 text-sm font-bold text-neutral-900 border border-neutral-200 hover:bg-neutral-50 transition-all">
            View Admin
          </button>
          <button onClick={() => navigate('/kitchen')} className="rounded-full bg-white px-5 py-2.5 text-sm font-bold text-neutral-900 border border-neutral-200 hover:bg-neutral-50 transition-all">
            View Kitchen
          </button>
          <button onClick={refresh} className="rounded-full bg-orange-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-orange-200 hover:bg-orange-600 transition-all">
            Refresh Users
          </button>
        </div>
      </div>

      {message && (
        <div className={`mb-8 rounded-3xl border p-5 font-bold ${message.type === 'error' ? 'border-red-100 bg-red-50 text-red-600' : 'border-green-100 bg-green-50 text-green-700'}`}>
          {message.text}
        </div>
      )}

      <section className="rounded-[2.5rem] bg-white p-8 shadow-2xl shadow-neutral-200/50 border border-neutral-100">
        <div className="flex items-center justify-between gap-6 mb-6">
          <h2 className="text-2xl font-bold flex items-center gap-3">
            <Users size={22} className="text-orange-500" />
            User Accounts
          </h2>
          <div className="text-xs font-bold uppercase tracking-widest text-neutral-400">
            {loading ? 'Loading…' : `${users.length} users`}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[11px] font-black uppercase tracking-widest text-neutral-400">
                <th className="py-3 pr-4">Name</th>
                <th className="py-3 pr-4">Email</th>
                <th className="py-3 pr-4">Role</th>
                <th className="py-3 pr-0">Created</th>
              </tr>
            </thead>
            <tbody className="text-sm font-bold text-neutral-700">
              {(users ?? []).map((u) => (
                <tr key={u.id} className="border-t border-neutral-100">
                  <td className="py-4 pr-4">{u.full_name ?? '—'}</td>
                  <td className="py-4 pr-4">{u.email ?? '—'}</td>
                  <td className="py-4 pr-4">
                    <span className={`inline-flex items-center rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${u.role === 'dev' ? 'bg-orange-50 text-orange-600' : u.role === 'admin' ? 'bg-neutral-900 text-white' : u.role === 'kitchen' ? 'bg-green-50 text-green-700' : 'bg-neutral-100 text-neutral-700'}`}>
                      {u.role === 'dev' ? 'Dev' : u.role}
                    </span>
                  </td>
                  <td className="py-4 pr-0 text-neutral-500">{new Date(u.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && users.length === 0 && (
            <div className="py-10 text-neutral-500 font-bold">No users found.</div>
          )}
        </div>
      </section>
    </div>
  );
};

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<UserData | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const loadUserFromSession = useCallback(async (s: Session | null) => {
    if (!s?.user) {
      setUser(null);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('role, full_name')
      .eq('id', s.user.id)
      .maybeSingle();

    if (profileError) {
      setUser({
        id: s.user.id,
        email: s.user.email ?? '',
        name: (s.user.email ?? '').split('@')[0] || 'User',
        role: 'user',
      });
      return;
    }

    setUser({
      id: s.user.id,
      email: s.user.email ?? '',
      name: profile?.full_name || (s.user.email ?? '').split('@')[0] || 'User',
      role: (profile?.role ?? 'user') as UserData['role'],
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      loadUserFromSession(data.session).finally(() => {
        if (!cancelled) setAuthLoading(false);
      });
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!cancelled) setAuthLoading(true);
      setSession(nextSession);
      loadUserFromSession(nextSession).finally(() => {
        if (!cancelled) setAuthLoading(false);
      });
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, [loadUserFromSession]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const accessToken = session?.access_token ?? '';
  const authedHome =
    user?.role === 'dev' ? '/dev' : user?.role === 'admin' ? '/admin' : user?.role === 'kitchen' ? '/kitchen' : '/dashboard';

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-white font-sans text-neutral-900 selection:bg-orange-100 selection:text-orange-900">
        <Navbar user={user} onLogout={handleLogout} />
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route
            path="/login"
            element={
              authLoading ? (
                <div className="mx-auto max-w-md px-4 py-24 text-neutral-500 font-bold">Loading...</div>
              ) : session ? (
                <Navigate to={authedHome} />
              ) : (
                <LoginPage />
              )
            }
          />
          <Route path="/signup" element={<SignupPage />} />
          <Route
            path="/dashboard"
            element={
              authLoading ? (
                <div className="mx-auto max-w-md px-4 py-24 text-neutral-500 font-bold">Loading...</div>
              ) : session && (user?.role === 'user' || user?.role === 'dev') ? (
                <UserDashboard user={user} accessToken={accessToken} />
              ) : (
                <Navigate to="/login" />
              )
            }
          />
          <Route
            path="/admin"
            element={
              authLoading ? (
                <div className="mx-auto max-w-md px-4 py-24 text-neutral-500 font-bold">Loading...</div>
              ) : session && (user?.role === 'admin' || user?.role === 'dev') ? (
                <AdminDashboard accessToken={accessToken} />
              ) : (
                <Navigate to="/login" />
              )
            }
          />
          <Route
            path="/kitchen"
            element={
              authLoading ? (
                <div className="mx-auto max-w-md px-4 py-24 text-neutral-500 font-bold">Loading...</div>
              ) : session && (user?.role === 'kitchen' || user?.role === 'dev') ? (
                <KitchenDashboard accessToken={accessToken} />
              ) : (
                <Navigate to="/login" />
              )
            }
          />
          <Route
            path="/dev"
            element={
              authLoading ? (
                <div className="mx-auto max-w-md px-4 py-24 text-neutral-500 font-bold">Loading...</div>
              ) : session && user?.role === 'dev' ? (
                <DevDashboard accessToken={accessToken} />
              ) : (
                <Navigate to="/login" />
              )
            }
          />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
