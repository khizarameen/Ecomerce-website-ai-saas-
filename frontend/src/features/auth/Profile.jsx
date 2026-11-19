// src/features/profile/pages/Profile.jsx
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { authAPI } from '../../utils/api';
import Loader from '../../components/common/Loader';
import toast from 'react-hot-toast';
import {
  UserIcon,
  EnvelopeIcon,
  PhoneIcon,
  MapPinIcon,
  PencilIcon,
  CheckIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

const Profile = () => {
  const { user, logout, isAuthenticated, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    username: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    country: 'Pakistan',
    postal_code: '',
    bio: '',
  });
  const [userType, setUserType] = useState('buyer');

  useEffect(() => {
    // Check if user is authenticated
    if (!authLoading && !isAuthenticated) {
      toast.error('Please login to view profile');
      navigate('/login');
      return;
    }

    if (user) {
      fetchProfile();
      // Determine user type from user data
      if (user.user_type === 'seller' || user.is_seller === true) {
        setUserType('seller');
      } else if (user.is_staff || user.is_superuser) {
        setUserType('admin');
      } else {
        setUserType('buyer');
      }
    }
  }, [user, isAuthenticated, authLoading, navigate]);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      console.log('📡 Fetching profile...');
      const response = await authAPI.getProfile();
      console.log('✅ Profile response:', response.data);
      
      let userData = response.data;
      
      // Handle different response structures
      if (response.data.user) {
        userData = response.data.user;
      } else if (response.data.data?.user) {
        userData = response.data.data.user;
      }
      
      // Get profile data
      const profile = userData.profile || userData.user_profile || {};
      
      setFormData({
        first_name: userData.first_name || user?.first_name || '',
        last_name: userData.last_name || user?.last_name || '',
        email: userData.email || user?.email || '',
        username: userData.username || user?.username || '',
        phone: profile.phone || userData.phone || '',
        address: profile.address || userData.address || '',
        city: profile.city || userData.city || '',
        state: profile.state || userData.state || '',
        country: profile.country || userData.country || 'Pakistan',
        postal_code: profile.postal_code || userData.postal_code || '',
        bio: profile.bio || userData.bio || '',
      });
      
    } catch (error) {
      console.error('❌ Error fetching profile:', error);
      toast.error('Failed to load profile');
      
      // If we have user data from context, use that as fallback
      if (user) {
        setFormData({
          first_name: user.first_name || '',
          last_name: user.last_name || '',
          email: user.email || '',
          username: user.username || '',
          phone: user.phone || '',
          address: user.address || '',
          city: user.city || '',
          state: user.state || '',
          country: user.country || 'Pakistan',
          postal_code: user.postal_code || '',
          bio: user.bio || '',
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      console.log('📝 Updating profile with:', formData);
      
      // Prepare update data
      const updateData = {
        first_name: formData.first_name,
        last_name: formData.last_name,
        email: formData.email,
        username: formData.username,
        phone: formData.phone,
        address: formData.address,
        city: formData.city,
        state: formData.state,
        country: formData.country,
        postal_code: formData.postal_code,
        bio: formData.bio,
      };
      
      await authAPI.updateProfile(updateData);
      toast.success('Profile updated successfully!');
      setEditing(false);
      
      // Refresh profile data
      await fetchProfile();
      
    } catch (error) {
      console.error('❌ Error updating profile:', error);
      
      // Show detailed error
      if (error.response?.data) {
        const errors = error.response.data;
        Object.keys(errors).forEach(key => {
          if (Array.isArray(errors[key])) {
            toast.error(`${key}: ${errors[key].join(', ')}`);
          } else {
            toast.error(`${key}: ${errors[key]}`);
          }
        });
      } else {
        toast.error(error.response?.data?.message || 'Failed to update profile');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const getInitials = () => {
    if (formData.first_name && formData.last_name) {
      return `${formData.first_name[0]}${formData.last_name[0]}`.toUpperCase();
    }
    if (formData.first_name) {
      return formData.first_name[0].toUpperCase();
    }
    return formData.username?.[0]?.toUpperCase() || 'U';
  };

  // Loading states
  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader />
      </div>
    );
  }

  // Not authenticated
  if (!isAuthenticated) {
    return null; // Will redirect in useEffect
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold">My Profile</h1>
            <p className="text-gray-600">Manage your account settings</p>
          </div>
          <div className="flex gap-2">
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
              userType === 'seller' 
                ? 'bg-purple-100 text-purple-800' 
                : userType === 'admin'
                ? 'bg-red-100 text-red-800'
                : 'bg-blue-100 text-blue-800'
            }`}>
              {userType === 'seller' ? '👨‍💼 Seller' : userType === 'admin' ? '👑 Admin' : '👤 Buyer'}
            </span>
          </div>
        </div>

        {/* Profile Card */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          {/* Cover Image */}
          <div className="h-32 bg-gradient-to-r from-blue-600 to-purple-600"></div>

          {/* Profile Info */}
          <div className="px-6 pb-6">
            <div className="flex flex-col md:flex-row items-start md:items-center -mt-12 gap-4">
              {/* Avatar */}
              <div className="w-24 h-24 rounded-full border-4 border-white bg-blue-500 text-white flex items-center justify-center text-3xl font-bold shadow-lg">
                {getInitials()}
              </div>

              <div className="flex-1">
                <h2 className="text-2xl font-bold">
                  {formData.first_name} {formData.last_name}
                </h2>
                <p className="text-gray-600">@{formData.username}</p>
                <p className="text-gray-500 text-sm">{formData.email}</p>
              </div>

              <button
                onClick={() => setEditing(!editing)}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center"
              >
                {editing ? (
                  <>
                    <XMarkIcon className="w-4 h-4 mr-1" />
                    Cancel
                  </>
                ) : (
                  <>
                    <PencilIcon className="w-4 h-4 mr-1" />
                    Edit Profile
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Profile Details */}
          <div className="border-t px-6 py-4">
            {!editing ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Full Name</p>
                  <p className="font-medium">{formData.first_name} {formData.last_name}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Username</p>
                  <p className="font-medium">@{formData.username}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Email</p>
                  <p className="font-medium">{formData.email}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Phone</p>
                  <p className="font-medium">{formData.phone || 'Not provided'}</p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-sm text-gray-500">Address</p>
                  <p className="font-medium">{formData.address || 'Not provided'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">City</p>
                  <p className="font-medium">{formData.city || 'Not provided'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">State</p>
                  <p className="font-medium">{formData.state || 'Not provided'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Country</p>
                  <p className="font-medium">{formData.country || 'Not provided'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Postal Code</p>
                  <p className="font-medium">{formData.postal_code || 'Not provided'}</p>
                </div>
                {formData.bio && (
                  <div className="md:col-span-2">
                    <p className="text-sm text-gray-500">Bio</p>
                    <p className="font-medium">{formData.bio}</p>
                  </div>
                )}
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">First Name</label>
                    <input
                      type="text"
                      name="first_name"
                      value={formData.first_name}
                      onChange={handleChange}
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Last Name</label>
                    <input
                      type="text"
                      name="last_name"
                      value={formData.last_name}
                      onChange={handleChange}
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Username</label>
                  <input
                    type="text"
                    name="username"
                    value={formData.username}
                    onChange={handleChange}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Email</label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Phone</label>
                  <input
                    type="text"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter phone number"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Address</label>
                  <input
                    type="text"
                    name="address"
                    value={formData.address}
                    onChange={handleChange}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter your address"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">City</label>
                    <input
                      type="text"
                      name="city"
                      value={formData.city}
                      onChange={handleChange}
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Enter city"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">State</label>
                    <input
                      type="text"
                      name="state"
                      value={formData.state}
                      onChange={handleChange}
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Enter state"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Country</label>
                    <input
                      type="text"
                      name="country"
                      value={formData.country}
                      onChange={handleChange}
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Enter country"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Postal Code</label>
                    <input
                      type="text"
                      name="postal_code"
                      value={formData.postal_code}
                      onChange={handleChange}
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Enter postal code"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Bio</label>
                  <textarea
                    name="bio"
                    rows="3"
                    value={formData.bio}
                    onChange={handleChange}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Tell us about yourself"
                  />
                </div>

                <div className="flex gap-2 pt-4">
                  <button
                    type="submit"
                    disabled={loading}
                    className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center disabled:opacity-50"
                  >
                    {loading ? (
                      <div className="flex items-center">
                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Saving...
                      </div>
                    ) : (
                      <>
                        <CheckIcon className="w-4 h-4 mr-1" />
                        Save Changes
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className="bg-gray-200 text-gray-800 px-6 py-2 rounded-lg hover:bg-gray-300 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Account Actions */}
          <div className="border-t px-6 py-4 bg-gray-50">
            <div className="flex flex-wrap gap-4">
              <button
                onClick={() => navigate('/auth/change-password')}
                className="text-blue-600 hover:text-blue-700 text-sm font-medium"
              >
                Change Password
              </button>
              <button
                onClick={logout}
                className="text-red-600 hover:text-red-700 text-sm font-medium"
              >
                Logout
              </button>
            </div>
          </div>
        </div>

        {/* Quick Links */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          {userType === 'buyer' && (
            <>
              <Link 
                to="/orders" 
                className="bg-white rounded-lg shadow-md p-4 hover:shadow-lg transition-shadow flex items-center"
              >
                <span className="text-2xl mr-3">📦</span>
                <div>
                  <p className="font-semibold">My Orders</p>
                  <p className="text-sm text-gray-500">View order history</p>
                </div>
              </Link>
              <Link 
                to="/wishlist" 
                className="bg-white rounded-lg shadow-md p-4 hover:shadow-lg transition-shadow flex items-center"
              >
                <span className="text-2xl mr-3">❤️</span>
                <div>
                  <p className="font-semibold">Wishlist</p>
                  <p className="text-sm text-gray-500">Saved items</p>
                </div>
              </Link>
              <Link 
                to="/cart" 
                className="bg-white rounded-lg shadow-md p-4 hover:shadow-lg transition-shadow flex items-center"
              >
                <span className="text-2xl mr-3">🛒</span>
                <div>
                  <p className="font-semibold">Cart</p>
                  <p className="text-sm text-gray-500">View your cart</p>
                </div>
              </Link>
            </>
          )}
          {userType === 'seller' && (
            <>
              <Link 
                to="/seller/dashboard" 
                className="bg-white rounded-lg shadow-md p-4 hover:shadow-lg transition-shadow flex items-center"
              >
                <span className="text-2xl mr-3">📊</span>
                <div>
                  <p className="font-semibold">Dashboard</p>
                  <p className="text-sm text-gray-500">Seller dashboard</p>
                </div>
              </Link>
              <Link 
                to="/seller/products" 
                className="bg-white rounded-lg shadow-md p-4 hover:shadow-lg transition-shadow flex items-center"
              >
                <span className="text-2xl mr-3">📦</span>
                <div>
                  <p className="font-semibold">My Products</p>
                  <p className="text-sm text-gray-500">Manage products</p>
                </div>
              </Link>
              <Link 
                to="/seller/orders" 
                className="bg-white rounded-lg shadow-md p-4 hover:shadow-lg transition-shadow flex items-center"
              >
                <span className="text-2xl mr-3">📋</span>
                <div>
                  <p className="font-semibold">Orders</p>
                  <p className="text-sm text-gray-500">View orders</p>
                </div>
              </Link>
            </>
          )}
          {userType === 'admin' && (
            <>
              <Link 
                to="/admin/dashboard" 
                className="bg-white rounded-lg shadow-md p-4 hover:shadow-lg transition-shadow flex items-center"
              >
                <span className="text-2xl mr-3">👑</span>
                <div>
                  <p className="font-semibold">Admin Panel</p>
                  <p className="text-sm text-gray-500">Manage everything</p>
                </div>
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Profile;