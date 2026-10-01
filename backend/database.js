// ─────────────────────────────────────────────────────────────────────────────
// database.js  —  Simple file-based persistent storage
//
// Each collection is saved as a separate JSON file in /backend/data/db/
//   users.json            → farmers and buyer accounts
//   farmer_listings.json  → crops posted for sale by farmers
//   buyer_posts.json      → crop requirements posted by companies/buyers
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const fs   = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_DIR = path.join(__dirname, 'data', 'db');
try {
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
} catch (e) {
  console.warn('Could not create DB_DIR, using in-memory only', e.message);
}

// ── Generic read / write ─────────────────────────────────────────────────────
function readCollection(name) {
  const file = path.join(DB_DIR, `${name}.json`);
  if (!fs.existsSync(file)) return [];
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')); }
  catch { return []; }
}

function writeCollection(name, data) {
  try {
    const file = path.join(DB_DIR, `${name}.json`);
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch (e) {
    console.warn(`Write collection ${name} error:`, e.message);
  }
}

// ── Collection class ─────────────────────────────────────────────────────────
class Collection {
  constructor(name) {
    this.name = name;
    this._data = readCollection(name);
  }

  all()                     { return this._data; }
  find(predFn)              { return this._data.filter(predFn); }
  findOne(predFn)           { return this._data.find(predFn) || null; }
  findById(id)              { return this._data.find(r => r.id === id) || null; }

  insert(record) {
    this._data.push(record);
    this._save();
    return record;
  }

  update(id, changes) {
    const idx = this._data.findIndex(r => r.id === id);
    if (idx === -1) return null;
    this._data[idx] = { ...this._data[idx], ...changes, updatedAt: new Date().toISOString() };
    this._save();
    return this._data[idx];
  }

  delete(id) {
    const before = this._data.length;
    this._data = this._data.filter(r => r.id !== id);
    this._save();
    return this._data.length < before;
  }

  count() { return this._data.length; }

  _save() { writeCollection(this.name, this._data); }
}

const users          = new Collection('users');
const farmerListings = new Collection('farmer_listings');
const buyerPosts     = new Collection('buyer_posts');

// ── Seed demo users only if empty ───────────────────────────────────────────
if (users.count() === 0) {
  users.insert({
    id: 'u_demo_farmer',
    name: 'Ramesh Kumar',
    email: 'farmer@demo.com',
    password: bcrypt.hashSync('demo123', 10),
    role: 'farmer',
    phone: '9876543210',
    whatsapp: '9876543210',
    district: 'Belagavi',
    state: 'Karnataka',
    village: 'Shiraguppi',
    crops_grown: ['Tomato', 'Onion', 'Chilli'],
    cropsGrown: ['Tomato', 'Onion', 'Chilli'],
    createdAt: new Date().toISOString(),
  });
  users.insert({
    id: 'u_demo_buyer',
    name: 'FreshMart Foods Pvt Ltd',
    email: 'company@demo.com',
    password: bcrypt.hashSync('demo123', 10),
    role: 'buyer',
    phone: '9988776655',
    whatsapp: '9988776655',
    company_name: 'FreshMart Foods Pvt Ltd',
    companyName: 'FreshMart Foods Pvt Ltd',
    company_type: 'Food Processing',
    companyType: 'Food Processing',
    gst_number: '29AABCF1234D1Z5',
    gstNumber: '29AABCF1234D1Z5',
    district: 'Bengaluru Urban',
    state: 'Karnataka',
    address: '45 Industrial Area, Peenya, Bengaluru',
    crops_needed: ['Tomato', 'Onion', 'Potato'],
    cropsNeeded: ['Tomato', 'Onion', 'Potato'],
    description: 'We process and export vegetables. Looking for consistent quality bulk suppliers.',
    verified: true,
    createdAt: new Date().toISOString(),
  });
  console.log('   🌱 Demo users seeded (farmer@demo.com & company@demo.com / demo123)');
}

// ── Seed demo farmer listings only if empty ─────────────────────────────────
if (farmerListings.count() === 0) {
  farmerListings.insert({
    id: 'fl_demo_1',
    farmerId: 'u_demo_farmer',
    farmer_id: 'u_demo_farmer',
    farmerName: 'Ramesh Kumar',
    farmer_name: 'Ramesh Kumar',
    farmerPhone: '9876543210',
    farmer_phone: '9876543210',
    farmerWhatsapp: '9876543210',
    farmer_whatsapp: '9876543210',
    farmerVillage: 'Shiraguppi',
    farmer_village: 'Shiraguppi',
    district: 'Belagavi',
    state: 'Karnataka',
    commodity: 'Tomato',
    variety: 'Hybrid',
    quantity: 50,
    unit: 'Qtl',
    askingPrice: 1800,
    asking_price: 1800,
    isPerishable: true,
    is_perishable: true,
    shelfLifeDays: 3,
    shelf_life_days: 3,
    description: 'Fresh Grade A tomatoes, harvested this morning. Immediate sale needed.',
    status: 'active',
    createdAt: new Date(Date.now() - 3_600_000).toISOString(),
  });
  farmerListings.insert({
    id: 'fl_demo_2',
    farmerId: 'u_demo_farmer',
    farmer_id: 'u_demo_farmer',
    farmerName: 'Suresh Patil',
    farmer_name: 'Suresh Patil',
    farmerPhone: '9844001122',
    farmer_phone: '9844001122',
    farmerWhatsapp: '9844001122',
    farmer_whatsapp: '9844001122',
    farmerVillage: 'Kalaghatagi',
    farmer_village: 'Kalaghatagi',
    district: 'Dharwad',
    state: 'Karnataka',
    commodity: 'Onion',
    variety: 'Red Medium',
    quantity: 200,
    unit: 'Qtl',
    askingPrice: 1500,
    asking_price: 1500,
    isPerishable: false,
    is_perishable: false,
    shelfLifeDays: 30,
    shelf_life_days: 30,
    description: 'Red onion, medium size, well dried, ready for transport.',
    status: 'active',
    createdAt: new Date(Date.now() - 86_400_000).toISOString(),
  });
  console.log('   🌾 Demo farmer listings seeded');
}

// ── Seed demo buyer posts only if empty ─────────────────────────────────────
if (buyerPosts.count() === 0) {
  buyerPosts.insert({
    id: 'bp_demo_1',
    buyerId: 'u_demo_buyer',
    buyer_id: 'u_demo_buyer',
    buyerName: 'FreshMart Foods Pvt Ltd',
    buyer_name: 'FreshMart Foods Pvt Ltd',
    buyerPhone: '9988776655',
    buyer_phone: '9988776655',
    buyerWhatsapp: '9988776655',
    buyer_whatsapp: '9988776655',
    buyerType: 'Food Processing Company',
    buyer_type: 'Food Processing Company',
    verified: true,
    commoditiesNeeded: ['Tomato', 'Onion', 'Potato'],
    commodities_needed: ['Tomato', 'Onion', 'Potato'],
    quantityNeeded: '500 Qtl/month',
    quantity_needed: '500 Qtl/month',
    priceOffered: 'Market rate + 5%',
    price_offered: 'Market rate + 5%',
    description: 'Regular bulk buyer. Advance payment guaranteed. We arrange transport from your farm.',
    state: 'Karnataka',
    status: 'active',
    createdAt: new Date().toISOString(),
  });
  buyerPosts.insert({
    id: 'bp_demo_2',
    buyerId: 'bp_external_1',
    buyer_id: 'bp_external_1',
    buyerName: 'Agro Spice Industries Ltd',
    buyer_name: 'Agro Spice Industries Ltd',
    buyerPhone: '9977665544',
    buyer_phone: '9977665544',
    buyerWhatsapp: '9977665544',
    buyer_whatsapp: '9977665544',
    buyerType: 'Spice Industry',
    buyer_type: 'Spice Industry',
    verified: true,
    commoditiesNeeded: ['Green Chilli', 'Turmeric', 'Ginger(Green)', 'Coriander'],
    commodities_needed: ['Green Chilli', 'Turmeric', 'Ginger(Green)', 'Coriander'],
    quantityNeeded: '1000 Qtl/month',
    quantity_needed: '1000 Qtl/month',
    priceOffered: '₹5000 - ₹8000 per Qtl',
    price_offered: '₹5000 - ₹8000 per Qtl',
    description: 'Spice processing plant. Long-term contracts available. Quality grading done at our facility.',
    state: 'Karnataka',
    status: 'active',
    createdAt: new Date().toISOString(),
  });
  buyerPosts.insert({
    id: 'bp_demo_3',
    buyerId: 'bp_external_2',
    buyer_id: 'bp_external_2',
    buyerName: 'Karnataka Starch & Chemicals',
    buyer_name: 'Karnataka Starch & Chemicals',
    buyerPhone: '9966554433',
    buyer_phone: '9966554433',
    buyerWhatsapp: '9966554433',
    buyer_whatsapp: '9966554433',
    buyerType: 'Processing Industry',
    buyer_type: 'Processing Industry',
    verified: true,
    commoditiesNeeded: ['Potato', 'Maize', 'Sorghum'],
    commodities_needed: ['Potato', 'Maize', 'Sorghum'],
    quantityNeeded: '2000 Qtl/month',
    quantity_needed: '2000 Qtl/month',
    priceOffered: 'Market rate + 5% premium',
    price_offered: 'Market rate + 5% premium',
    description: 'Industrial starch manufacturer. Farm gate pickup available. Weigh slip provided.',
    state: 'Karnataka',
    status: 'active',
    createdAt: new Date().toISOString(),
  });
  buyerPosts.insert({
    id: 'bp_demo_4',
    buyerId: 'bp_external_3',
    buyer_id: 'bp_external_3',
    buyerName: 'BigBasket Fresh Procurement',
    buyer_name: 'BigBasket Fresh Procurement',
    buyerPhone: '9900887766',
    buyer_phone: '9900887766',
    buyerWhatsapp: '9900887766',
    buyer_whatsapp: '9900887766',
    buyerType: 'Retail Chain',
    buyer_type: 'Retail Chain',
    verified: true,
    commoditiesNeeded: ['Tomato', 'Onion', 'Cabbage', 'Cauliflower', 'Beans', 'Carrot'],
    commodities_needed: ['Tomato', 'Onion', 'Cabbage', 'Cauliflower', 'Beans', 'Carrot'],
    quantityNeeded: '100 - 5000 Qtl/month',
    quantity_needed: '100 - 5000 Qtl/month',
    priceOffered: 'Market rate',
    price_offered: 'Market rate',
    description: 'Online grocery. Need Grade A produce with consistent supply. Pan-India sourcing active.',
    state: 'All India',
    status: 'active',
    createdAt: new Date().toISOString(),
  });
  console.log('   🏢 Demo buyer posts seeded');
}

module.exports = { users, farmerListings, buyerPosts };
