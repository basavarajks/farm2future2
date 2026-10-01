import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';

const QUICK_COMMODITIES = [
  'Tomato', 'Onion', 'Potato', 'Green Chilli', 'Cotton',
  'Groundnut', 'Ragi(Finger Millet)', 'Garlic', 'Turmeric', 'Coconut'
];

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [stats, setStats]           = useState(null);
  const [dataStatus, setDataStatus] = useState(null);
  const [myItems, setMyItems]       = useState([]);
  const [tradeLeads, setTradeLeads] = useState([]);
  const [marketWatch, setMarketWatch] = useState([]);
  const [commodities, setCommodities] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [activeTab, setActiveTab]   = useState('overview');
  const [searchFilter, setSearchFilter] = useState('');
  const [showModal, setShowModal]   = useState(false);
  const [toast, setToast]           = useState({ text: '', type: '' });
  const [submitting, setSubmitting] = useState(false);

  // Form state for new listing (Farmer) or new post (Buyer)
  const [farmerForm, setFarmerForm] = useState({
    commodity: '',
    variety: '',
    quantity: '',
    unit: 'Qtl',
    askingPrice: '',
    shelfLifeDays: '',
    description: ''
  });

  const [buyerForm, setBuyerForm] = useState({
    commoditiesNeeded: [],
    quantityNeeded: '',
    priceOffered: 'Market Rate',
    description: '',
    state: ''
  });

  const showToast = (text, type = 'success') => {
    setToast({ text, type });
    setTimeout(() => setToast({ text: '', type: '' }), 4000);
  };

  const loadDashboardData = async () => {
    if (!user) return;
    try {
      const [statsRes, dsRes, itemsRes, leadsRes, commsRes] = await Promise.all([
        api.get('/dashboard'),
        api.get('/data-status'),
        user.role === 'farmer' ? api.get('/listings/my') : api.get('/buyer-posts/my'),
        user.role === 'farmer' ? api.get('/buyer-posts') : api.get('/listings'),
        api.get('/commodities').catch(() => ({ data: QUICK_COMMODITIES })),
      ]);

      setStats(statsRes.data);
      setDataStatus(dsRes.data);
      setMyItems(itemsRes.data || []);
      setTradeLeads(leadsRes.data || []);
      if (Array.isArray(commsRes.data)) {
        setCommodities(commsRes.data.slice(0, 100));
      }

      // Load initial market watch for popular crops
      loadMarketWatch(['Tomato', 'Onion', 'Potato', 'Green Chilli', 'Cotton']);
    } catch (err) {
      console.warn('Dashboard fetch warning:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadMarketWatch = async (crops) => {
    try {
      const promises = crops.map(c =>
        api.get(`/prices?commodity=${encodeURIComponent(c)}`)
          .then(res => res.data)
          .catch(() => null)
      );
      const results = await Promise.all(promises);
      setMarketWatch(results.filter(Boolean));
    } catch {
      // Graceful fallback
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, [user]);

  // Derived metrics
  const activeItemsCount = useMemo(() => {
    return myItems.filter(i => i.status === 'active').length;
  }, [myItems]);

  const totalInventoryValue = useMemo(() => {
    if (user?.role !== 'farmer') return 0;
    return myItems
      .filter(i => i.status === 'active')
      .reduce((sum, item) => sum + (Number(item.quantity || 0) * Number(item.askingPrice || 0)), 0);
  }, [myItems, user]);

  const perishableAlertItems = useMemo(() => {
    if (user?.role !== 'farmer') return [];
    return myItems.filter(i => i.status === 'active' && (i.isPerishable || Number(i.shelfLifeDays) <= 3));
  }, [myItems, user]);

  // Handle closing an item (Farmer listing or Buyer post)
  const handleCloseItem = async (id) => {
    const isFarmer = user.role === 'farmer';
    const confirmText = isFarmer
      ? 'Are you sure you want to close this crop listing? It will no longer be visible to buyers.'
      : 'Are you sure you want to close this requirement post?';

    if (!window.confirm(confirmText)) return;

    try {
      if (isFarmer) {
        await api.delete(`/listings/${id}`);
      } else {
        await api.delete(`/buyer-posts/${id}`);
      }
      showToast('Item successfully closed', 'success');
      loadDashboardData();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to close item', 'error');
    }
  };

  // Submit new farmer listing
  const handleFarmerSubmit = async (e) => {
    e.preventDefault();
    if (!farmerForm.commodity) return showToast('Please select a commodity', 'error');
    if (!farmerForm.quantity || Number(farmerForm.quantity) <= 0) return showToast('Please enter a valid quantity', 'error');
    if (!farmerForm.askingPrice || Number(farmerForm.askingPrice) <= 0) return showToast('Please enter an asking price', 'error');

    setSubmitting(true);
    try {
      await api.post('/listings', {
        ...farmerForm,
        quantity: Number(farmerForm.quantity),
        askingPrice: Number(farmerForm.askingPrice),
        shelfLifeDays: Number(farmerForm.shelfLifeDays || 0)
      });
      showToast('Crop lot posted successfully! Verified buyers can now contact you.', 'success');
      setShowModal(false);
      setFarmerForm({
        commodity: '',
        variety: '',
        quantity: '',
        unit: 'Qtl',
        askingPrice: '',
        shelfLifeDays: '',
        description: ''
      });
      loadDashboardData();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to post crop listing', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Submit new buyer requirement
  const handleBuyerSubmit = async (e) => {
    e.preventDefault();
    if (buyerForm.commoditiesNeeded.length === 0) return showToast('Please select at least one commodity', 'error');
    if (!buyerForm.quantityNeeded.trim()) return showToast('Please specify the required quantity', 'error');
    if (!buyerForm.description.trim()) return showToast('Please add requirement notes', 'error');

    setSubmitting(true);
    try {
      await api.post('/buyer-posts', buyerForm);
      showToast('Procurement post created! Farmers will contact you directly.', 'success');
      setShowModal(false);
      setBuyerForm({
        commoditiesNeeded: [],
        quantityNeeded: '',
        priceOffered: 'Market Rate',
        description: '',
        state: ''
      });
      loadDashboardData();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to post requirement', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleBuyerCrop = (crop) => {
    setBuyerForm(prev => {
      const exists = prev.commoditiesNeeded.includes(crop);
      return {
        ...prev,
        commoditiesNeeded: exists
          ? prev.commoditiesNeeded.filter(c => c !== crop)
          : [...prev.commoditiesNeeded, crop]
      };
    });
  };

  if (!user) return null;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--sand-100)' }}>
      {/* ── Toast Notification ── */}
      {toast.text && (
        <div style={{
          position: 'fixed',
          top: 84,
          right: 24,
          zIndex: 1000,
          background: toast.type === 'error' ? '#991b1b' : '#14532d',
          color: '#fff',
          padding: '12px 20px',
          borderRadius: '10px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
          fontSize: 14,
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          animation: 'fadeIn 0.2s ease'
        }}>
          <span>{toast.type === 'error' ? '⚠️' : '✅'}</span>
          <span>{toast.text}</span>
        </div>
      )}

      {/* ── Executive Dashboard Header ── */}
      <section className="dash-header">
        <div className="container">
          <div className="dash-header-inner">
            <div className="dash-profile">
              <div className="dash-avatar">
                {user.name ? user.name[0].toUpperCase() : 'F'}
              </div>
              <div>
                <div className="dash-user-title">
                  <span>{user.name}</span>
                  <span className="dash-badge-verified">
                    {user.role === 'farmer' ? 'Verified Producer' : 'Enterprise Buyer'}
                  </span>
                </div>
                <div className="dash-user-meta">
                  {user.role === 'farmer' ? (
                    <>
                      <span>📍 {user.village ? `${user.village}, ` : ''}{user.district}, {user.state}</span>
                      <span>·</span>
                      <span>{user.cropsGrown?.length ? `Focus: ${user.cropsGrown.slice(0, 3).join(', ')}` : 'Agriculture & Horticulture'}</span>
                    </>
                  ) : (
                    <>
                      <span>🏢 {user.companyName || user.name}</span>
                      <span>·</span>
                      <span>{user.companyType || 'Commercial Agro Procurement'}</span>
                      <span>·</span>
                      <span>📍 {user.state || 'All-India Coverage'}</span>
                    </>
                  )}
                  <span>·</span>
                  <span style={{ color: 'var(--green-300)' }}>
                    🟢 Mandi Network Synchronized ({dataStatus?.totalRecords?.toLocaleString() || '7,600+'} records)
                  </span>
                </div>
              </div>
            </div>

            <div className="dash-header-actions">
              <button
                onClick={() => setShowModal(true)}
                className="btn btn-primary"
                style={{
                  boxShadow: '0 4px 14px rgba(37,160,96,0.35)',
                  padding: '10px 20px',
                  fontWeight: 700
                }}
              >
                {user.role === 'farmer' ? '+ Post Crop for Sale' : '+ Post Requirement'}
              </button>
              <Link to="/prices">
                <button
                  className="btn"
                  style={{
                    background: 'rgba(255,255,255,0.1)',
                    color: '#ffffff',
                    border: '1px solid rgba(255,255,255,0.2)',
                    padding: '10px 18px'
                  }}
                >
                  📊 Mandi Price Finder
                </button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Main Dashboard Container ── */}
      <div className="container" style={{ paddingBottom: 64 }}>
        {loading ? (
          <div className="loader">
            <div className="spinner" />
            <div style={{ fontSize: 14, color: 'var(--ink-400)' }}>Syncing real-time market data...</div>
          </div>
        ) : (
          <>
            {/* ── KPI Metric Cards (Clean, Professional, Elevated) ── */}
            <div className="dash-stat-grid">
              {user.role === 'farmer' ? (
                <>
                  <div className="dash-stat-card">
                    <div className="dash-stat-label">
                      <span>Active Inventory</span>
                      <span style={{ color: 'var(--green-600)', fontSize: 16 }}>📦</span>
                    </div>
                    <div className="dash-stat-val">
                      {activeItemsCount} <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--ink-500)' }}>lots</span>
                    </div>
                    <div className="dash-stat-sub">
                      <span>{myItems.length} total historical listings</span>
                    </div>
                  </div>

                  <div className="dash-stat-card">
                    <div className="dash-stat-label">
                      <span>Listed Stock Valuation</span>
                      <span style={{ color: '#16a34a', fontSize: 16 }}>💰</span>
                    </div>
                    <div className="dash-stat-val" style={{ color: '#15803d' }}>
                      ₹{totalInventoryValue.toLocaleString('en-IN')}
                    </div>
                    <div className="dash-stat-sub">
                      <span>Direct farm-gate pricing</span>
                    </div>
                  </div>

                  <div className="dash-stat-card">
                    <div className="dash-stat-label">
                      <span>Matching Buyer Leads</span>
                      <span style={{ color: '#2563eb', fontSize: 16 }}>🤝</span>
                    </div>
                    <div className="dash-stat-val" style={{ color: '#1d4ed8' }}>
                      {tradeLeads.length} <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--ink-500)' }}>buyers</span>
                    </div>
                    <div className="dash-stat-sub">
                      <span>Seeking bulk crop supplies</span>
                    </div>
                  </div>

                  <div className="dash-stat-card">
                    <div className="dash-stat-label">
                      <span>APMC Market Coverage</span>
                      <span style={{ color: '#d97706', fontSize: 16 }}>🏛️</span>
                    </div>
                    <div className="dash-stat-val">
                      {stats?.totalMarkets || '900'}+ <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--ink-500)' }}>mandis</span>
                    </div>
                    <div className="dash-stat-sub">
                      <span>24 states · Agmarknet database</span>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="dash-stat-card">
                    <div className="dash-stat-label">
                      <span>Active Procurement Posts</span>
                      <span style={{ color: '#2563eb', fontSize: 16 }}>📋</span>
                    </div>
                    <div className="dash-stat-val" style={{ color: '#1d4ed8' }}>
                      {activeItemsCount} <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--ink-500)' }}>active</span>
                    </div>
                    <div className="dash-stat-sub">
                      <span>Direct farmer procurement</span>
                    </div>
                  </div>

                  <div className="dash-stat-card">
                    <div className="dash-stat-label">
                      <span>Available Farmer Stock</span>
                      <span style={{ color: 'var(--green-600)', fontSize: 16 }}>🌾</span>
                    </div>
                    <div className="dash-stat-val" style={{ color: '#15803d' }}>
                      {stats?.totalListings || tradeLeads.length} <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--ink-500)' }}>lots</span>
                    </div>
                    <div className="dash-stat-sub">
                      <span>Verified farm-gate lots ready</span>
                    </div>
                  </div>

                  <div className="dash-stat-card">
                    <div className="dash-stat-label">
                      <span>Verified Farmer Network</span>
                      <span style={{ color: '#0d9488', fontSize: 16 }}>👨‍🌾</span>
                    </div>
                    <div className="dash-stat-val">
                      {stats?.totalFarmers || '150'}+ <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--ink-500)' }}>producers</span>
                    </div>
                    <div className="dash-stat-sub">
                      <span>Direct contact without broker margin</span>
                    </div>
                  </div>

                  <div className="dash-stat-card">
                    <div className="dash-stat-label">
                      <span>National Price Database</span>
                      <span style={{ color: '#7c3aed', fontSize: 16 }}>📊</span>
                    </div>
                    <div className="dash-stat-val">
                      {((stats?.totalRecords || 7600) / 1000).toFixed(1)}k <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--ink-500)' }}>records</span>
                    </div>
                    <div className="dash-stat-sub">
                      <span>{stats?.totalCommodities || 217} commodities tracked</span>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* ── Perishable Stock Alert Banner (Only when farmer has urgent perishable inventory) ── */}
            {perishableAlertItems.length > 0 && (
              <div style={{
                background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)',
                border: '1.5px solid #fed7aa',
                borderRadius: '14px',
                padding: '18px 24px',
                marginBottom: '24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
                flexWrap: 'wrap',
                boxShadow: '0 2px 8px rgba(194, 65, 12, 0.08)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{
                    width: 44,
                    height: 44,
                    borderRadius: '10px',
                    background: '#ea580c',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 22,
                    flexShrink: 0
                  }}>
                    ⚡
                  </div>
                  <div>
                    <h4 style={{ color: '#9a3412', fontSize: 16, fontWeight: 700, marginBottom: 2 }}>
                      Perishable Stock Fast-Action Alert
                    </h4>
                    <p style={{ color: '#7c2d12', fontSize: 13 }}>
                      You have {perishableAlertItems.length} lot(s) (
                      {perishableAlertItems.map(p => `${p.commodity} ${p.quantity}${p.unit}`).join(', ')}
                      ) with short shelf life. Direct food processor buyers and nearest APMC mandis are active.
                    </p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={() => setActiveTab('trade_leads')}
                    className="btn btn-sm"
                    style={{ background: '#c2410c', color: '#fff', border: 'none', fontWeight: 600 }}
                  >
                    View Matching Buyers →
                  </button>
                  <button
                    onClick={() => setActiveTab('market_watch')}
                    className="btn btn-sm btn-outline"
                    style={{ borderColor: '#ea580c', color: '#9a3412', fontWeight: 600 }}
                  >
                    Check Today's Mandi Rates
                  </button>
                </div>
              </div>
            )}

            {/* ── Segmented Tab Navigation Bar ── */}
            <div className="dash-segmented-bar">
              <button
                className={`dash-segmented-btn ${activeTab === 'overview' ? 'active' : ''}`}
                onClick={() => setActiveTab('overview')}
              >
                <span>📌</span> Overview
              </button>
              <button
                className={`dash-segmented-btn ${activeTab === 'inventory' ? 'active' : ''}`}
                onClick={() => setActiveTab('inventory')}
              >
                <span>{user.role === 'farmer' ? '📦 My Crop Inventory' : '🏢 My Procurement Demands'}</span>
                <span style={{
                  background: activeTab === 'inventory' ? 'var(--green-100)' : 'rgba(0,0,0,0.06)',
                  color: activeTab === 'inventory' ? 'var(--green-800)' : 'var(--ink-500)',
                  borderRadius: 100,
                  padding: '1px 7px',
                  fontSize: 11
                }}>
                  {myItems.length}
                </span>
              </button>
              <button
                className={`dash-segmented-btn ${activeTab === 'market_watch' ? 'active' : ''}`}
                onClick={() => setActiveTab('market_watch')}
              >
                <span>📈 Mandi Price Watch</span>
              </button>
              <button
                className={`dash-segmented-btn ${activeTab === 'trade_leads' ? 'active' : ''}`}
                onClick={() => setActiveTab('trade_leads')}
              >
                <span>🤝 Direct Trade Leads</span>
                <span style={{
                  background: activeTab === 'trade_leads' ? 'var(--green-100)' : 'rgba(0,0,0,0.06)',
                  color: activeTab === 'trade_leads' ? 'var(--green-800)' : 'var(--ink-500)',
                  borderRadius: 100,
                  padding: '1px 7px',
                  fontSize: 11
                }}>
                  {tradeLeads.length}
                </span>
              </button>
            </div>

            {/* ─────────────────────────────────────────────────────────────────── */}
            {/* TAB 1: OVERVIEW                                                    */}
            {/* ─────────────────────────────────────────────────────────────────── */}
            {activeTab === 'overview' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
                {/* 2-Column Overview Layout: Recent Listings & Live Market Pulse */}
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 24 }}>
                  {/* Left Column: My Active Listings Preview */}
                  <div className="card" style={{ padding: 24 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                      <div>
                        <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink-900)' }}>
                          {user.role === 'farmer' ? 'Current Active Crop Lots' : 'Current Active Demands'}
                        </h3>
                        <p style={{ fontSize: 13, color: 'var(--ink-400)' }}>
                          {activeItemsCount} lots open for trade
                        </p>
                      </div>
                      <button
                        onClick={() => setShowModal(true)}
                        className="btn btn-sm btn-outline"
                        style={{ fontWeight: 600 }}
                      >
                        + Add New
                      </button>
                    </div>

                    {myItems.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--ink-400)' }}>
                        <div style={{ fontSize: 36, marginBottom: 12 }}>🌱</div>
                        <h4 style={{ fontSize: 16, color: 'var(--ink-700)', marginBottom: 4 }}>No listings active</h4>
                        <p style={{ fontSize: 13, marginBottom: 16 }}>Post your crops to start receiving verified buyer leads.</p>
                        <button onClick={() => setShowModal(true)} className="btn btn-primary btn-sm">
                          {user.role === 'farmer' ? 'Post First Crop' : 'Post Requirement'}
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {myItems.slice(0, 4).map(item => (
                          <div
                            key={item.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '14px 16px',
                              background: 'var(--sand-50)',
                              border: '1px solid var(--sand-200)',
                              borderRadius: '10px'
                            }}
                          >
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink-900)' }}>
                                  {user.role === 'farmer' ? item.commodity : item.commoditiesNeeded?.join(', ')}
                                </span>
                                {item.variety && (
                                  <span style={{ fontSize: 12, color: 'var(--ink-400)' }}>({item.variety})</span>
                                )}
                                <span className={`dash-badge ${item.status === 'active' ? 'dash-badge-active' : 'dash-badge-closed'}`}>
                                  {item.status}
                                </span>
                              </div>
                              <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 4 }}>
                                {user.role === 'farmer' ? (
                                  <>
                                    <span>📦 {item.quantity} {item.unit}</span>
                                    <span style={{ margin: '0 6px' }}>·</span>
                                    <span style={{ fontWeight: 600, color: 'var(--green-700)' }}>₹{item.askingPrice?.toLocaleString()}/{item.unit}</span>
                                  </>
                                ) : (
                                  <>
                                    <span>Target: {item.quantityNeeded}</span>
                                    <span style={{ margin: '0 6px' }}>·</span>
                                    <span style={{ color: 'var(--green-700)', fontWeight: 600 }}>{item.priceOffered}</span>
                                  </>
                                )}
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <button
                                onClick={() => handleCloseItem(item.id)}
                                style={{
                                  background: 'transparent',
                                  border: '1px solid var(--sand-300)',
                                  borderRadius: '6px',
                                  padding: '5px 10px',
                                  fontSize: 12,
                                  color: 'var(--ink-500)',
                                  cursor: 'pointer'
                                }}
                                title="Close Listing"
                              >
                                Close
                              </button>
                            </div>
                          </div>
                        ))}

                        {myItems.length > 4 && (
                          <button
                            onClick={() => setActiveTab('inventory')}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--green-600)',
                              fontSize: 13,
                              fontWeight: 600,
                              cursor: 'pointer',
                              padding: '8px 0',
                              textAlign: 'center'
                            }}
                          >
                            View all {myItems.length} items →
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Right Column: Key Mandi Rates Snapshot */}
                  <div className="card" style={{ padding: 24 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                      <div>
                        <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink-900)' }}>
                          Daily Mandi Price Benchmark
                        </h3>
                        <p style={{ fontSize: 13, color: 'var(--ink-400)' }}>
                          Official modal rates across verified APMC markets
                        </p>
                      </div>
                      <button
                        onClick={() => setActiveTab('market_watch')}
                        className="btn btn-sm btn-outline"
                        style={{ fontWeight: 600 }}
                      >
                        Full Watchlist →
                      </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {marketWatch.slice(0, 5).map(item => {
                        const topMarket = item.markets?.[0];
                        const modal = item.stats?.modal || topMarket?.modal || 0;
                        const min = item.stats?.min || topMarket?.min || 0;
                        const max = item.stats?.max || topMarket?.max || 0;
                        const advice = item.recommendation?.advice || 'HOLD';

                        return (
                          <div
                            key={item.commodity}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '12px 14px',
                              borderBottom: '1px solid var(--sand-200)'
                            }}
                          >
                            <div>
                              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink-900)' }}>
                                {item.commodity}
                              </div>
                              <div style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 2 }}>
                                {topMarket ? `${topMarket.market} (${topMarket.state})` : 'APMC Mandi'}
                              </div>
                            </div>

                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--green-700)', fontFamily: 'var(--font-display)' }}>
                                ₹{modal.toLocaleString('en-IN')}<span style={{ fontSize: 11, fontWeight: 500, color: 'var(--ink-400)' }}>/Qtl</span>
                              </div>
                              <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>
                                Range: ₹{min} – ₹{max}
                              </div>
                            </div>

                            <div>
                              <span style={{
                                padding: '3px 8px',
                                borderRadius: '6px',
                                fontSize: 11,
                                fontWeight: 700,
                                background: advice === 'SELL NOW' ? '#dcfce7' : advice === 'URGENT SELL' ? '#fee2e2' : '#fef9c3',
                                color: advice === 'SELL NOW' ? '#15803d' : advice === 'URGENT SELL' ? '#b91c1c' : '#a16207'
                              }}>
                                {advice}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Bottom Section: Direct Buyer / Seller Opportunities */}
                <div className="card" style={{ padding: 24 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                    <div>
                      <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink-900)' }}>
                        {user.role === 'farmer' ? 'Direct Commercial Procurement Inquiries' : 'Fresh Farmer Crop Supplies'}
                      </h3>
                      <p style={{ fontSize: 13, color: 'var(--ink-400)' }}>
                        Connect directly via phone or WhatsApp with 0% broker deductions
                      </p>
                    </div>
                    <button
                      onClick={() => setActiveTab('trade_leads')}
                      className="btn btn-sm btn-outline"
                    >
                      View All Leads ({tradeLeads.length})
                    </button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
                    {tradeLeads.slice(0, 3).map(lead => {
                      const title = user.role === 'farmer' ? lead.buyerName : lead.farmerName;
                      const phone = user.role === 'farmer' ? lead.buyerPhone : lead.farmerPhone;
                      const whatsapp = user.role === 'farmer' ? lead.buyerWhatsapp : lead.farmerWhatsapp;
                      const crops = user.role === 'farmer' ? lead.commoditiesNeeded?.join(', ') : lead.commodity;

                      return (
                        <div
                          key={lead.id}
                          style={{
                            background: '#fff',
                            border: '1px solid var(--sand-300)',
                            borderRadius: '12px',
                            padding: '16px 18px',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            gap: 12
                          }}
                        >
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink-900)' }}>
                                {title}
                              </span>
                              <span className="dash-badge-active" style={{ fontSize: 10 }}>
                                Verified
                              </span>
                            </div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--green-700)', marginTop: 4 }}>
                              Needs: {crops}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 4 }}>
                              Quantity: {lead.quantityNeeded || `${lead.quantity} ${lead.unit}`}
                              {lead.priceOffered && ` · Target: ${lead.priceOffered}`}
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: 8, paddingTop: 10, borderTop: '1px solid var(--sand-200)' }}>
                            <a href={`tel:${phone}`} style={{ flex: 1 }}>
                              <button className="btn btn-sm btn-primary w-full" style={{ justifyContent: 'center' }}>
                                📞 Call
                              </button>
                            </a>
                            {whatsapp && (
                              <a
                                href={`https://wa.me/91${whatsapp}?text=${encodeURIComponent(`Hello, I saw your listing on Farm2Future for ${crops}. I would like to discuss trade.`)}`}
                                target="_blank"
                                rel="noreferrer"
                                style={{ flex: 1 }}
                              >
                                <button
                                  className="btn btn-sm btn-outline w-full"
                                  style={{ justifyContent: 'center', borderColor: '#22c55e', color: '#15803d' }}
                                >
                                  💬 WhatsApp
                                </button>
                              </a>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* ─────────────────────────────────────────────────────────────────── */}
            {/* TAB 2: MY INVENTORY / MY POSTS                                     */}
            {/* ─────────────────────────────────────────────────────────────────── */}
            {activeTab === 'inventory' && (
              <div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 20,
                  flexWrap: 'wrap',
                  gap: 12
                }}>
                  <div>
                    <h3 style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink-900)' }}>
                      {user.role === 'farmer' ? 'My Listed Crop Inventory' : 'My Active Procurement Posts'}
                    </h3>
                    <p style={{ fontSize: 13, color: 'var(--ink-500)' }}>
                      Manage, update, and close your active listings directly
                    </p>
                  </div>
                  <button onClick={() => setShowModal(true)} className="btn btn-primary btn-sm">
                    {user.role === 'farmer' ? '+ Post New Crop Lot' : '+ Post New Requirement'}
                  </button>
                </div>

                {myItems.length === 0 ? (
                  <div className="card" style={{ padding: '60px 20px', textAlign: 'center' }}>
                    <div style={{ fontSize: 44, marginBottom: 16 }}>📦</div>
                    <h3 style={{ fontSize: 18, color: 'var(--ink-800)', marginBottom: 8 }}>
                      No active listings found
                    </h3>
                    <p style={{ fontSize: 14, color: 'var(--ink-500)', maxWidth: 400, margin: '0 auto 20px' }}>
                      {user.role === 'farmer'
                        ? 'Publish your harvested or standing crops to receive direct trade calls and WhatsApp messages.'
                        : 'Post your crop purchase requirements with target quantities to source directly from farmers.'}
                    </p>
                    <button onClick={() => setShowModal(true)} className="btn btn-primary">
                      {user.role === 'farmer' ? 'Post a Crop for Sale' : 'Post Requirement'}
                    </button>
                  </div>
                ) : (
                  <div className="dash-table-container">
                    <table className="dash-table">
                      <thead>
                        <tr>
                          <th>Crop / Commodity</th>
                          <th>{user.role === 'farmer' ? 'Quantity & Unit' : 'Quantity Needed'}</th>
                          <th>{user.role === 'farmer' ? 'Asking Price' : 'Target Price'}</th>
                          {user.role === 'farmer' && <th>Total Lot Value</th>}
                          <th>Status</th>
                          <th>Date Posted</th>
                          <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {myItems.map(item => {
                          const lotVal = Number(item.quantity || 0) * Number(item.askingPrice || 0);
                          return (
                            <tr key={item.id}>
                              <td>
                                <div style={{ fontWeight: 700, color: 'var(--ink-900)' }}>
                                  {user.role === 'farmer' ? item.commodity : item.commoditiesNeeded?.join(', ')}
                                </div>
                                {item.variety && (
                                  <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>Variety: {item.variety}</div>
                                )}
                                {item.isPerishable && (
                                  <span className="dash-badge dash-badge-perishable" style={{ marginTop: 4 }}>
                                    Perishable ({item.shelfLifeDays || 3} days)
                                  </span>
                                )}
                              </td>
                              <td>
                                <span style={{ fontWeight: 600 }}>
                                  {user.role === 'farmer' ? `${item.quantity} ${item.unit}` : item.quantityNeeded}
                                </span>
                              </td>
                              <td>
                                <span style={{ fontWeight: 700, color: 'var(--green-700)' }}>
                                  {user.role === 'farmer' ? `₹${item.askingPrice?.toLocaleString()}/${item.unit}` : item.priceOffered}
                                </span>
                              </td>
                              {user.role === 'farmer' && (
                                <td>
                                  <span style={{ fontWeight: 700, color: 'var(--ink-800)' }}>
                                    ₹{lotVal.toLocaleString('en-IN')}
                                  </span>
                                </td>
                              )}
                              <td>
                                <span className={`dash-badge ${item.status === 'active' ? 'dash-badge-active' : 'dash-badge-closed'}`}>
                                  {item.status}
                                </span>
                              </td>
                              <td style={{ fontSize: 13, color: 'var(--ink-500)' }}>
                                {item.createdAt ? new Date(item.createdAt).toLocaleDateString('en-IN') : 'Recent'}
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                <div style={{ display: 'inline-flex', gap: 8 }}>
                                  <button
                                    onClick={() => handleCloseItem(item.id)}
                                    className="btn btn-sm"
                                    style={{
                                      background: '#fee2e2',
                                      color: '#991b1b',
                                      border: 'none',
                                      padding: '5px 12px',
                                      fontSize: 12,
                                      fontWeight: 600
                                    }}
                                  >
                                    Remove
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ─────────────────────────────────────────────────────────────────── */}
            {/* TAB 3: LIVE MANDI WATCHLIST                                        */}
            {/* ─────────────────────────────────────────────────────────────────── */}
            {activeTab === 'market_watch' && (
              <div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 20,
                  flexWrap: 'wrap',
                  gap: 12
                }}>
                  <div>
                    <h3 style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink-900)' }}>
                      Live APMC Mandi Watchlist
                    </h3>
                    <p style={{ fontSize: 13, color: 'var(--ink-500)' }}>
                      Official Agmarknet benchmark prices, best APMC destination, and sell/hold trend recommendations
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="text"
                      placeholder="Search crop in watchlist..."
                      value={searchFilter}
                      onChange={e => setSearchFilter(e.target.value)}
                      className="form-input"
                      style={{ padding: '7px 14px', fontSize: 13, width: 220 }}
                    />
                    <Link to="/prices">
                      <button className="btn btn-sm btn-outline">
                        All 217 Crops →
                      </button>
                    </Link>
                  </div>
                </div>

                <div className="dash-table-container">
                  <table className="dash-table">
                    <thead>
                      <tr>
                        <th>Commodity</th>
                        <th>Today's Modal Rate</th>
                        <th>Day's Price Range</th>
                        <th>Best Paying Mandi</th>
                        <th>Recommendation</th>
                        <th style={{ textAlign: 'right' }}>Market Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {marketWatch
                        .filter(m => !searchFilter || m.commodity?.toLowerCase().includes(searchFilter.toLowerCase()))
                        .map(item => {
                          const topMarket = item.markets?.[0];
                          const modal = item.stats?.modal || topMarket?.modal || 0;
                          const min = item.stats?.min || topMarket?.min || 0;
                          const max = item.stats?.max || topMarket?.max || 0;
                          const advice = item.recommendation?.advice || 'HOLD';
                          const bestMarketName = item.recommendation?.bestMarket || topMarket?.market || 'APMC';
                          const bestDistrict = item.recommendation?.bestDistrict || topMarket?.district || '';

                          return (
                            <tr key={item.commodity}>
                              <td>
                                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink-900)' }}>
                                  {item.commodity}
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>
                                  {item.perishable ? '⚡ Perishable Crop' : '📦 Standard Commodity'}
                                </div>
                              </td>
                              <td>
                                <div style={{ fontWeight: 800, fontSize: 17, color: 'var(--green-700)', fontFamily: 'var(--font-display)' }}>
                                  ₹{modal.toLocaleString('en-IN')}<span style={{ fontSize: 11, fontWeight: 500, color: 'var(--ink-400)' }}>/Qtl</span>
                                </div>
                              </td>
                              <td style={{ fontSize: 13, color: 'var(--ink-600)' }}>
                                ₹{min.toLocaleString()} – ₹{max.toLocaleString()}
                              </td>
                              <td>
                                <div style={{ fontWeight: 600, color: 'var(--ink-800)', fontSize: 13 }}>
                                  {bestMarketName}
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>
                                  {bestDistrict ? `${bestDistrict}, ` : ''}{item.markets?.[0]?.state || 'India'}
                                </div>
                              </td>
                              <td>
                                <span style={{
                                  padding: '4px 10px',
                                  borderRadius: '6px',
                                  fontSize: 11,
                                  fontWeight: 700,
                                  background: advice === 'SELL NOW' ? '#dcfce7' : advice === 'URGENT SELL' ? '#fee2e2' : '#fef9c3',
                                  color: advice === 'SELL NOW' ? '#15803d' : advice === 'URGENT SELL' ? '#b91c1c' : '#a16207'
                                }}>
                                  {advice}
                                </span>
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                <Link to={`/prices?crop=${encodeURIComponent(item.commodity)}`}>
                                  <button
                                    className="btn btn-sm btn-outline"
                                    style={{ padding: '5px 12px', fontSize: 12, fontWeight: 600 }}
                                  >
                                    View APMCs →
                                  </button>
                                </Link>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ─────────────────────────────────────────────────────────────────── */}
            {/* TAB 4: DIRECT TRADE LEADS                                          */}
            {/* ─────────────────────────────────────────────────────────────────── */}
            {activeTab === 'trade_leads' && (
              <div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 20,
                  flexWrap: 'wrap',
                  gap: 12
                }}>
                  <div>
                    <h3 style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink-900)' }}>
                      {user.role === 'farmer' ? 'Direct Commercial Buyer Inquiries' : 'Verified Farmer Crop Offerings'}
                    </h3>
                    <p style={{ fontSize: 13, color: 'var(--ink-500)' }}>
                      Verified contact numbers and instant WhatsApp links for direct negotiation
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="text"
                      placeholder="Filter leads by crop..."
                      value={searchFilter}
                      onChange={e => setSearchFilter(e.target.value)}
                      className="form-input"
                      style={{ padding: '7px 14px', fontSize: 13, width: 220 }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 18 }}>
                  {tradeLeads
                    .filter(lead => {
                      if (!searchFilter) return true;
                      const text = user.role === 'farmer'
                        ? (lead.commoditiesNeeded?.join(' ') || '') + lead.buyerName
                        : lead.commodity + lead.farmerName;
                      return text.toLowerCase().includes(searchFilter.toLowerCase());
                    })
                    .map(lead => {
                      const title = user.role === 'farmer' ? lead.buyerName : lead.farmerName;
                      const phone = user.role === 'farmer' ? lead.buyerPhone : lead.farmerPhone;
                      const whatsapp = user.role === 'farmer' ? lead.buyerWhatsapp : lead.farmerWhatsapp;
                      const crops = user.role === 'farmer' ? lead.commoditiesNeeded?.join(', ') : lead.commodity;

                      return (
                        <div
                          key={lead.id}
                          className="card"
                          style={{
                            padding: 20,
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            gap: 14
                          }}
                        >
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--ink-900)' }}>
                                {title}
                              </span>
                              <span className="dash-badge dash-badge-active">
                                Verified
                              </span>
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 2 }}>
                              {user.role === 'farmer'
                                ? (lead.buyerType || 'Bulk Procurement Agency')
                                : `Producer · ${lead.district || ''}, ${lead.state || ''}`}
                            </div>

                            <div style={{ margin: '12px 0 8px' }}>
                              <div style={{ fontSize: 12, color: 'var(--ink-500)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                {user.role === 'farmer' ? 'Required Commodities' : 'Available Produce'}
                              </div>
                              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--green-700)', marginTop: 2 }}>
                                {crops}
                              </div>
                            </div>

                            <div style={{ fontSize: 13, color: 'var(--ink-600)', background: 'var(--sand-50)', padding: '8px 12px', borderRadius: '8px' }}>
                              <span>📦 Volume: <strong>{lead.quantityNeeded || `${lead.quantity} ${lead.unit}`}</strong></span>
                              {lead.priceOffered && <span> · Target: <strong>{lead.priceOffered}</strong></span>}
                              {lead.askingPrice && <span> · Rate: <strong>₹{lead.askingPrice}/{lead.unit}</strong></span>}
                            </div>

                            {lead.description && (
                              <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 10, lineHeight: 1.5 }}>
                                "{lead.description}"
                              </div>
                            )}
                          </div>

                          <div style={{ display: 'flex', gap: 8, paddingTop: 12, borderTop: '1px solid var(--sand-200)' }}>
                            <a href={`tel:${phone}`} style={{ flex: 1 }}>
                              <button className="btn btn-sm btn-primary w-full" style={{ justifyContent: 'center' }}>
                                📞 Call Direct
                              </button>
                            </a>
                            {whatsapp && (
                              <a
                                href={`https://wa.me/91${whatsapp}?text=${encodeURIComponent(`Hello, I saw your requirements on Farm2Future for ${crops}. Let's discuss pricing and dispatch.`)}`}
                                target="_blank"
                                rel="noreferrer"
                                style={{ flex: 1 }}
                              >
                                <button
                                  className="btn btn-sm btn-outline w-full"
                                  style={{ justifyContent: 'center', borderColor: '#22c55e', color: '#15803d' }}
                                >
                                  💬 WhatsApp
                                </button>
                              </a>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────────────── */}
      {/* INTEGRATED "+ POST" MODAL (Farmer / Buyer)                              */}
      {/* ─────────────────────────────────────────────────────────────────────── */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h2 className="modal-title" style={{ fontSize: 20 }}>
                {user.role === 'farmer' ? '🌾 Post Crop for Sale' : '🏢 Post Crop Requirement'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                style={{ background: 'none', border: 'none', fontSize: 20, color: 'var(--ink-400)', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>
            <p className="modal-subtitle" style={{ marginBottom: 20 }}>
              {user.role === 'farmer'
                ? 'Your crop will instantly appear to verified agro-industries and bulk buyers across India.'
                : 'Farmers and suppliers will contact you directly with competitive offers.'}
            </p>

            {user.role === 'farmer' ? (
              <form onSubmit={handleFarmerSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">Crop / Commodity *</label>
                  <select
                    className="form-input"
                    value={farmerForm.commodity}
                    onChange={e => setFarmerForm({ ...farmerForm, commodity: e.target.value })}
                    required
                  >
                    <option value="">-- Select Crop --</option>
                    {commodities.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>

                  {/* Quick selection chips */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                    {QUICK_COMMODITIES.map(crop => (
                      <button
                        key={crop}
                        type="button"
                        onClick={() => setFarmerForm({ ...farmerForm, commodity: crop })}
                        style={{
                          background: farmerForm.commodity === crop ? 'var(--green-600)' : 'var(--sand-200)',
                          color: farmerForm.commodity === crop ? '#fff' : 'var(--ink-700)',
                          border: 'none',
                          borderRadius: 100,
                          padding: '3px 10px',
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        {crop}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label className="form-label">Variety (Optional)</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. Hybrid, Desi, Red"
                      value={farmerForm.variety}
                      onChange={e => setFarmerForm({ ...farmerForm, variety: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Shelf Life (Days)</label>
                    <input
                      type="number"
                      className="form-input"
                      placeholder="e.g. 3 (for perishables)"
                      value={farmerForm.shelfLifeDays}
                      onChange={e => setFarmerForm({ ...farmerForm, shelfLifeDays: e.target.value })}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label className="form-label">Quantity *</label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        type="number"
                        className="form-input"
                        placeholder="e.g. 50"
                        value={farmerForm.quantity}
                        onChange={e => setFarmerForm({ ...farmerForm, quantity: e.target.value })}
                        required
                        style={{ flex: 1 }}
                      />
                      <select
                        className="form-input"
                        style={{ width: 88 }}
                        value={farmerForm.unit}
                        onChange={e => setFarmerForm({ ...farmerForm, unit: e.target.value })}
                      >
                        <option value="Qtl">Qtl</option>
                        <option value="Tonnes">Tonnes</option>
                        <option value="Kgs">Kgs</option>
                        <option value="Bags">Bags</option>
                        <option value="Crates">Crates</option>
                      </select>
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Asking Price (₹/{farmerForm.unit}) *</label>
                    <input
                      type="number"
                      className="form-input"
                      placeholder="e.g. 1800"
                      value={farmerForm.askingPrice}
                      onChange={e => setFarmerForm({ ...farmerForm, askingPrice: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Quality Notes / Description</label>
                  <textarea
                    className="form-input"
                    rows={2}
                    placeholder="e.g. Fresh harvest from this morning, Grade A quality, ready for pickup."
                    value={farmerForm.description}
                    onChange={e => setFarmerForm({ ...farmerForm, description: e.target.value })}
                  />
                </div>

                <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="btn btn-outline"
                    style={{ flex: 1 }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={submitting}
                    style={{ flex: 1, justifyContent: 'center' }}
                  >
                    {submitting ? 'Posting...' : 'Publish Listing'}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleBuyerSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">Select Commodities Needed *</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {QUICK_COMMODITIES.map(crop => {
                      const selected = buyerForm.commoditiesNeeded.includes(crop);
                      return (
                        <button
                          key={crop}
                          type="button"
                          onClick={() => toggleBuyerCrop(crop)}
                          style={{
                            background: selected ? 'var(--green-600)' : 'var(--sand-200)',
                            color: selected ? '#fff' : 'var(--ink-700)',
                            border: 'none',
                            borderRadius: 100,
                            padding: '5px 12px',
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          {selected ? '✓ ' : '+ '}{crop}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label className="form-label">Quantity Needed *</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. 500 Qtl or 20 Tonnes"
                      value={buyerForm.quantityNeeded}
                      onChange={e => setBuyerForm({ ...buyerForm, quantityNeeded: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Offered Price / Rate</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. Market Rate, ₹1,800/Qtl"
                      value={buyerForm.priceOffered}
                      onChange={e => setBuyerForm({ ...buyerForm, priceOffered: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Specifications / Requirements *</label>
                  <textarea
                    className="form-input"
                    rows={3}
                    placeholder="e.g. Need high grade dry onion for food processing. Immediate delivery to factory warehouse."
                    value={buyerForm.description}
                    onChange={e => setBuyerForm({ ...buyerForm, description: e.target.value })}
                    required
                  />
                </div>

                <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="btn btn-outline"
                    style={{ flex: 1 }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={submitting}
                    style={{ flex: 1, justifyContent: 'center' }}
                  >
                    {submitting ? 'Posting...' : 'Post Requirement'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
