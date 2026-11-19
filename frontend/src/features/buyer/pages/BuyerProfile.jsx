import { useState, useEffect } from 'react';
import { buyerAPI, authAPI } from '../../../utils/api';
import Loader from '../../../components/common/Loader';
import { useAuth } from '../../../context/AuthContext';
import toast from 'react-hot-toast';
import { UserIcon, EnvelopeIcon, PhoneIcon, MapPinIcon, PencilIcon, CheckIcon, XMarkIcon } from '@heroicons/react/24/outline';

const BuyerProfile = () => {
  const { user, userType } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState({
    phone: '',
    address: '',
    city: '',
    state: '',
    country: 'Pakistan',
    postal_code: '',
    bio: '',
  });

  const applyProfileData = (p) => {
    setProfile(p);
    setFormData({
      phone: p.phone || '',
      address: p.address || '',
      city: p.city || '',
      state: p.state || '',
      country: p.country || 'Pakistan',
      postal_code: p.postal_code || '',
      bio: p.bio || '',
    });
  };

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const response = await buyerAPI.getProfile();
      applyProfileData(response.data.profile);
    } catch (error) {
      console.error('Error fetching profile:', error);
      toast.error('Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    buyerAPI
      .getProfile()
      .then((response) => {
        if (active) applyProfileData(response.data.profile);
      })
      .catch((error) => {
        console.error('Error fetching profile:', error);
        if (active) toast.error('Failed to load profile');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Update user profile
      await authAPI.updateProfile({
        first_name: user?.first_name,
        last_name: user?.last_name,
        phone: formData.phone,
        address: formData.address,
        city: formData.city,
        state: formData.state,
        country: formData.country,
        postal_code: formData.postal_code,
        bio: formData.bio,
      });
      toast.success('Profile updated successfully');
      setEditing(false);
      fetchProfile();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <Loader />;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-6 text-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center text-2xl font-bold">
                  {user?.first_name?.[0] || user?.username?.[0] || 'U'}
                </div>
                <div className="ml-4">
                  <h1 className="text-2xl font-bold">{user?.first_name} {user?.last_name}</h1>
                  <p className="text-sm opacity-90">@{user?.username}</p>
                  <p className="text-sm opacity-90">{user?.email}</p>
                  <span className="inline-block mt-1 px-2 py-0.5 bg-white/20 rounded-full text-xs">
                    {userType === 'seller' ? '🛒 Seller' : '🛍️ Buyer'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditing(!editing)}
                className="bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
              >
                {editing ? (
                  <>
                    <XMarkIcon className="w-4 h-4" />
                    Cancel
                  </>
                ) : (
                  <>
                    <PencilIcon className="w-4 h-4" />
                    Edit
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 p-6 border-b">
            <div className="text-center">
              <p className="text-2xl font-bold text-blue-600">{profile?.total_orders || 0}</p>
              <p className="text-sm text-gray-600">Orders</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-blue-600">{profile?.total_wishlist || 0}</p>
              <p className="text-sm text-gray-600">Wishlist</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-blue-600">{profile?.total_reviews || 0}</p>
              <p className="text-sm text-gray-600">Reviews</p>
            </div>
          </div>

          {/* Profile Info */}
          <div className="p-6">
            <h2 className="text-xl font-bold mb-4">Profile Information</h2>

            {!editing ? (
              <div className="space-y-3">
                <div className="flex items-center">
                  <UserIcon className="w-5 h-5 text-gray-400 mr-3 flex-shrink-0" />
                  <span>{user?.first_name} {user?.last_name}</span>
                </div>
                <div className="flex items-center">
                  <EnvelopeIcon className="w-5 h-5 text-gray-400 mr-3 flex-shrink-0" />
                  <span>{user?.email}</span>
                </div>
                <div className="flex items-center">
                  <PhoneIcon className="w-5 h-5 text-gray-400 mr-3 flex-shrink-0" />
                  <span>{profile?.phone || 'Not provided'}</span>
                </div>
                <div className="flex items-center">
                  <MapPinIcon className="w-5 h-5 text-gray-400 mr-3 flex-shrink-0" />
                  <span>{profile?.address || 'Not provided'}</span>
                </div>
                <div className="flex items-center">
                  <MapPinIcon className="w-5 h-5 text-gray-400 mr-3 flex-shrink-0" />
                  <span>{profile?.city}, {profile?.state}, {profile?.country} - {profile?.postal_code}</span>
                </div>
                {profile?.bio && (
                  <div className="flex items-start">
                    <span className="w-5 h-5 text-gray-400 mr-3 flex-shrink-0">📝</span>
                    <span>{profile.bio}</span>
                  </div>
                )}
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
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
                    placeholder="Enter address"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">City</label>
                    <input
                      type="text"
                      name="city"
                      value={formData.city}
                      onChange={handleChange}
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      placeholder="City"
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
                      placeholder="State"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Country</label>
                    <input
                      type="text"
                      name="country"
                      value={formData.country}
                      onChange={handleChange}
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Country"
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
                      placeholder="Postal code"
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
                <div className="flex gap-3">
                  <button
                    type="submit"
                    disabled={loading}
                    className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center"
                  >
                    <CheckIcon className="w-4 h-4 mr-2" />
                    Save Changes
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className="bg-gray-200 text-gray-700 px-6 py-2 rounded-lg hover:bg-gray-300 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BuyerProfile;