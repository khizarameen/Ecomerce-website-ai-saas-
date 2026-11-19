# Ecomerce-website-ai-saas-

**StoreHub AI** is an Open Agentic Web e-commerce SaaS platform built with **React 19 + Vite + Tailwind CSS** on the frontend and **Django 5 + Django REST Framework + Multi-Agent Automation** on the backend, packaged for local development, **Docker Compose**, and **Vercel** full-stack deployment.

## Core Capabilities

- **Buyer Storefront & AI Shopping Consultant**: Catalog search, image-based product lookup, Stripe & COD checkout, real-time order tracking, and an AI shopping assistant surfacing both original seller store inventory and discounted Supply Chain Hub deals.
- **Buyer Cancel Photo & AI Verification**: Buyers can optionally upload a product photo when cancelling an order; the image is automatically routed to the respective seller's verification pipeline to confirm whether the returned/cancelled item matches the original listing.
- **Seller Dashboard & Analytics**: Per-seller isolated store management, smart product search & analytics (views, likes, cancellations, and dynamic order-status charts), plus customer management.
- **Seller Profit-Shield & Next-Customer Deal Copilot**: Multi-agent anti-RTO & fraud defense workflow covering COD risk gating, in-transit parcel hub rerouting, return-photo inspection, courier weight auditing, and 1-click replacement buyer reassignment.
- **Open Agentic Web Support**: Exposes `/.well-known/agent-network.json`, `/agent-network.json`, `POST /api/open-agent/invoke/`, and a browser-native `/agent-runtime.js` + `/open-agentic-hub`.

---

## Quick Start (Docker Compose)

1. Copy `.env.docker.example` to `.env` and fill in your API keys (`GROQ_API_KEY`, `GEMINI_API_KEY` / `GOOGLE_API_KEY`, Google OAuth Web Client credentials, Stripe keys).
2. Start PostgreSQL, Django API (Gunicorn), and React Frontend (Nginx):

```bash
docker compose up --build
```

- **Frontend App**: `http://localhost:3000`
- **Backend API & Admin**: `http://localhost:8000/api/` · `http://localhost:8000/admin/`
- **Seeded Demo Accounts**: `demo_buyer` / `demo_seller` (password `Demo@12345`)

---

## Local Development (Without Docker)

### Backend (Django)
```bash
cd myproject
python -m venv ../.venv
# Activate venv, install requirements:
pip install -r requirements.txt
python manage.py migrate
python manage.py seed_demo
python manage.py runserver 8000
```

### Frontend (React 19 + Vite)
```bash
cd frontend
npm install
npm run dev
```

---

## Vercel Full-Stack Deployment

Configure in `vercel.json` + `api/index.py`:
- Attach **Vercel Postgres** (`DATABASE_URL` / `POSTGRES_URL`)
- Set `SECRET_KEY`, `GROQ_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, and `VITE_GOOGLE_CLIENT_ID` in Vercel Project Settings.
