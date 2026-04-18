const request = require('supertest');

// Mock fetch globally before requiring server
global.fetch = jest.fn();
process.env.GOOGLE_MAPS_API_KEY = 'test-key-123';
process.env.ALLOWED_ORIGINS = 'http://localhost:3000';

const app = require('./server');

// ─── MOCK DATA ────────────────────────────────────────────
const mockTextSearchResponse = {
  status: 'OK',
  results: [
    { place_id: 'place_001' },
    { place_id: 'place_002' }
  ],
  next_page_token: null
};

const mockPlaceDetail = (hasWebsite = true) => ({
  status: 'OK',
  result: {
    name: 'Test Restaurant',
    formatted_phone_number: '+92-300-1234567',
    website: hasWebsite ? 'https://testrestaurant.pk' : null,
    rating: 4.2,
    user_ratings_total: 120,
    formatted_address: '12 F-7 Markaz, Islamabad',
    types: ['restaurant', 'food', 'establishment']
  }
});

// ─── HEALTH CHECK ─────────────────────────────────────────
describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.timestamp).toBeDefined();
  });
});

// ─── SEARCH VALIDATION ────────────────────────────────────
describe('GET /api/search - validation', () => {
  it('returns 400 when keyword is missing', async () => {
    const res = await request(app).get('/api/search?city=Islamabad');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/keyword/i);
  });

  it('returns 400 when city is missing', async () => {
    const res = await request(app).get('/api/search?keyword=restaurants');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/city/i);
  });

  it('returns 400 when both are missing', async () => {
    const res = await request(app).get('/api/search');
    expect(res.status).toBe(400);
  });
});

// ─── SEARCH SUCCESS ───────────────────────────────────────
describe('GET /api/search - success', () => {
  beforeEach(async () => {
    global.fetch.mockReset();
    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockTextSearchResponse
      })
      .mockResolvedValue({
        ok: true,
        json: async () => mockPlaceDetail(true)
      });
    // Clear cache before each test to avoid cross-test interference
    await request(app).delete('/api/cache');
  });

  it('returns results array with correct shape', async () => {
    const res = await request(app).get('/api/search?keyword=restaurants&city=Islamabad');
    expect(res.status).toBe(200);
    expect(res.body.results).toBeDefined();
    expect(Array.isArray(res.body.results)).toBe(true);
    expect(res.body.total).toBe(2);
  });

  it('each result has required fields', async () => {
    const res = await request(app).get('/api/search?keyword=restaurants&city=Islamabad');
    const result = res.body.results[0];
    expect(result).toHaveProperty('name');
    expect(result).toHaveProperty('phone');
    expect(result).toHaveProperty('website');
    expect(result).toHaveProperty('rating');
    expect(result).toHaveProperty('reviews');
    expect(result).toHaveProperty('address');
    expect(result).toHaveProperty('category');
    expect(result).toHaveProperty('isHotLead');
  });

  it('correctly identifies hot leads (no website)', async () => {
    global.fetch.mockReset();
    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => mockTextSearchResponse })
      .mockResolvedValue({ ok: true, json: async () => mockPlaceDetail(false) });

    const res = await request(app).get('/api/search?keyword=restaurants&city=Islamabad');
    expect(res.body.results[0].isHotLead).toBe(true);
    expect(res.body.results[0].website).toBe('');
  });

  it('returns cached: true on second identical search', async () => {
    const first = await request(app).get('/api/search?keyword=cafes&city=Islamabad');
    expect(first.body.cached).toBe(false);

    const second = await request(app).get('/api/search?keyword=cafes&city=Islamabad');
    expect(second.body.cached).toBe(true);
  });
});

// ─── SEARCH ERROR HANDLING ────────────────────────────────
describe('GET /api/search - error handling', () => {
  it('returns 500 when Google API key is invalid', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'REQUEST_DENIED', error_message: 'API key invalid' })
    });

    const res = await request(app).get('/api/search?keyword=gyms&city=Islamabad');
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/api key invalid/i);
  });

  it('returns 500 when Google API is unreachable', async () => {
    global.fetch.mockRejectedValueOnce(new Error('Network error'));

    const res = await request(app).get('/api/search?keyword=hotels&city=Islamabad');
    expect(res.status).toBe(500);
    expect(res.body.error).toBeDefined();
  });
});

// ─── CACHE ROUTES ─────────────────────────────────────────
describe('Cache management', () => {
  it('GET /api/cache/stats returns stats object', async () => {
    const res = await request(app).get('/api/cache/stats');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('hits');
    expect(res.body).toHaveProperty('misses');
  });

  it('DELETE /api/cache clears the cache', async () => {
    const res = await request(app).delete('/api/cache');
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/cleared/i);
  });
});

// ─── INPUT SANITIZATION ───────────────────────────────────
describe('Input sanitization', () => {
  beforeEach(() => {
    global.fetch.mockReset();
    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'OK', results: [], next_page_token: null }) });
  });

  it('strips HTML tags from keyword', async () => {
    const res = await request(app).get('/api/search?keyword=<script>alert(1)</script>&city=Islamabad');
    expect(res.status).toBe(200);
  });

  it('truncates very long inputs to 100 chars', async () => {
    const longStr = 'a'.repeat(200);
    const res = await request(app).get(`/api/search?keyword=${longStr}&city=Islamabad`);
    expect(res.status).toBe(200);
  });
});
