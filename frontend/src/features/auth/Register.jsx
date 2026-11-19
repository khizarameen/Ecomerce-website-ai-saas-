// src/features/auth/Register.jsx
import { useState, useId } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import GoogleSignInButton from './GoogleSignInButton';

const Register = () => {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    password_confirm: '',
    first_name: '',
    last_name: '',
    user_type: 'buyer',
  });

  const baseId = useId();

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.password !== formData.password_confirm) {
      toast.error('Passwords do not match');
      return;
    }
    if (formData.password.length < 8) {
      toast.error('Password must be at least 8 characters long');
      return;
    }

    setLoading(true);
    try {
      const result = await register({
        username: formData.username.trim(),
        email: formData.email.trim(),
        password: formData.password,
        password_confirm: formData.password_confirm,
        first_name: formData.first_name.trim(),
        last_name: formData.last_name.trim(),
        user_type: formData.user_type,
      });

      if (result.success) {
        if (result.requiresLogin) {
          toast.success('Registration successful! Please login.');
          navigate('/login');
        } else {
          navigate(result.isSeller ? '/seller/dashboard' : '/home');
        }
      } else {
        toast.error(result.error || 'Registration failed');
      }
    } catch (error) {
      console.error('Registration error:', error);
      toast.error(error.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 py-10 px-4">
      <div className="max-w-lg w-full bg-white p-8 rounded-2xl shadow-2xl border border-slate-200 space-y-6">
        <div className="text-center">
          <Link to="/home" className="inline-flex items-center gap-2 mb-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white font-bold">
              S
            </span>
            <span className="text-xl font-extrabold text-slate-900">StoreHub</span>
          </Link>
          <h1 className="text-2xl font-extrabold text-slate-900">Create your account</h1>
          <p className="mt-1 text-sm text-slate-600">
            Already registered?{' '}
            <Link to="/login" className="font-semibold text-blue-600 hover:text-blue-700">
              Sign in or launch demo accounts
            </Link>
          </p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          {/* 2-Role Visual Radio Toggle (Buyer vs Seller, instant activation) */}
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-slate-700">Choose Account Type</legend>
            <div className="grid grid-cols-2 gap-3">
              <label
                htmlFor={`${baseId}-role-buyer`}
                className={`cursor-pointer rounded-xl border-2 p-3 transition-all ${
                  formData.user_type === 'buyer'
                    ? 'border-blue-600 bg-blue-50 text-blue-900'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                }`}
              >
                <input
                  id={`${baseId}-role-buyer`}
                  type="radio"
                  name="user_type"
                  value="buyer"
                  checked={formData.user_type === 'buyer'}
                  onChange={handleChange}
                  className="sr-only"
                />
                <span className="block text-sm font-bold">🛍️ Buyer Account</span>
                <span className="block text-xs text-slate-600 mt-0.5">
                  Shop catalog, AI Search &amp; Cart
                </span>
              </label>

              <label
                htmlFor={`${baseId}-role-seller`}
                className={`cursor-pointer rounded-xl border-2 p-3 transition-all ${
                  formData.user_type === 'seller'
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-900'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                }`}
              >
                <input
                  id={`${baseId}-role-seller`}
                  type="radio"
                  name="user_type"
                  value="seller"
                  checked={formData.user_type === 'seller'}
                  onChange={handleChange}
                  className="sr-only"
                />
                <span className="block text-sm font-bold">🏪 Seller Store</span>
                <span className="block text-xs text-slate-600 mt-0.5">
                  Instant store activation
                </span>
              </label>
            </div>
          </fieldset>

          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5 space-y-2">
            <p className="text-xs font-bold text-center text-slate-700">
              Or instant sign up with Google as{' '}
              <span className="text-indigo-700 uppercase">{formData.user_type}</span>:
            </p>
            <GoogleSignInButton
              role={formData.user_type}
              mode="register"
              onAuthenticated={(res) => navigate(res.isSeller ? '/seller/dashboard' : '/home')}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor={`${baseId}-fname`} className="block text-xs font-semibold text-slate-700 mb-1">
                First Name
              </label>
              <input
                id={`${baseId}-fname`}
                type="text"
                name="first_name"
                autoComplete="given-name"
                value={formData.first_name}
                onChange={handleChange}
                className="w-full min-h-[42px] px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="First name"
              />
            </div>
            <div>
              <label htmlFor={`${baseId}-lname`} className="block text-xs font-semibold text-slate-700 mb-1">
                Last Name
              </label>
              <input
                id={`${baseId}-lname`}
                type="text"
                name="last_name"
                autoComplete="family-name"
                value={formData.last_name}
                onChange={handleChange}
                className="w-full min-h-[42px] px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Last name"
              />
            </div>
          </div>

          <div>
            <label htmlFor={`${baseId}-username`} className="block text-xs font-semibold text-slate-700 mb-1">
              Username <span aria-hidden="true" className="text-rose-600">*</span>
            </label>
            <input
              id={`${baseId}-username`}
              type="text"
              name="username"
              autoComplete="username"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              required
              value={formData.username}
              onChange={handleChange}
              className="w-full min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Choose a unique username"
            />
          </div>

          <div>
            <label htmlFor={`${baseId}-email`} className="block text-xs font-semibold text-slate-700 mb-1">
              Email Address <span aria-hidden="true" className="text-rose-600">*</span>
            </label>
            <input
              id={`${baseId}-email`}
              type="email"
              name="email"
              autoComplete="email"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              required
              value={formData.email}
              onChange={handleChange}
              className="w-full min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label htmlFor={`${baseId}-pw`} className="block text-xs font-semibold text-slate-700 mb-1">
              Password <span aria-hidden="true" className="text-rose-600">*</span>
            </label>
            <span id={`${baseId}-pw-hint`} className="block text-[11px] text-slate-500 mb-1">
              At least 8 characters
            </span>
            <div className="relative">
              <input
                id={`${baseId}-pw`}
                type={showPassword ? 'text' : 'password'}
                name="password"
                autoComplete="new-password"
                aria-describedby={`${baseId}-pw-hint`}
                minLength={8}
                required
                value={formData.password}
                onChange={handleChange}
                className="w-full min-h-[44px] px-3 py-2 pr-10 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Min 8 characters"
              />
              <button
                type="button"
                aria-pressed={showPassword}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-2 top-1.5 p-2 text-slate-500 hover:text-slate-800 rounded-md"
              >
                {showPassword ? (
                  <EyeSlashIcon className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <EyeIcon className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor={`${baseId}-pw2`} className="block text-xs font-semibold text-slate-700 mb-1">
              Confirm Password <span aria-hidden="true" className="text-rose-600">*</span>
            </label>
            <input
              id={`${baseId}-pw2`}
              type={showPassword ? 'text' : 'password'}
              name="password_confirm"
              autoComplete="new-password"
              required
              value={formData.password_confirm}
              onChange={handleChange}
              className="w-full min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Re-enter password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full min-h-[46px] flex justify-center items-center py-2.5 px-4 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {loading
              ? 'Creating account...'
              : formData.user_type === 'seller'
              ? 'Create Instant Seller Store'
              : 'Create Buyer Account'}
          </button>
        </form>
      </div>
    </main>
  );
};

export default Register;
