const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const NodeCache = require('node-cache');
const path = require('path');
require('dotenv').config();

const app = express();
const cache = new NodeCache({ stdTTL: 3600 }); // cache results 1 hour

// ─── SECURITY MIDDLEWARE ──────────────────────────────────
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json());

// CORS - only allow your frontend domain
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',');
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  }
}));

// Rate limiting - 30 searches per hour per IP
const searchLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  message: { error: 'Too many searches. Please wait before trying again.' }
});

// ─── VALIDATE ENV ─────────────────────────────────────────
const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY || 'AIzaSyB-PdxC7nneYyvgLU2q7l9dc_5ulPjF5U0';
if (!GOOGLE_API_KEY) {
  console.error('ERROR: GOOGLE_MAPS_API_KEY not set in .env file');
  process.exit(1);
}

// ─── HELPERS ──────────────────────────────────────────────
async function googleFetch(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Google API HTTP ${resp.status}`);
  const data = await resp.json();
  if (data.status === 'REQUEST_DENIED') throw new Error(data.error_message || 'API key invalid');
  if (data.status === 'INVALID_REQUEST') throw new Error('Invalid request parameters');
  return data;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function formatCategory(types = []) {
  const skip = ['point_of_interest', 'establishment', 'food', 'store'];
  const clean = types.filter(t => !skip.includes(t));
  return clean[0] ? clean[0].replace(/_/g, ' ') : 'business';
}

async function getPlaceDetail(placeId) {
  const fields = 'name,formatted_phone_number,website,rating,user_ratings_total,formatted_address,types';
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=${fields}&key=${GOOGLE_API_KEY}`;
  const data = await googleFetch(url);
  const r = data.result || {};
  return {
    name: r.name || '—',
    phone: r.formatted_phone_number || '',
    website: r.website || '',
    rating: r.rating || 0,
    reviews: r.user_ratings_total || 0,
    address: r.formatted_address || '—',
    category: formatCategory(r.types || []),
    isHotLead: !r.website || r.website === ''
  };
}

// ─── ROUTES ───────────────────────────────────────────────

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, '../frontend')));

// Main search endpoint
app.get('/api/search', searchLimiter, async (req, res) => {
  const { keyword, city } = req.query;

  if (!keyword || !city) {
    return res.status(400).json({ error: 'keyword and city are required' });
  }

  // Sanitize inputs
  const safeKeyword = String(keyword).slice(0, 100).replace(/[<>]/g, '');
  const safeCity = String(city).slice(0, 100).replace(/[<>]/g, '');
  const query = `${safeKeyword} ${safeCity}`;

  // Check cache first
  const cacheKey = `search:${query.toLowerCase().trim()}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    console.log(`[CACHE HIT] ${query}`);
    return res.json({ results: cached, cached: true, total: cached.length });
  }

  console.log(`[SEARCH] ${query}`);

  try {
    const allPlaces = [];
    let nextPageToken = null;
    let page = 0;

    do {
      let url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${GOOGLE_API_KEY}`;
      if (nextPageToken) {
        url += `&pagetoken=${nextPageToken}`;
        await sleep(2000); // required by Google API
      }

      const data = await googleFetch(url);

      // Fetch details for each place in parallel (batches of 5)
      const places = data.results || [];
      for (let i = 0; i < places.length; i += 5) {
        const batch = places.slice(i, i + 5);
        const details = await Promise.all(batch.map(p => getPlaceDetail(p.place_id)));
        allPlaces.push(...details);
      }

      nextPageToken = data.next_page_token || null;
      page++;
    } while (nextPageToken && page < 3);

    // Cache the results
    cache.set(cacheKey, allPlaces);

    console.log(`[DONE] ${query} → ${allPlaces.length} results`);
    res.json({ results: allPlaces, cached: false, total: allPlaces.length });

  } catch (err) {
    console.error(`[ERROR] ${query}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// Cache stats (admin)
app.get('/api/cache/stats', (req, res) => {
  res.json(cache.getStats());
});

// Clear cache (admin)
app.delete('/api/cache', (req, res) => {
  cache.flushAll();
  res.json({ message: 'Cache cleared' });
});

// Fallback to serve index.html for unknown routes (SPA support)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'), (err) => {
    if (err) res.sendFile(path.join(__dirname, '../frontend', 'index.html'));
  });
});

// ─── START ────────────────────────────────────────────────
if (require.main === module) {
  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => {
    console.log(`LeadHunter backend running on http://localhost:${PORT}`);
    console.log(`API key loaded: ${GOOGLE_API_KEY ? 'YES ✓' : 'NO ✗'}`);
  });
}

module.exports = app;
