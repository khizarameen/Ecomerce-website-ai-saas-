// src/context/AuthContext.jsx
import { createContext, useCallback, useContext, useState, useEffect } from 'react';
import { authAPI } from '../utils/api';
import toast from 'react-hot-toast';

const AuthContext = createContext();

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

const DEMO_ACCOUNTS = {
  buyer: { username: 'demo_buyer', password: import.meta.env.VITE_DEMO_PASSWORD || 'Demo@12345' },
  seller: { username: 'demo_seller', password: import.meta.env.VITE_DEMO_PASSWORD || 'Demo@12345' },
};

const normalizeUserWithRole = (rawUser) => {
  const isUserSeller =
    rawUser?.role === 'seller' ||
    rawUser?.role === 'Seller' ||
    rawUser?.is_seller === true ||
    rawUser?.user_type === 'seller' ||
    rawUser?.is_seller === 'true';

  return {
    ...rawUser,
    role: isUserSeller ? 'seller' : 'buyer',
    user_type: isUserSeller ? 'seller' : 'buyer',
    is_seller: isUserSeller,
    is_buyer: !isUserSeller,
    is_approved: true,
    is_pending: false,
    approval_status: 'approved',
  };
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isSeller, setIsSeller] = useState(false);
  const [isPending, setIsPending] = useState(false);

  // ✅ REGISTER FUNCTION
  const register = async (userData) => {
    try {
      console.log('📝 Registering with:', userData);
      
      const response = await authAPI.register(userData);
      
      console.log('📝 Registration Response:', response);
      console.log('📝 Response Data:', response.data);
      
      const data = response.data;
      
      // Check if registration was successful
      if (!data.success) {
        return {
          success: false,
          error: data.message || data.error || 'Registration failed'
        };
      }
      
      // ✅ Extract tokens and user data
      const nestedTokens = data.tokens || data.data || {};
      const tokenObj = typeof data.token === 'object' && data.token !== null ? data.token : null;
      let accessToken =
        data.access ||
        nestedTokens.access ||
        (typeof data.token === 'string' ? data.token : tokenObj?.access) ||
        data.access_token ||
        data.accessToken ||
        data.auth_token ||
        data.jwt ||
        data.key ||
        data.user?.token ||
        null;
      const refreshToken =
        data.refresh ||
        nestedTokens.refresh ||
        data.refresh_token ||
        tokenObj?.refresh ||
        data.user?.refresh_token ||
        null;
      const userInfo = data.user || data.data?.user || data.profile || data.user_data || data;
      
      console.log('🔍 Extracted:', { 
        accessToken: !!accessToken, 
        refreshToken: !!refreshToken, 
        userInfo: !!userInfo
      });
      
      // ✅ Store tokens if found
      if (accessToken) {
        localStorage.setItem('access_token', accessToken);
        localStorage.setItem('accessToken', accessToken);
        console.log('✅ Access token stored');
      }
      
      if (refreshToken) {
        localStorage.setItem('refresh_token', refreshToken);
        localStorage.setItem('refreshToken', refreshToken);
      }
      
      // ✅ If we have user data and token, set the user (only buyer & seller roles; instant activation)
      if (userInfo && accessToken) {
        const userWithRole = normalizeUserWithRole(userInfo);
        localStorage.setItem('user', JSON.stringify(userWithRole));

        setUser(userWithRole);
        setIsAuthenticated(true);
        setIsSeller(userWithRole.is_seller);
        setIsPending(false);

        toast.success('Registration successful! Welcome!');

        return {
          success: true,
          user: userWithRole,
          isSeller: userWithRole.is_seller,
          isPending: false,
        };
      } else {
        // Registration successful but no auto-login
        toast.success('Registration successful! Please login.');
        return {
          success: true,
          message: 'Registration successful! Please login.',
          requiresLogin: true
        };
      }
      
    } catch (error) {
      console.error('❌ Registration error:', error);
      console.error('❌ Error response:', error.response?.data);
      
      // Handle validation errors
      if (error.response?.data) {
        const errorData = error.response.data;
        
        if (typeof errorData === 'object') {
          const errorMessages = [];
          for (const [field, messages] of Object.entries(errorData)) {
            if (Array.isArray(messages)) {
              errorMessages.push(`${field}: ${messages.join(', ')}`);
            } else if (typeof messages === 'string') {
              errorMessages.push(`${field}: ${messages}`);
            } else if (typeof messages === 'object' && messages !== null) {
              for (const [subField, subMessages] of Object.entries(messages)) {
                if (Array.isArray(subMessages)) {
                  errorMessages.push(`${field}.${subField}: ${subMessages.join(', ')}`);
                }
              }
            }
          }
          const errorMessage = errorMessages.join('; ') || 'Registration failed';
          toast.error(errorMessage);
          return {
            success: false,
            error: errorMessage,
            fieldErrors: errorData
          };
        }
      }
      
      const errorMessage = error.response?.data?.message || 
                          error.response?.data?.error || 
                          error.response?.data?.detail ||
                          error.message || 
                          'Registration failed';
      
      toast.error(errorMessage);
      return {
        success: false,
        error: errorMessage
      };
    }
  };

  // ✅ LOGIN FUNCTION - Simplified
  const login = async (credentials) => {
    try {
      console.log('🔍 Attempting login with:', credentials.username);
      
      const response = await authAPI.login(credentials);
      
      console.log('🔍 Full Response:', response);
      console.log('🔍 Response Data:', response.data);
      
      const data = response.data;
      
      // Check if login was successful
      if (!data.success) {
        return {
          success: false,
          error: data.message || data.error || 'Login failed'
        };
      }
      
      // Extract tokens and user data
      let accessToken = data.access || data.token || data.access_token;
      let refreshToken = data.refresh || data.refresh_token || null;
      let userData = data.user || data.data?.user || data;
      
      // If still no token, check in nested objects
      if (!accessToken) {
        for (const key of Object.keys(data)) {
          if (typeof data[key] === 'object' && data[key] !== null) {
            const nested = data[key];
            if (nested.access || nested.token || nested.access_token) {
              accessToken = nested.access || nested.token || nested.access_token;
              refreshToken = nested.refresh || nested.refresh_token || null;
              userData = nested.user || data.user || nested;
              break;
            }
          }
        }
      }
      
      console.log('🔍 Extracted:', { 
        accessToken: !!accessToken, 
        refreshToken: !!refreshToken, 
        userData: !!userData
      });
      
      // ✅ Store tokens if found
      if (accessToken) {
        localStorage.setItem('access_token', accessToken);
        localStorage.setItem('accessToken', accessToken);
        console.log('✅ Access token stored');
      } else {
        console.error('❌ No access token found in response!');
        return {
          success: false,
          error: 'No access token received from server.'
        };
      }
      
      if (refreshToken) {
        localStorage.setItem('refresh_token', refreshToken);
        localStorage.setItem('refreshToken', refreshToken);
      }
      
      // ✅ Check user data
      if (!userData || !userData.id) {
        console.error('❌ No user data found in response!');
        return {
          success: false,
          error: 'No user data received from server'
        };
      }
      
      // ✅ Normalize user role (only buyer & seller; no pending/admin gate)
      const userWithRole = normalizeUserWithRole(userData);
      localStorage.setItem('user', JSON.stringify(userWithRole));

      setUser(userWithRole);
      setIsAuthenticated(true);
      setIsSeller(userWithRole.is_seller);
      setIsPending(false);

      toast.success('Login successful! Welcome back!');

      return {
        success: true,
        user: userWithRole,
        isSeller: userWithRole.is_seller,
        isPending: false,
      };
      
    } catch (error) {
      console.error('❌ Login error:', error);
      console.error('❌ Error response:', error.response?.data);
      
      // Clear any partial data
      localStorage.removeItem('access_token');
      localStorage.removeItem('user');
      
      const errorMessage = error.response?.data?.message || 
                          error.response?.data?.error || 
                          error.response?.data?.detail ||
                          error.message || 
                          'Login failed';
      
      toast.error(errorMessage);
      
      return {
        success: false,
        error: errorMessage
      };
    }
  };

  // Load user from localStorage
  useEffect(() => {
    const loadUser = () => {
      try {
        console.log('🔍 Loading user from localStorage...');
        
        const token = localStorage.getItem('access_token') || localStorage.getItem('accessToken');
        const userData = localStorage.getItem('user');
        
        console.log('🔍 Storage check:', { 
          hasToken: !!token, 
          hasUser: !!userData
        });
        
        if (token && userData) {
          const parsedUser = normalizeUserWithRole(JSON.parse(userData));
          setUser(parsedUser);
          setIsAuthenticated(true);
          setIsSeller(parsedUser.is_seller);
          setIsPending(false);
        } else {
          console.log('⚠️ No token or user data found');
          setUser(null);
          setIsAuthenticated(false);
          setIsSeller(false);
          setIsPending(false);
        }
      } catch (error) {
        console.error('❌ Error loading user:', error);
        setUser(null);
        setIsAuthenticated(false);
      } finally {
        setLoading(false);
      }
    };
    
    loadUser();
  }, []);

  // Logout
  const logout = () => {
    console.log('🔍 Logging out...');
    localStorage.removeItem('access_token');
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    setUser(null);
    setIsAuthenticated(false);
    setIsSeller(false);
    setIsPending(false);
    toast.success('Logged out successfully');
  };

  const loginAsDemo = async (role = 'buyer') => {
    const creds = role === 'seller' ? DEMO_ACCOUNTS.seller : DEMO_ACCOUNTS.buyer;
    return login(creds);
  };

  const loginWithGoogle = useCallback(async (authPayload, userType = 'buyer', mode = 'login') => {
    try {
      const payload =
        typeof authPayload === 'string'
          ? { credential: authPayload }
          : authPayload && typeof authPayload === 'object'
          ? authPayload
          : {};

      const response = await authAPI.googleLogin({
        ...payload,
        user_type: userType,
        mode,
      });
      const data = response.data || {};
      if (!data.success) {
        return { success: false, error: data.error || 'Google sign-in failed' };
      }

      const accessToken = data.tokens?.access || data.access;
      const refreshToken = data.tokens?.refresh || data.refresh;
      const userData = data.user;

      if (accessToken) {
        localStorage.setItem('access_token', accessToken);
        localStorage.setItem('accessToken', accessToken);
      }
      if (refreshToken) {
        localStorage.setItem('refresh_token', refreshToken);
        localStorage.setItem('refreshToken', refreshToken);
      }
      if (!userData || !userData.id) {
        return { success: false, error: 'No user data received from Google sign-in' };
      }

      const userWithRole = normalizeUserWithRole(userData);
      localStorage.setItem('user', JSON.stringify(userWithRole));
      setUser(userWithRole);
      setIsAuthenticated(true);
      setIsSeller(userWithRole.is_seller);
      setIsPending(false);

      toast.success(data.message || `Signed in with Google as ${userWithRole.role}!`);
      return {
        success: true,
        user: userWithRole,
        isSeller: userWithRole.is_seller,
        isPending: false,
      };
    } catch (error) {
      const msg =
        error.response?.data?.error ||
        error.response?.data?.message ||
        error.message ||
        'Google sign-in failed';
      toast.error(msg);
      return { success: false, error: msg };
    }
  }, []);

  const value = {
    user,
    setUser,
    sellerProfile: user?.seller_profile || null,
    isAuthenticated,
    setIsAuthenticated,
    loading,
    setLoading,
    isSeller,
    setIsSeller,
    isPending,
    setIsPending,
    login,
    loginAsDemo,
    loginWithGoogle,
    register,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;