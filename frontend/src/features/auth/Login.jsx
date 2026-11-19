// src/features/auth/Login.jsx
import { useState, useEffect, useId } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import { EyeIcon, EyeSlashIcon, BoltIcon, BuildingStorefrontIcon, ShoppingBagIcon } from '@heroicons/react/24/outline';
import GoogleSignInButton from './GoogleSignInButton';

const Login = () => {
  const [formData, setFormData] = useState({ username: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [demoLoadingRole, setDemoLoadingRole] = useState(null);
  const [googleRole, setGoogleRole] = useState('buyer');

  const { login, loginAsDemo, isAuthenticated, user, isSeller } = useAuth();
  const navigate = useNavigate();
  const usernameId = useId();
  const passwordId = useId();

  useEffect(() => {
    if (isAuthenticated && user) {
      navigate(isSeller ? '/seller/dashboard' : '/home', { replace: true });
    }
  }, [isAuthenticated, user, isSeller, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await login({
        username: formData.username.trim(),
        password: formData.password,
      });
      if (!result.success) {
        toast.error(result.error || 'Login failed');
        setLoading(false);
      }
    } catch (error) {
      console.error('Login error:', error);
      toast.error('Login failed. Please try again.');
      setLoading(false);
    }
  };

  const handleDemoLogin = async (role) => {
    setDemoLoadingRole(role);
    try {
      const result = await loginAsDemo(role);
      if (!result?.success) {
        toast.error(result?.error || `Demo ${role} login failed`);
      }
    } finally {
      setDemoLoadingRole(null);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 py-12 px-4">
      <div className="max-w-lg w-full bg-white p-8 rounded-2xl shadow-2xl border border-slate-200 space-y-6">
        <div className="text-center">
          <Link to="/home" className="inline-flex items-center gap-2 mb-3">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white font-bold">
              S
            </span>
            <span className="text-xl font-extrabold text-slate-900">StoreHub</span>
          </Link>
          <h1 className="text-2xl font-extrabold text-slate-900">Sign in to your account</h1>
          <p className="text-sm text-slate-600 mt-1">
            Only Buyer &amp; Seller accounts — zero admin approval delays
          </p>
        </div>

        {/* Google Sign-In for Buyer & Seller */}
        <section
          aria-label="Continue with Google"
          className="rounded-xl bg-white border border-slate-200 p-4 space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Continue with Google
            </span>
            <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-xs font-bold">
              <button
                type="button"
                onClick={() => setGoogleRole('buyer')}
                className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                  googleRole === 'buyer'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                🛍️ Buyer
              </button>
              <button
                type="button"
                onClick={() => setGoogleRole('seller')}
                className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                  googleRole === 'seller'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                🏪 Seller
              </button>
            </div>
          </div>
          <GoogleSignInButton
            role={googleRole}
            mode="login"
            onAuthenticated={(res) => navigate(res.isSeller ? '/seller/dashboard' : '/home', { replace: true })}
          />
        </section>

        {/* 1-Click Demo Accounts Panel */}
        <section
          aria-labelledby="demo-accounts-heading"
          className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-3"
        >
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700">
            <BoltIcon className="h-4 w-4 text-amber-500" aria-hidden="true" />
            <h2 id="demo-accounts-heading">1-Click Demo Accounts (Buyer &amp; Seller)</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-lg bg-white border border-blue-200 p-3 flex flex-col justify-between gap-2">
              <div>
                <div className="flex items-center gap-1.5 text-sm font-bold text-blue-700">
                  <ShoppingBagIcon className="h-4 w-4" aria-hidden="true" />
                  <span>Demo Buyer</span>
                </div>
                <p className="text-xs text-slate-600 mt-1 font-mono">
                  demo_buyer / Demo@12345
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleDemoLogin('buyer')}
                disabled={demoLoadingRole !== null || loading}
                className="w-full min-h-[40px] py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors disabled:opacity-50"
              >
                {demoLoadingRole === 'buyer' ? 'Signing in...' : 'Launch Demo Buyer'}
              </button>
            </div>

            <div className="rounded-lg bg-white border border-indigo-200 p-3 flex flex-col justify-between gap-2">
              <div>
                <div className="flex items-center gap-1.5 text-sm font-bold text-indigo-700">
                  <BuildingStorefrontIcon className="h-4 w-4" aria-hidden="true" />
                  <span>Demo Seller</span>
                </div>
                <p className="text-xs text-slate-600 mt-1 font-mono">
                  demo_seller / Demo@12345
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleDemoLogin('seller')}
                disabled={demoLoadingRole !== null || loading}
                className="w-full min-h-[40px] py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors disabled:opacity-50"
              >
                {demoLoadingRole === 'seller' ? 'Signing in...' : 'Launch Demo Seller'}
              </button>
            </div>
          </div>
        </section>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor={usernameId} className="block text-sm font-semibold text-slate-700 mb-1">
              Username
            </label>
            <input
              id={usernameId}
              name="username"
              type="text"
              required
              autoComplete="username"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              enterKeyHint="next"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              className="w-full min-h-[44px] px-3.5 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="e.g. demo_buyer or demo_seller"
            />
          </div>

          <div>
            <label htmlFor={passwordId} className="block text-sm font-semibold text-slate-700 mb-1">
              Password
            </label>
            <div className="relative">
              <input
                id={passwordId}
                name="password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                enterKeyHint="done"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full min-h-[44px] px-3.5 py-2 pr-11 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter your password"
              />
              <button
                type="button"
                aria-pressed={showPassword}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-2 top-1.5 p-2 text-slate-500 hover:text-slate-800 rounded-md"
              >
                {showPassword ? (
                  <EyeSlashIcon className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <EyeIcon className="h-5 w-5" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || demoLoadingRole !== null}
            className="w-full min-h-[46px] flex justify-center items-center py-2.5 px-4 rounded-xl shadow-sm text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900 disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>

          <p className="text-center text-sm text-slate-600 pt-1">
            New to StoreHub?{' '}
            <Link to="/register" className="font-semibold text-blue-600 hover:text-blue-700">
              Create a Buyer or Seller account
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
};

export default Login;
