import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { sellerAPI, authAPI } from '../../../utils/api';
import Loader from '../../../components/common/Loader';
import toast from 'react-hot-toast';
import { 
  UserIcon, 
  EnvelopeIcon, 
  PhoneIcon, 
  MapPinIcon,
  BuildingStorefrontIcon,
  CreditCardIcon,
  BanknotesIcon,
  GlobeAltIcon,
  IdentificationIcon,
  CheckCircleIcon,
  XCircleIcon
} from '@heroicons/react/24/outline';

const Profile = () => {
  const { user } = useAuth();
  const [seller, setSeller] = useState(null);
  const [sellerProfile, setSellerProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [activeTab, setActiveTab] = useState('store');
  const [formData, setFormData] = useState({
    store_name: '',
    store_description: '',
    phone: '',
    email: '',
    address: '',
    website: '',
    payment_method: '',
    bank_name: '',
    account_holder: '',
    account_number: '',
    iban: '',
    mobile_number: '',
    payoneer_email: '',
    business_registration: '',
    tax_id: '',
  });

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    setLoading(true);
    try {
      // Get user profile
      const response = await authAPI.getProfile();
      const userData = response.data.user;
      console.log('User data:', userData);
      
      const sellerData = userData.seller_profile || {};
      setSeller(sellerData);
      
      // Try to get seller payment profile - handle 404 gracefully
      try {
        const sellerResponse = await sellerAPI.getSellerProfile();
        console.log('Seller payment profile:', sellerResponse.data);
        const paymentData = sellerResponse.data.profile || {};
        setSellerProfile(paymentData);
        
        setFormData({
          store_name: sellerData.store_name || '',
          store_description: sellerData.store_description || '',
          phone: sellerData.phone || paymentData.phone || '',
          email: sellerData.email || paymentData.email || '',
          address: sellerData.address || paymentData.address || '',
          website: sellerData.website || '',
          payment_method: paymentData.payment_method || '',
          bank_name: paymentData.bank_name || '',
          account_holder: paymentData.account_holder || '',
          account_number: paymentData.account_number || '',
          iban: paymentData.iban || '',
          mobile_number: paymentData.mobile_number || '',
          payoneer_email: paymentData.payoneer_email || '',
          business_registration: paymentData.business_registration || '',
          tax_id: paymentData.tax_id || '',
        });
      } catch (error) {
        // Handle 404 gracefully - no seller profile yet
        if (error.response?.status === 404) {
          console.log('No seller profile found, using default values');
          setSellerProfile(null);
          setFormData({
            store_name: sellerData.store_name || '',
            store_description: sellerData.store_description || '',
            phone: sellerData.phone || '',
            email: sellerData.email || '',
            address: sellerData.address || '',
            website: sellerData.website || '',
            payment_method: '',
            bank_name: '',
            account_holder: '',
            account_number: '',
            iban: '',
            mobile_number: '',
            payoneer_email: '',
            business_registration: '',
            tax_id: '',
          });
        } else {
          console.error('Error fetching seller profile:', error);
          toast.error('Failed to load payment details');
        }
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
      toast.error('Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Update basic profile (phone and address)
      await sellerAPI.updateProfile({
        phone: formData.phone,
        address: formData.address,
      });
      
      // Update seller payment profile
      await sellerAPI.updateSellerProfile({
        shop_name: formData.store_name,
        shop_description: formData.store_description,
        phone: formData.phone,
        email: formData.email,
        address: formData.address,
        website: formData.website,
        payment_method: formData.payment_method,
        bank_name: formData.bank_name,
        account_holder: formData.account_holder,
        account_number: formData.account_number,
        iban: formData.iban,
        mobile_number: formData.mobile_number,
        payoneer_email: formData.payoneer_email,
        business_registration: formData.business_registration,
        tax_id: formData.tax_id,
      });
      
      toast.success('Profile updated successfully');
      setEditing(false);
      fetchProfile();
    } catch (error) {
      console.error('Error updating profile:', error);
      const errorMsg = error.response?.data?.error || 
                       error.response?.data?.message || 
                       'Failed to update profile';
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value,
    });
  };

  const getPaymentMethodDisplay = (method) => {
    const methods = {
      'bank': '🏦 Bank Transfer',
      'jazzcash': '📱 JazzCash',
      'easypaisa': '📱 EasyPaisa',
      'payoneer': '💳 Payoneer',
      'manual': '✋ Manual/Other'
    };
    return methods[method] || method || 'Not set';
  };

  if (loading) return <Loader />;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-purple-600 to-blue-600 p-6 text-white">
            <div className="flex items-center">
              <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center text-2xl font-bold">
                {seller?.store_name?.[0] || user?.username?.[0] || 'S'}
              </div>
              <div className="ml-4">
                <h1 className="text-2xl font-bold">{seller?.store_name || 'Seller Profile'}</h1>
                <p className="text-sm opacity-90">Seller Account</p>
                <p className="text-sm opacity-90">{user?.email}</p>
                {seller?.is_approved ? (
                  <span className="inline-flex items-center mt-1 text-xs bg-green-500/20 px-2 py-1 rounded-full">
                    <CheckCircleIcon className="w-3 h-3 mr-1" />
                    Verified Seller
                  </span>
                ) : (
                  <span className="inline-flex items-center mt-1 text-xs bg-yellow-500/20 px-2 py-1 rounded-full">
                    <XCircleIcon className="w-3 h-3 mr-1" />
                    Pending Approval
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="border-b">
            <div className="flex">
              <button
                onClick={() => setActiveTab('store')}
                className={`px-6 py-3 font-medium text-sm ${
                  activeTab === 'store'
                    ? 'border-b-2 border-blue-600 text-blue-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <BuildingStorefrontIcon className="w-5 h-5 inline mr-2" />
                Store Info
              </button>
              <button
                onClick={() => setActiveTab('payment')}
                className={`px-6 py-3 font-medium text-sm ${
                  activeTab === 'payment'
                    ? 'border-b-2 border-blue-600 text-blue-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <CreditCardIcon className="w-5 h-5 inline mr-2" />
                Payment Details
              </button>
            </div>
          </div>

          <div className="p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">
                {activeTab === 'store' ? 'Store Information' : 'Payment Details'}
              </h2>
              <button
                onClick={() => setEditing(!editing)}
                className="text-blue-600 hover:text-blue-700 font-medium"
              >
                {editing ? 'Cancel' : 'Edit Profile'}
              </button>
            </div>

            {!editing ? (
              // View Mode
              activeTab === 'store' ? (
                <div className="space-y-4">
                  <div className="flex items-start">
                    <BuildingStorefrontIcon className="w-5 h-5 text-gray-400 mr-3 mt-1" />
                    <div>
                      <p className="text-sm text-gray-500">Store Name</p>
                      <p className="font-medium">{seller?.store_name || 'N/A'}</p>
                    </div>
                  </div>
                  <div className="flex items-start">
                    <UserIcon className="w-5 h-5 text-gray-400 mr-3 mt-1" />
                    <div>
                      <p className="text-sm text-gray-500">Store Description</p>
                      <p className="font-medium">{seller?.store_description || 'No description'}</p>
                    </div>
                  </div>
                  <div className="flex items-start">
                    <EnvelopeIcon className="w-5 h-5 text-gray-400 mr-3 mt-1" />
                    <div>
                      <p className="text-sm text-gray-500">Email</p>
                      <p className="font-medium">{seller?.email || user?.email}</p>
                    </div>
                  </div>
                  <div className="flex items-start">
                    <PhoneIcon className="w-5 h-5 text-gray-400 mr-3 mt-1" />
                    <div>
                      <p className="text-sm text-gray-500">Phone</p>
                      <p className="font-medium">{seller?.phone || 'Not provided'}</p>
                    </div>
                  </div>
                  <div className="flex items-start">
                    <MapPinIcon className="w-5 h-5 text-gray-400 mr-3 mt-1" />
                    <div>
                      <p className="text-sm text-gray-500">Address</p>
                      <p className="font-medium">{seller?.address || 'Not provided'}</p>
                    </div>
                  </div>
                  {seller?.website && (
                    <div className="flex items-start">
                      <GlobeAltIcon className="w-5 h-5 text-gray-400 mr-3 mt-1" />
                      <div>
                        <p className="text-sm text-gray-500">Website</p>
                        <a href={seller.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 font-medium hover:underline">
                          {seller.website}
                        </a>
                      </div>
                    </div>
                  )}
                  {seller?.business_registration && (
                    <div className="flex items-start">
                      <IdentificationIcon className="w-5 h-5 text-gray-400 mr-3 mt-1" />
                      <div>
                        <p className="text-sm text-gray-500">Business Registration</p>
                        <p className="font-medium">{seller.business_registration}</p>
                      </div>
                    </div>
                  )}
                  {seller?.tax_id && (
                    <div className="flex items-start">
                      <IdentificationIcon className="w-5 h-5 text-gray-400 mr-3 mt-1" />
                      <div>
                        <p className="text-sm text-gray-500">Tax ID</p>
                        <p className="font-medium">{seller.tax_id}</p>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                // Payment Details View
                <div className="space-y-4">
                  <div className="flex items-start">
                    <CreditCardIcon className="w-5 h-5 text-gray-400 mr-3 mt-1" />
                    <div>
                      <p className="text-sm text-gray-500">Payment Method</p>
                      <p className="font-medium">{getPaymentMethodDisplay(sellerProfile?.payment_method)}</p>
                    </div>
                  </div>
                  
                  {sellerProfile?.payment_method === 'bank' && (
                    <>
                      <div className="flex items-start">
                        <BanknotesIcon className="w-5 h-5 text-gray-400 mr-3 mt-1" />
                        <div>
                          <p className="text-sm text-gray-500">Bank Name</p>
                          <p className="font-medium">{sellerProfile?.bank_name || 'Not provided'}</p>
                        </div>
                      </div>
                      <div className="flex items-start">
                        <IdentificationIcon className="w-5 h-5 text-gray-400 mr-3 mt-1" />
                        <div>
                          <p className="text-sm text-gray-500">Account Holder</p>
                          <p className="font-medium">{sellerProfile?.account_holder || 'Not provided'}</p>
                        </div>
                      </div>
                      <div className="flex items-start">
                        <IdentificationIcon className="w-5 h-5 text-gray-400 mr-3 mt-1" />
                        <div>
                          <p className="text-sm text-gray-500">Account Number</p>
                          <p className="font-medium">{sellerProfile?.account_number || 'Not provided'}</p>
                        </div>
                      </div>
                      <div className="flex items-start">
                        <IdentificationIcon className="w-5 h-5 text-gray-400 mr-3 mt-1" />
                        <div>
                          <p className="text-sm text-gray-500">IBAN</p>
                          <p className="font-medium">{sellerProfile?.iban || 'Not provided'}</p>
                        </div>
                      </div>
                    </>
                  )}
                  
                  {(sellerProfile?.payment_method === 'jazzcash' || sellerProfile?.payment_method === 'easypaisa') && (
                    <div className="flex items-start">
                      <PhoneIcon className="w-5 h-5 text-gray-400 mr-3 mt-1" />
                      <div>
                        <p className="text-sm text-gray-500">Mobile Number</p>
                        <p className="font-medium">{sellerProfile?.mobile_number || 'Not provided'}</p>
                      </div>
                    </div>
                  )}
                  
                  {sellerProfile?.payment_method === 'payoneer' && (
                    <div className="flex items-start">
                      <EnvelopeIcon className="w-5 h-5 text-gray-400 mr-3 mt-1" />
                      <div>
                        <p className="text-sm text-gray-500">Payoneer Email</p>
                        <p className="font-medium">{sellerProfile?.payoneer_email || 'Not provided'}</p>
                      </div>
                    </div>
                  )}
                  
                  {sellerProfile?.business_registration && (
                    <div className="flex items-start">
                      <IdentificationIcon className="w-5 h-5 text-gray-400 mr-3 mt-1" />
                      <div>
                        <p className="text-sm text-gray-500">Business Registration</p>
                        <p className="font-medium">{sellerProfile.business_registration}</p>
                      </div>
                    </div>
                  )}
                  
                  {sellerProfile?.tax_id && (
                    <div className="flex items-start">
                      <IdentificationIcon className="w-5 h-5 text-gray-400 mr-3 mt-1" />
                      <div>
                        <p className="text-sm text-gray-500">Tax ID</p>
                        <p className="font-medium">{sellerProfile.tax_id}</p>
                      </div>
                    </div>
                  )}
                  
                  {!sellerProfile?.payment_method && !sellerProfile?.bank_name && !sellerProfile?.mobile_number && (
                    <p className="text-gray-500 text-sm">No payment details provided yet</p>
                  )}
                </div>
              )
            ) : (
              // Edit Mode
              <form onSubmit={handleSubmit} className="space-y-4">
                {activeTab === 'store' ? (
                  // Store Info Edit
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Store Name</label>
                      <input
                        type="text"
                        name="store_name"
                        value={formData.store_name}
                        onChange={handleChange}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Store Description</label>
                      <textarea
                        name="store_description"
                        value={formData.store_description}
                        onChange={handleChange}
                        rows="3"
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
                      <label className="block text-sm font-medium text-gray-700">Address</label>
                      <input
                        type="text"
                        name="address"
                        value={formData.address}
                        onChange={handleChange}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Website</label>
                      <input
                        type="url"
                        name="website"
                        value={formData.website}
                        onChange={handleChange}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </>
                ) : (
                  // Payment Details Edit
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Payment Method</label>
                      <select
                        name="payment_method"
                        value={formData.payment_method}
                        onChange={handleChange}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="">Select Payment Method</option>
                        <option value="bank">🏦 Bank Transfer</option>
                        <option value="jazzcash">📱 JazzCash</option>
                        <option value="easypaisa">📱 EasyPaisa</option>
                        <option value="payoneer">💳 Payoneer</option>
                        <option value="manual">✋ Manual/Other</option>
                      </select>
                    </div>

                    {formData.payment_method === 'bank' && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Bank Name</label>
                          <input
                            type="text"
                            name="bank_name"
                            value={formData.bank_name}
                            onChange={handleChange}
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Account Holder</label>
                          <input
                            type="text"
                            name="account_holder"
                            value={formData.account_holder}
                            onChange={handleChange}
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Account Number</label>
                          <input
                            type="text"
                            name="account_number"
                            value={formData.account_number}
                            onChange={handleChange}
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">IBAN</label>
                          <input
                            type="text"
                            name="iban"
                            value={formData.iban}
                            onChange={handleChange}
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                      </>
                    )}

                    {(formData.payment_method === 'jazzcash' || formData.payment_method === 'easypaisa') && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Mobile Number</label>
                        <input
                          type="text"
                          name="mobile_number"
                          value={formData.mobile_number}
                          onChange={handleChange}
                          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                          placeholder="03XX-XXXXXXX"
                        />
                      </div>
                    )}

                    {formData.payment_method === 'payoneer' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Payoneer Email</label>
                        <input
                          type="email"
                          name="payoneer_email"
                          value={formData.payoneer_email}
                          onChange={handleChange}
                          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-gray-700">Business Registration (Optional)</label>
                      <input
                        type="text"
                        name="business_registration"
                        value={formData.business_registration}
                        onChange={handleChange}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Tax ID (Optional)</label>
                      <input
                        type="text"
                        name="tax_id"
                        value={formData.tax_id}
                        onChange={handleChange}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </>
                )}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Saving...' : 'Save Changes'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;