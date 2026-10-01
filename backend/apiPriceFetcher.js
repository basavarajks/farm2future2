// ─────────────────────────────────────────────────────────────────────────────
// apiPriceFetcher.js  —  Fetches live mandi prices from data.gov.in (Agmarknet)
//
// API:  https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070
// Free key: https://data.gov.in/user/me/api-keys
//
// Real field names returned by this API:
//   state, district, market, commodity, variety, grade,
//   arrival_date, min_price, max_price, modal_price
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const https = require('https');
const fs    = require('fs');
const path  = require('path');

const CACHE_FILE       = path.join(__dirname, 'data', 'api_cache.json');
const RESOURCE_ID      = '9ef84268-d588-465a-a308-a864a43d0070';
const API_HOST         = 'api.data.gov.in';
const LIMIT_PER_PAGE   = 1000;
const MAX_PAGES        = 15;           // 15 × 1000 = up to 15,000 records
const CACHE_HOURS      = 6;            // refresh every 6 hours

let _apiWorking = false;
let _lastCheckTime = null;
let _lastStatusMessage = 'Using bundled verified mandi dataset';

// ── Helper: today's date as DD/MM/YYYY ──────────────────────────────────────
function todayString() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

// ── Single HTTPS GET with timeout & graceful error handling ─────────────────
function httpGet(apiKey, offset, limit) {
  return new Promise((resolve, reject) => {
    const qs = new URLSearchParams({
      'api-key': apiKey,
      format:   'json',
      limit:    String(limit),
      offset:   String(offset),
    });

    const reqOptions = {
      hostname: API_HOST,
      path:     `/resource/${RESOURCE_ID}?${qs}`,
      method:   'GET',
      headers:  { Accept: 'application/json', 'User-Agent': 'Farm2Future/2.0' },
      timeout:  6000,
    };

    let timer = null;
    const req = https.request(reqOptions, res => {
      let raw = '';
      res.on('data', d => { raw += d; });
      res.on('end', () => {
        if (timer) clearTimeout(timer);
        if (res.statusCode === 401) return reject(new Error('API key invalid or expired'));
        if (res.statusCode === 429) return reject(new Error('API rate limit reached'));
        if (res.statusCode !== 200) return reject(new Error(`API responded with HTTP ${res.statusCode}`));
        try { resolve(JSON.parse(raw)); }
        catch { reject(new Error('API returned non-JSON response')); }
      });
    });

    req.on('error', err => {
      if (timer) clearTimeout(timer);
      reject(err);
    });

    timer = setTimeout(() => {
      req.destroy();
      reject(new Error('Connection timed out after 6s'));
    }, 6000);

    req.end();
  });
}

// ── Normalize one API record → our internal format ──────────────────────────
function normalize(r) {
  return {
    state:     String(r.state     || r.State     || '').trim(),
    district:  String(r.district  || r.District  || '').trim(),
    market:    String(r.market    || r.Market    || '').trim(),
    commodity: String(r.commodity || r.Commodity || '').trim(),
    variety:   String(r.variety   || r.Variety   || 'Other').trim(),
    grade:     String(r.grade     || r.Grade     || 'FAQ').trim(),
    date:      String(r.arrival_date || r.Arrival_Date || todayString()).trim(),
    min:       Math.round(parseFloat(r.min_price   || r.Min_Price   || r.min   || 0)),
    max:       Math.round(parseFloat(r.max_price   || r.Max_Price   || r.max   || 0)),
    modal:     Math.round(parseFloat(r.modal_price || r.Modal_Price || r.modal || 0)),
    source:    'live_api',
    file:      'data.gov.in',
  };
}

// ── Cache read — returns null if missing / expired / wrong date ──────────────
function readCache() {
  try {
    if (!fs.existsSync(CACHE_FILE)) return null;
    const saved   = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
    const ageHrs  = (Date.now() - (saved.fetchedAt || 0)) / 3_600_000;
    const today   = todayString();

    if (ageHrs > CACHE_HOURS) {
      console.log(`   🕐 API cache is ${ageHrs.toFixed(1)}h old — refreshing`);
      return null;
    }
    if (saved.dataDate && saved.dataDate !== today) {
      return null;
    }
    _apiWorking = true;
    _lastStatusMessage = `API cache active (${saved.records.length} records)`;
    return saved.records;
  } catch {
    return null;
  }
}

function writeCache(records) {
  try {
    const dates = records.map(r => r.date).filter(Boolean);
    const dataDate = dates.sort().reverse()[0] || todayString();
    fs.writeFileSync(CACHE_FILE, JSON.stringify({ fetchedAt: Date.now(), dataDate, records }));
    console.log(`   💾 Live API data cached (${records.length} records, date=${dataDate})`);
  } catch (e) {
    console.warn('   Cache write warning:', e.message);
  }
}

// ── Main fetch ───────────────────────────────────────────────────────────────
async function fetchLivePrices(apiKey) {
  _lastCheckTime = new Date().toISOString();
  if (!apiKey || apiKey.trim() === '') {
    _apiWorking = false;
    _lastStatusMessage = 'DATA_GOV_API_KEY not set — using local mandi database';
    return [];
  }

  // Try cache first
  const cached = readCache();
  if (cached) return cached;

  console.log('   🌐 Checking data.gov.in API status...');

  try {
    // Probe page 1
    const first = await httpGet(apiKey, 0, 1);
    const total = parseInt(first.total || first.count || first.recordsFiltered || '0', 10);

    if (total === 0) {
      _apiWorking = false;
      _lastStatusMessage = 'API returned 0 records for today';
      console.log('   ℹ️  API returned 0 records for today — using offline mandi dataset');
      return [];
    }

    const pages   = Math.min(Math.ceil(total / LIMIT_PER_PAGE), MAX_PAGES);
    const allRecs = [];

    for (let p = 0; p < pages; p++) {
      const offset = p * LIMIT_PER_PAGE;
      const result  = await httpGet(apiKey, offset, LIMIT_PER_PAGE);
      const records = result.records || result.data || result.fields || [];

      records.forEach(r => {
        const n = normalize(r);
        if (n.state && n.commodity && n.modal > 0) allRecs.push(n);
      });
    }

    if (allRecs.length === 0) {
      _apiWorking = false;
      _lastStatusMessage = 'API returned no valid prices';
      return [];
    }

    _apiWorking = true;
    _lastStatusMessage = `Live sync active (${allRecs.length} records)`;
    console.log(`   ✅ Live API connected: ${allRecs.length} records fetched`);
    writeCache(allRecs);
    return allRecs;

  } catch (err) {
    // Graceful fallback for network issues (ECONNREFUSED, ENOTFOUND, timeout, 401, etc.)
    _apiWorking = false;
    _lastStatusMessage = `Live API unreachable (${err.message}) — offline dataset active`;
    console.log(`   ℹ️ Live Agmarknet API unavailable (${err.message}) — fallback to bundled CSV dataset`);
    return [];
  }
}

// ── Auto-refresh every CACHE_HOURS ──────────────────────────────────────────
function startAutoRefresh(apiKey, onNewData) {
  if (!apiKey) return;
  const ms = CACHE_HOURS * 3_600_000;
  setInterval(async () => {
    try {
      try { fs.unlinkSync(CACHE_FILE); } catch {}
      const fresh = await fetchLivePrices(apiKey);
      if (fresh.length > 0 && onNewData) onNewData(fresh);
    } catch {
      // Keep running smoothly on local dataset
    }
  }, ms);
}

function getApiStatus() {
  return {
    isWorking: _apiWorking,
    lastChecked: _lastCheckTime,
    statusMessage: _lastStatusMessage,
  };
}

module.exports = { fetchLivePrices, startAutoRefresh, getApiStatus };
