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
interface Meal { id: string; name: string; description: string | null; category: string | null; image_url?: string | null; }
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

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const functionsBaseUrl = `${supabaseUrl.replace(/\/$/, '')}/functions/v1`;

async function edgeRequest<T>(
  fn: string,
  opts?: { method?: string; body?: unknown; token?: string; query?: Record<string, string | undefined> }
) {
  const qs = opts?.query
    ? `?${new URLSearchParams(Object.entries(opts.query).filter(([, v]) => typeof v === 'string') as Array<[string, string]>).toString()}`
    : '';

  const res = await fetch(`${functionsBaseUrl}/${fn}${qs}`, {
    method: opts?.method ?? (opts?.body ? 'POST' : 'GET'),
    headers: {
      apikey: supabaseAnonKey,
      authorization: `Bearer ${opts?.token || supabaseAnonKey}`,
      ...(opts?.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
  });

  const text = await res.text();
  const data = text ? (() => { try { return JSON.parse(text); } catch { return { error: text }; } })() : null;

  if (!res.ok) {
    const message = data?.error ?? data?.message ?? res.statusText ?? 'Request failed';
    throw new Error(message);
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
  const [todayMeals, setTodayMeals] = useState<Meal[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [deliveryType, setDeliveryType] = useState<'pickup' | 'delivery'>('pickup');
  const [zipCode, setZipCode] = useState('');
  const [loadingData, setLoadingData] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    setLoadingData(true);
    try {
      const date = todayIsoDate();
      const [subRaw, menuRows, orderRows] = await Promise.all([
        edgeRequest<Subscription | null>('get-subscription', { token: accessToken }),
        edgeRequest<Array<{ menu_date: string; meals: Meal | null }>>('get-menu', { query: { date } }),
        edgeRequest<Order[]>('get-orders', { token: accessToken }),
      ]);

      if (!mountedRef.current) return;

      setSubscription(subRaw);
      setTodayMeals((menuRows ?? []).map((r) => r.meals).filter((m): m is Meal => Boolean(m)));
      setOrders(orderRows ?? []);
    } catch (err: any) {
      if (!mountedRef.current) return;
      setMessage({ type: 'error', text: err?.message ?? 'Failed to load dashboard' });
    } finally {
      if (mountedRef.current) setLoadingData(false);
    }
  }, [user.id, accessToken]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);

  const totalCartItems = (Object.values(cart) as number[]).reduce((a: number, b: number) => a + b, 0);

  const addToCart = (id: string) => {
    if (subscription && totalCartItems >= subscription.remaining_credits) {
      setMessage({ type: 'error', text: 'No meals left' });
      return;
    }
    setCart((p) => ({ ...p, [id]: ((p[id] as number) || 0) + 1 }));
  };
  const removeFromCart = (id: string) =>
    setCart((p) => {
      const current = (p[id] as number) || 0;
      if (current <= 1) {
        const { [id]: _, ...rest } = p;
        return rest;
      }
      return { ...p, [id]: current - 1 };
    });

  const handleOrder = async () => {
    setMessage(null);

    if (!subscription) {
      setMessage({ type: 'error', text: 'No active subscription' });
      return;
    }

    if (subscription.status !== 'active' && subscription.status !== 'trialing') {
      setMessage({ type: 'error', text: 'Subscription is not active' });
      return;
    }

    if (totalCartItems <= 0) {
      setMessage({ type: 'error', text: 'Cannot submit an empty order' });
      return;
    }

    if (totalCartItems > subscription.remaining_credits) {
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

    const items = Object.entries(cart).map(([mealId, quantity]) => ({ mealId, quantity }));

    setLoading(true);
    try {
      await edgeRequest<{ orderId: string; message: string }>('create-order', {
        token: accessToken,
        body: {
          subscriptionId: subscription.id,
          deliveryType,
          zipCode: deliveryType === 'delivery' ? zipCode.trim() : null,
          items,
        },
      });

      setCart({});
      await refresh();

      setMessage({ type: 'success', text: 'Order placed' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message ?? 'Order failed' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-neutral-900">Welcome back, {user.name}</h1>
          <p className="text-neutral-500 mt-2">What would you like to eat today?</p>
        </div>
        {subscription && (
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Meal Credits</p>
              <p className="text-2xl font-black text-orange-500">{subscription.remaining_credits}</p>
            </div>
            <div className="h-12 w-[1px] bg-neutral-200" />
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Expires</p>
              <p className="text-sm font-bold text-neutral-900">{new Date(subscription.current_period_end).toLocaleDateString()}</p>
            </div>
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
              <h2 className="text-2xl font-bold">Today's Menu</h2>
              <span className="text-xs font-bold text-neutral-400 uppercase tracking-widest">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</span>
            </div>
            <div className="grid gap-6 sm:grid-cols-2">
              {loadingData ? (
                <div className="rounded-[2rem] bg-white p-8 shadow-xl shadow-neutral-200/50 border border-neutral-100 text-neutral-500 font-bold">
                  Loading menu...
                </div>
              ) : todayMeals.length === 0 ? (
                <div className="rounded-[2rem] bg-white p-8 shadow-xl shadow-neutral-200/50 border border-neutral-100 text-neutral-500 font-bold">
                  No menu available for today
                </div>
              ) : todayMeals.map(meal => (
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
            
            {totalCartItems === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-neutral-50 rounded-full flex items-center justify-center mx-auto mb-4 text-neutral-300">
                  <UtensilsCrossed size={32} />
                </div>
                <p className="text-neutral-400 text-sm">Your cart is empty.<br />Add some delicious meals!</p>
              </div>
            ) : (
              <>
                <div className="space-y-4 mb-8">
                  {Object.entries(cart).map(([id, q]) => (
                    <div key={id} className="flex justify-between items-center group">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-neutral-900">{todayMeals.find(m => m.id === id)?.name}</span>
                        <span className="text-[10px] text-neutral-400 uppercase tracking-widest">x{q} Meals</span>
                      </div>
                      <span className="text-sm font-black text-orange-500">{q} Credits</span>
                    </div>
                  ))}
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
                  <span className="text-2xl font-black text-neutral-900">{totalCartItems}</span>
                </div>

                <button 
                  onClick={handleOrder} 
                  disabled={loading} 
                  className="w-full rounded-2xl bg-orange-500 py-5 font-bold text-white shadow-2xl shadow-orange-200 hover:bg-orange-600 hover:-translate-y-1 transition-all disabled:opacity-50 disabled:translate-y-0"
                >
                  {loading ? (
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Processing...
                    </div>
                  ) : 'Confirm Order'}
                </button>
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
  const [selectedMeals, setSelectedMeals] = useState<string[]>([]);
  const [date, setDate] = useState(todayIsoDate());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const [statsData, mealsRes] = await Promise.all([
        edgeRequest<AdminStats>('admin-stats', { token: accessToken }),
        supabase.from('meals').select('id, name, description, category, image_url').eq('is_active', true).order('created_at', { ascending: false }),
      ]);

      if (mealsRes.error) throw new Error(mealsRes.error.message);

      setStats(statsData);
      setMeals((mealsRes.data ?? []) as Meal[]);
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message ?? 'Failed to load admin dashboard' });
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleSaveMenu = async () => {
    if (!date) {
      setMessage({ type: 'error', text: 'Invalid date' });
      return;
    }
    if (selectedMeals.length === 0) {
      setMessage({ type: 'error', text: 'Select at least one meal' });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await edgeRequest('admin-menu', {
        token: accessToken,
        body: { date, mealIds: selectedMeals },
      });
      setMessage({ type: 'success', text: 'Menu saved' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message ?? 'Failed to save menu' });
    } finally {
      setSaving(false);
    }
  };

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

      <section className="rounded-[2.5rem] bg-white p-10 shadow-2xl shadow-neutral-200/50 border border-neutral-100">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-10 gap-6">
          <div>
            <h3 className="text-2xl font-bold text-neutral-900 flex items-center gap-3">
              <Calendar size={24} className="text-orange-500" /> 
              Manage Daily Menu
            </h3>
            <p className="text-neutral-500 text-sm mt-1">Select meals to appear on the menu for a specific date.</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={refresh} className="rounded-2xl border border-neutral-100 bg-neutral-50 px-5 py-4 font-bold text-neutral-700 hover:bg-neutral-100 transition-all">
              Refresh
            </button>
            <input 
            type="date" 
            value={date} 
            onChange={e => setDate(e.target.value)} 
            className="rounded-2xl border border-neutral-100 bg-neutral-50 p-4 focus:bg-white focus:ring-4 focus:ring-orange-500/10 transition-all outline-none font-bold" 
            />
          </div>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 mb-10">
          {loading ? (
            <div className="text-neutral-500 font-bold">Loading meals...</div>
          ) : meals.map(meal => (
            <button 
              key={meal.id} 
              onClick={() => setSelectedMeals(p => p.includes(meal.id) ? p.filter(id => id !== meal.id) : [...p, meal.id])}
              className={`p-6 rounded-3xl border-2 text-left transition-all relative overflow-hidden group ${selectedMeals.includes(meal.id) ? 'border-orange-500 bg-orange-50/50' : 'border-neutral-100 hover:border-neutral-200 bg-white'}`}
            >
              <div className="flex flex-col h-full">
                <span className="text-[10px] font-bold uppercase tracking-widest text-orange-500 mb-2">{meal.category || 'Meal'}</span>
                <div className="font-bold text-neutral-900 text-lg leading-tight">{meal.name}</div>
              </div>
              {selectedMeals.includes(meal.id) && (
                <div className="absolute top-3 right-3 w-6 h-6 bg-orange-500 rounded-full flex items-center justify-center text-white">
                  <CheckCircle2 size={14} />
                </div>
              )}
            </button>
          ))}
        </div>
        
        <div className="flex justify-end">
          <button 
            onClick={handleSaveMenu} 
            disabled={saving}
            className="rounded-2xl bg-neutral-900 px-10 py-5 font-bold text-white shadow-xl shadow-neutral-200 hover:bg-neutral-800 transition-all disabled:opacity-50"
          >
            {saving ? 'Saving...' : `Save Menu for ${new Date(date).toLocaleDateString()}`}
          </button>
        </div>
      </section>
    </div>
  );
};

const KitchenDashboard = ({ accessToken }: { accessToken: string }) => {
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await edgeRequest<KitchenOrder[]>('kitchen-orders', { token: accessToken });
      setOrders(data ?? []);
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message ?? 'Failed to load kitchen orders' });
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, 10_000);
    return () => window.clearInterval(id);
  }, [refresh]);

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
          <p className="text-neutral-500 mt-2">Live order feed for today's preparations.</p>
        </div>
        <div className="px-6 py-3 bg-orange-50 rounded-2xl border border-orange-100">
          <span className="text-sm font-bold text-orange-600">{orders.length} Active Orders</span>
        </div>
      </div>

      <div className="grid gap-6">
        <AnimatePresence>
          {message && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`p-4 rounded-2xl flex items-center gap-3 ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'}`}
            >
              {message.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
              <span className="font-bold text-sm">{message.text}</span>
              <button onClick={() => setMessage(null)} className="ml-auto text-xs font-bold uppercase tracking-widest">Dismiss</button>
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {loading ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-[2.5rem] bg-white p-8 shadow-xl shadow-neutral-200/50 border border-neutral-100 text-neutral-500 font-bold">
              Loading orders...
            </motion.div>
          ) : orders.length === 0 ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-[2.5rem] bg-white p-8 shadow-xl shadow-neutral-200/50 border border-neutral-100 text-neutral-500 font-bold">
              No orders yet
            </motion.div>
          ) : orders.map(order => (
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
          ))}
        </AnimatePresence>
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
      setSession(nextSession);
      loadUserFromSession(nextSession).finally(() => setAuthLoading(false));
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
