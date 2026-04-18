# LeadHunter 🎯

Find local businesses on Google Maps, filter hot leads (no website), export to CSV.

## Quick Start (5 minutes)

### 1. Get a Google Maps API Key
- Go to https://console.cloud.google.com
- Create a project → Enable **Places API**
- Create an API key → Copy it

### 2. Set Up the Backend
```bash
cd backend
npm install
cp .env.example .env
# Open .env and paste your Google Maps API key
npm start
```
Backend runs on http://localhost:4000

### 3. Open the Frontend
Open `frontend/index.html` in your browser.
That's it — search for leads!

---

## Run with Docker (Recommended)

```bash
# Copy and fill in your API key
cp backend/.env.example .env

# Start everything
docker-compose up --build
```

Open `frontend/index.html` in your browser.

---

## Run Tests

```bash
cd backend
npm test
# or watch mode:
npm run test:watch
```

---

## Project Structure

```
leadhunter/
├── backend/
│   ├── server.js          # Express API proxy (API key lives here)
│   ├── package.json
│   └── .env.example       # Copy to .env and add your key
├── frontend/
│   └── index.html         # The UI (no API key here — secure!)
├── tests/
│   └── server.test.js     # Unit + integration tests
├── .github/
│   └── workflows/
│       └── ci.yml         # GitHub Actions CI/CD pipeline
├── Dockerfile
├── docker-compose.yml
└── README.md
```

---

## Deploy to Production (Free)

### Backend → Render.com
1. Push this repo to GitHub
2. Go to https://render.com → New Web Service → connect your repo
3. Set environment variables: `GOOGLE_MAPS_API_KEY`, `ALLOWED_ORIGINS`
4. Deploy

### Frontend → Netlify
1. Go to https://netlify.com → drag and drop the `frontend/` folder
2. Update `API_BASE` in `frontend/index.html` to your Render URL
3. Done — live in 30 seconds

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /health | Health check |
| GET | /api/search?keyword=&city= | Search businesses |
| GET | /api/cache/stats | Cache statistics |
| DELETE | /api/cache | Clear cache |

---

## Security Features
- API key stored server-side only (never in browser)
- Rate limiting: 30 searches/hour per IP
- Helmet.js security headers
- CORS restricted to allowed origins
- Input sanitization (XSS protection)
- 1-hour result caching (saves API credits)
- Non-root Docker user

---

## What's a Hot Lead?
A business with **no website** is your best prospect — they clearly need what you're selling.
Use the "No website only 🔥" filter and export those leads first.
