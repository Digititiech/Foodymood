import React from 'react';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { 
  Check, 
  ChevronRight, 
  Truck, 
  MapPin, 
  Clock, 
  Star, 
  ShieldCheck, 
  Zap, 
  Calendar, 
  BarChart3,
  Instagram,
  Twitter,
  Facebook,
  UtensilsCrossed
} from 'lucide-react';

const fadeIn = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { duration: 0.6 }
};

const staggerContainer = {
  initial: {},
  whileInView: {
    transition: {
      staggerChildren: 0.1
    }
  },
  viewport: { once: true }
};

const LandingPage = () => {
  return (
    <div className="bg-white selection:bg-orange-100 selection:text-orange-900">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-b border-neutral-100">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center text-white shadow-lg shadow-orange-200">
              <UtensilsCrossed size={24} />
            </div>
            <span className="text-xl font-bold tracking-tight text-neutral-900">FoodyMood</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-neutral-600">
            <a href="#how-it-works" className="hover:text-orange-500 transition-colors">How it Works</a>
            <a href="#plans" className="hover:text-orange-500 transition-colors">Plans</a>
            <a href="#menu" className="hover:text-orange-500 transition-colors">Menu</a>
            <a href="#benefits" className="hover:text-orange-500 transition-colors">Benefits</a>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/login" className="text-sm font-semibold text-neutral-900 px-4 py-2">
              Log in
            </Link>
            <Link to="/signup" className="bg-neutral-900 text-white text-sm font-semibold px-6 py-2.5 rounded-full hover:bg-neutral-800 transition-all shadow-lg shadow-neutral-200">
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-40 pb-24 px-6 relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full -z-10">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-orange-100/50 blur-[120px] rounded-full" />
          <div className="absolute bottom-[10%] right-[-10%] w-[30%] h-[30%] bg-orange-50/50 blur-[100px] rounded-full" />
        </div>
        
        <div className="max-w-7xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <span className="inline-block px-4 py-1.5 bg-orange-50 text-orange-600 rounded-full text-xs font-bold tracking-widest uppercase mb-6">
              The Future of Meal Prep
            </span>
            <h1 className="text-6xl md:text-8xl font-extrabold tracking-tight text-neutral-900 mb-8 leading-[0.9]">
              Eat Smart.<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-orange-600">Live Better.</span>
            </h1>
            <p className="max-w-2xl mx-auto text-lg md:text-xl text-neutral-500 mb-12 leading-relaxed">
              Flexible meal subscriptions with daily fresh menus — choose what you love, when you want. No more grocery stress, just pure nutrition.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link to="/signup" className="w-full sm:w-auto bg-orange-500 text-white px-10 py-5 rounded-2xl text-lg font-bold shadow-2xl shadow-orange-200 hover:bg-orange-600 hover:-translate-y-1 transition-all text-center">
                Start Your Plan
              </Link>
              <a href="#menu" className="w-full sm:w-auto bg-white text-neutral-900 border border-neutral-200 px-10 py-5 rounded-2xl text-lg font-bold hover:bg-neutral-50 transition-all text-center">
                View Menu
              </a>
            </div>
          </motion.div>

          {/* Hero Visual */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, delay: 0.2 }}
            className="mt-24 relative max-w-5xl mx-auto"
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { id: 'h1', name: 'Zesty Salmon', cat: 'Keto', img: 'https://picsum.photos/seed/salmon/800/600' },
                { id: 'h2', name: 'Avocado Bowl', cat: 'Vegan', img: 'https://picsum.photos/seed/avocado/800/600' },
                { id: 'h3', name: 'Steak & Greens', cat: 'Protein', img: 'https://picsum.photos/seed/steak/800/600' }
              ].map((item, i) => (
                <motion.div
                  key={item.id}
                  whileHover={{ y: -10 }}
                  className={`rounded-[2.5rem] overflow-hidden bg-white shadow-2xl shadow-neutral-200/50 border border-neutral-100 ${i === 1 ? 'md:-translate-y-8' : ''}`}
                >
                  <img src={item.img} alt={item.name} className="w-full aspect-[4/5] object-cover" referrerPolicy="no-referrer" />
                  <div className="p-6 text-left">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-orange-500">{item.cat}</span>
                    <h3 className="text-xl font-bold text-neutral-900 mt-1">{item.name}</h3>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-32 px-6 bg-neutral-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20">
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-neutral-900 mb-4">How It Works</h2>
            <p className="text-neutral-500 max-w-xl mx-auto">Three simple steps to a healthier, easier lifestyle.</p>
          </div>
          
          <motion.div 
            variants={staggerContainer}
            initial="initial"
            whileInView="whileInView"
            viewport={{ once: true }}
            className="grid grid-cols-1 md:grid-cols-3 gap-12"
          >
            {[
              { icon: <Calendar className="text-orange-500" size={32} />, title: 'Subscribe', desc: 'Choose a meal plan that fits your lifestyle and nutritional goals.' },
              { icon: <UtensilsCrossed className="text-orange-500" size={32} />, title: 'Pick Your Meals', desc: 'New menu every day — full flexibility to choose what you crave.' },
              { icon: <Truck className="text-orange-500" size={32} />, title: 'Enjoy', desc: 'Pickup or get it delivered to your door. Fresh and ready to eat.' }
            ].map((step, i) => (
              <motion.div key={i} variants={fadeIn} className="relative group">
                <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center shadow-xl shadow-neutral-200 mb-8 group-hover:scale-110 transition-transform">
                  {step.icon}
                </div>
                <h3 className="text-2xl font-bold text-neutral-900 mb-4">{step.title}</h3>
                <p className="text-neutral-500 leading-relaxed">{step.desc}</p>
                {i < 2 && <div className="hidden md:block absolute top-10 -right-6 w-12 h-[2px] bg-neutral-200" />}
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Subscription Plans */}
      <section id="plans" className="py-32 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20">
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-neutral-900 mb-4">Flexible Plans</h2>
            <p className="text-neutral-500 max-w-xl mx-auto">Predictable pricing for your daily nutrition. Cancel or pause anytime.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { name: 'Starter', meals: 30, price: 299, popular: false },
              { name: 'Daily Pro', meals: 60, price: 549, popular: true },
              { name: 'Elite', meals: 120, price: 999, popular: false }
            ].map((plan, i) => (
              <motion.div
                key={i}
                whileHover={{ y: -10 }}
                className={`p-10 rounded-[2.5rem] border-2 transition-all ${plan.popular ? 'border-orange-500 bg-orange-50/30 ring-4 ring-orange-500/10' : 'border-neutral-100 bg-white'}`}
              >
                {plan.popular && (
                  <span className="inline-block px-4 py-1 bg-orange-500 text-white text-[10px] font-bold uppercase tracking-widest rounded-full mb-6">
                    Most Popular
                  </span>
                )}
                <h3 className="text-2xl font-bold text-neutral-900 mb-2">{plan.name}</h3>
                <div className="flex items-baseline gap-1 mb-6">
                  <span className="text-4xl font-extrabold text-neutral-900">${plan.price}</span>
                  <span className="text-neutral-400 font-medium">/month</span>
                </div>
                <ul className="space-y-4 mb-10">
                  <li className="flex items-center gap-3 text-sm text-neutral-600">
                    <Check size={18} className="text-orange-500" /> {plan.meals} Meals per cycle
                  </li>
                  <li className="flex items-center gap-3 text-sm text-neutral-600">
                    <Check size={18} className="text-orange-500" /> 30 Days validity
                  </li>
                  <li className="flex items-center gap-3 text-sm text-neutral-600">
                    <Check size={18} className="text-orange-500" /> Daily menu access
                  </li>
                  <li className="flex items-center gap-3 text-sm text-neutral-600">
                    <Check size={18} className="text-orange-500" /> Flexible delivery
                  </li>
                </ul>
                <button className={`w-full py-4 rounded-2xl font-bold transition-all ${plan.popular ? 'bg-orange-500 text-white shadow-xl shadow-orange-200 hover:bg-orange-600' : 'bg-neutral-900 text-white hover:bg-neutral-800'}`}>
                  Subscribe
                </button>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Daily Menu Preview */}
      <section id="menu" className="py-32 px-6 bg-neutral-900 text-white overflow-hidden relative">
        <div className="absolute top-0 right-0 w-1/2 h-full bg-orange-500/10 blur-[120px] -z-0" />
        
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-20 gap-8">
            <div>
              <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">Daily Fresh Menu</h2>
              <p className="text-neutral-400 max-w-xl">Curated by top chefs, updated every 24 hours. Never get bored with your food.</p>
            </div>
            <button className="flex items-center gap-2 text-orange-400 font-bold hover:gap-4 transition-all">
              View Full Menu <ChevronRight size={20} />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { name: 'Truffle Pasta', cat: 'Vegetarian', img: 'https://picsum.photos/seed/pasta/600/800' },
              { name: 'Lemon Chicken', cat: 'High Protein', img: 'https://picsum.photos/seed/chicken/600/800' },
              { name: 'Poke Bowl', cat: 'Fresh', img: 'https://picsum.photos/seed/poke/600/800' },
              { name: 'Greek Salad', cat: 'Vegan', img: 'https://picsum.photos/seed/salad/600/800' }
            ].map((meal, i) => (
              <motion.div
                key={i}
                whileHover={{ scale: 1.02 }}
                className="group relative rounded-3xl overflow-hidden aspect-[3/4]"
              >
                <img src={meal.img} alt={meal.name} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" referrerPolicy="no-referrer" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent p-8 flex flex-col justify-end">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-orange-400 mb-2">{meal.cat}</span>
                  <h3 className="text-2xl font-bold">{meal.name}</h3>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Delivery Section */}
      <section className="py-32 px-6">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
          <motion.div variants={fadeIn} initial="initial" whileInView="whileInView" viewport={{ once: true }}>
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-neutral-900 mb-8 leading-tight">
              Delivery or Pickup — <br />
              <span className="text-orange-500">Your Choice.</span>
            </h2>
            <div className="space-y-8">
              <div className="flex gap-6">
                <div className="w-14 h-14 bg-orange-50 rounded-2xl flex items-center justify-center text-orange-500 shrink-0">
                  <MapPin size={28} />
                </div>
                <div>
                  <h4 className="text-xl font-bold text-neutral-900 mb-2">Smart ZIP Tracking</h4>
                  <p className="text-neutral-500">Delivery fees are calculated instantly based on your ZIP code. Transparent pricing, no surprises.</p>
                </div>
              </div>
              <div className="flex gap-6">
                <div className="w-14 h-14 bg-orange-50 rounded-2xl flex items-center justify-center text-orange-500 shrink-0">
                  <Truck size={28} />
                </div>
                <div>
                  <h4 className="text-xl font-bold text-neutral-900 mb-2">Flexible Logistics</h4>
                  <p className="text-neutral-500">Choose home delivery or pick up from our local hubs. Full control over your schedule.</p>
                </div>
              </div>
            </div>
          </motion.div>
          <div className="relative">
            <div className="absolute inset-0 bg-orange-200/20 blur-[80px] rounded-full" />
            <img 
              src="https://picsum.photos/seed/delivery/1000/1000" 
              alt="Delivery" 
              className="relative rounded-[3rem] shadow-2xl shadow-neutral-200 border border-neutral-100"
              referrerPolicy="no-referrer"
            />
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section id="benefits" className="py-32 px-6 bg-neutral-50">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              { icon: <Zap />, title: 'Flexible Plans', desc: 'Pause or cancel your subscription anytime with one click.' },
              { icon: <Clock />, title: 'Fresh Daily', desc: 'Ingredients sourced every morning for peak nutritional value.' },
              { icon: <ShieldCheck />, title: 'No Commitment', desc: 'Try for a week, stay for the results. No long-term contracts.' },
              { icon: <BarChart3 />, title: 'Smart Tracking', desc: 'Track your macros and remaining meals in real-time.' }
            ].map((benefit, i) => (
              <div key={i} className="p-8 rounded-3xl bg-white shadow-sm border border-neutral-100 hover:shadow-md transition-all">
                <div className="text-orange-500 mb-6">{benefit.icon}</div>
                <h4 className="text-lg font-bold text-neutral-900 mb-2">{benefit.title}</h4>
                <p className="text-sm text-neutral-500 leading-relaxed">{benefit.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Dashboard Preview */}
      <section className="py-32 px-6 overflow-hidden">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20">
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-neutral-900 mb-4">Your Smart Dashboard</h2>
            <p className="text-neutral-500 max-w-xl mx-auto">Manage your entire nutrition ecosystem from a single, intuitive interface.</p>
          </div>
          
          <motion.div 
            initial={{ opacity: 0, y: 100 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 1 }}
            viewport={{ once: true }}
            className="relative max-w-5xl mx-auto rounded-[3rem] bg-white shadow-[0_50px_100px_-20px_rgba(0,0,0,0.1)] border border-neutral-100 overflow-hidden"
          >
            <div className="bg-neutral-50 border-b border-neutral-100 p-6 flex items-center gap-4">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-400" />
                <div className="w-3 h-3 rounded-full bg-yellow-400" />
                <div className="w-3 h-3 rounded-full bg-green-400" />
              </div>
              <div className="bg-white rounded-lg px-4 py-1.5 text-xs text-neutral-400 border border-neutral-200 w-full max-w-xs">
                app.foodymood.com/dashboard
              </div>
            </div>
            <div className="p-10 grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="space-y-6">
                <div className="p-6 rounded-2xl bg-orange-50 border border-orange-100">
                  <span className="text-xs font-bold text-orange-600 uppercase tracking-widest">Remaining Meals</span>
                  <div className="text-4xl font-black text-orange-900 mt-2">42</div>
                </div>
                <div className="p-6 rounded-2xl bg-neutral-50 border border-neutral-100">
                  <span className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Next Delivery</span>
                  <div className="text-xl font-bold text-neutral-900 mt-2">Tomorrow, 10:00 AM</div>
                </div>
              </div>
              <div className="md:col-span-2 p-8 rounded-3xl bg-neutral-900 text-white">
                <div className="flex justify-between items-center mb-8">
                  <h4 className="font-bold">Today's Selection</h4>
                  <button className="text-xs bg-white/10 px-3 py-1.5 rounded-full">Change</button>
                </div>
                <div className="flex gap-6 items-center">
                  <img src="https://picsum.photos/seed/meal/200/200" className="w-24 h-24 rounded-2xl object-cover" referrerPolicy="no-referrer" />
                  <div>
                    <h5 className="text-lg font-bold">Miso Glazed Cod</h5>
                    <p className="text-sm text-neutral-400">High Protein • 450 kcal</p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-32 px-6 bg-neutral-50">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { name: 'Sarah J.', role: 'Fitness Coach', text: 'FoodyMood changed my life. I save 10 hours a week on meal prep and the food is actually delicious.' },
              { name: 'Mark T.', role: 'Software Engineer', text: 'The flexibility is key. I can pause when I travel and the delivery is always on time. Highly recommend.' },
              { name: 'Elena R.', role: 'Busy Mom', text: 'Finally a healthy option that my whole family loves. The daily menu variety is incredible.' }
            ].map((t, i) => (
              <div key={i} className="p-10 rounded-[2.5rem] bg-white shadow-sm border border-neutral-100">
                <div className="flex gap-1 mb-6">
                  {[...Array(5)].map((_, i) => <Star key={i} size={16} className="fill-orange-500 text-orange-500" />)}
                </div>
                <p className="text-lg text-neutral-700 italic mb-8 leading-relaxed">"{t.text}"</p>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-neutral-200" />
                  <div>
                    <h5 className="font-bold text-neutral-900">{t.name}</h5>
                    <p className="text-xs text-neutral-500">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-32 px-6">
        <div className="max-w-5xl mx-auto rounded-[3rem] bg-gradient-to-br from-orange-500 to-orange-600 p-12 md:p-24 text-center text-white shadow-2xl shadow-orange-200 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10" />
          <motion.div variants={fadeIn} initial="initial" whileInView="whileInView" viewport={{ once: true }} className="relative z-10">
            <h2 className="text-4xl md:text-6xl font-extrabold tracking-tight mb-8">Start Eating Better Today</h2>
            <p className="text-orange-100 text-lg md:text-xl max-w-2xl mx-auto mb-12">
              Join 10,000+ happy subscribers and transform your relationship with food. Your first meal is on us.
            </p>
            <button className="bg-white text-orange-600 px-12 py-6 rounded-2xl text-xl font-black shadow-xl hover:scale-105 transition-all">
              Get Started Now
            </button>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-20 px-6 border-t border-neutral-100">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-20">
            <div className="col-span-1 md:col-span-1">
              <div className="flex items-center gap-2 mb-6">
                <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center text-white">
                  <UtensilsCrossed size={18} />
                </div>
                <span className="text-lg font-bold tracking-tight text-neutral-900">FoodyMood</span>
              </div>
              <p className="text-sm text-neutral-500 leading-relaxed">
                Premium meal subscriptions for the modern lifestyle. Fresh, flexible, and delivered to your door.
              </p>
            </div>
            <div>
              <h5 className="font-bold text-neutral-900 mb-6">Product</h5>
              <ul className="space-y-4 text-sm text-neutral-500">
                <li><a href="#" className="hover:text-orange-500">Menu</a></li>
                <li><a href="#" className="hover:text-orange-500">Plans</a></li>
                <li><a href="#" className="hover:text-orange-500">Delivery</a></li>
              </ul>
            </div>
            <div>
              <h5 className="font-bold text-neutral-900 mb-6">Company</h5>
              <ul className="space-y-4 text-sm text-neutral-500">
                <li><a href="#" className="hover:text-orange-500">About Us</a></li>
                <li><a href="#" className="hover:text-orange-500">Careers</a></li>
                <li><a href="#" className="hover:text-orange-500">Contact</a></li>
              </ul>
            </div>
            <div>
              <h5 className="font-bold text-neutral-900 mb-6">Follow Us</h5>
              <div className="flex gap-4">
                <a href="#" className="w-10 h-10 rounded-full bg-neutral-50 flex items-center justify-center text-neutral-400 hover:bg-orange-50 hover:text-orange-500 transition-all"><Instagram size={18} /></a>
                <a href="#" className="w-10 h-10 rounded-full bg-neutral-50 flex items-center justify-center text-neutral-400 hover:bg-orange-50 hover:text-orange-500 transition-all"><Twitter size={18} /></a>
                <a href="#" className="w-10 h-10 rounded-full bg-neutral-50 flex items-center justify-center text-neutral-400 hover:bg-orange-50 hover:text-orange-500 transition-all"><Facebook size={18} /></a>
              </div>
            </div>
          </div>
          <div className="flex flex-col md:flex-row justify-between items-center gap-6 pt-12 border-t border-neutral-50 text-xs text-neutral-400 font-medium">
            <p>© 2026 FoodyMood Inc. All rights reserved.</p>
            <div className="flex gap-8">
              <a href="#" className="hover:text-neutral-900">Privacy Policy</a>
              <a href="#" className="hover:text-neutral-900">Terms of Service</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
