# SABA AI Assistant - Deployment Guide

## 🚀 Free Deployment Strategy

This guide will help you deploy your SABA AI Assistant for free using:
- **Frontend**: Vercel (Free)
- **Backend + Database**: Railway (Free tier) or Render (Free tier)

---

## Option 1: Deploy to Railway (Recommended - Easiest)

### Step 1: Prepare Your Repository

1. **Push your code to GitHub** (if not already done):
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

### Step 2: Deploy Backend to Railway

1. Go to [Railway.app](https://railway.app) and sign up with GitHub
2. Click **"New Project"** → **"Deploy from GitHub repo"**
3. Select your repository
4. Railway will auto-detect the backend

**Add Environment Variables in Railway:**
```
UVICORN_HOST=0.0.0.0
UVICORN_PORT=5000
JWT_SECRET_KEY=your-secret-key-here-change-this
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_DB=saba
POSTGRES_USER=saba
POSTGRES_PASSWORD=saba
DATABASE_URL=postgresql://saba:saba@postgres:5432/saba
REDIS_URL=redis://redis:6379/0
REDIS_URL_CELERY=redis://redis:6379/0
REDIS_URL_CHAT=redis://redis:6379/1
FRONTEND_ORIGIN=https://your-frontend-url.vercel.app
```

5. **Add PostgreSQL Database**:
   - In Railway dashboard, click **"New"** → **"Database"** → **"PostgreSQL"**
   - Railway will auto-generate DATABASE_URL
   - Copy the DATABASE_URL and update your backend environment variables

6. **Add Redis**:
   - Click **"New"** → **"Database"** → **"Redis"**
   - Copy the REDIS_URL and update your backend environment variables

7. **Get your backend URL**: Railway will give you a URL like `https://your-app.railway.app`

### Step 3: Deploy Frontend to Vercel

1. Go to [Vercel.com](https://vercel.com) and sign up with GitHub
2. Click **"Add New Project"** → **"Import Git Repository"**
3. Select your repository
4. Vercel will auto-detect Next.js

**Add Environment Variables in Vercel:**
```
NEXT_PUBLIC_BACKEND_URL=https://your-backend.railway.app
GEMINI_API_KEY=your-gemini-api-key-here
NEXT_PUBLIC_APP_NAME=SABA
NEXT_PUBLIC_APP_DESCRIPTION=Your AI Personal Assistant
```

5. Click **"Deploy"**
6. Your frontend will be live at `https://your-app.vercel.app`

### Step 4: Update CORS in Backend

Update `backend/app/main.py` to allow your Vercel domain:
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://your-app.vercel.app"  # Add your Vercel URL
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

Push the changes and Railway will auto-deploy.

---

## Option 2: Deploy to Render (Alternative)

### Step 1: Deploy Backend to Render

1. Go to [Render.com](https://render.com) and sign up
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repository
4. Configure:
   - **Name**: saba-backend
   - **Environment**: Docker
   - **Region**: Choose closest to you
   - **Branch**: main
   - **Dockerfile Path**: backend/Dockerfile

**Add Environment Variables** (same as Railway above)

5. **Add PostgreSQL**:
   - Click **"New +"** → **"PostgreSQL"**
   - Copy the Internal Database URL
   - Add it as DATABASE_URL in your web service

6. **Add Redis**:
   - Click **"New +"** → **"Redis"**
   - Copy the Internal Redis URL
   - Add it as REDIS_URL in your web service

### Step 2: Deploy Frontend to Vercel

Same as Option 1, Step 3 above.

---

## Option 3: All-in-One Docker Deployment (VPS/Cloud)

If you have a VPS (AWS EC2, DigitalOcean, etc.):

### Step 1: Set up your server

```bash
# Install Docker and Docker Compose
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Clone your repository
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git
cd YOUR_REPO
```

### Step 2: Create production environment file

```bash
cp .env.prod.example .env.prod
# Edit .env.prod with your production values
nano .env.prod
```

### Step 3: Deploy with Docker Compose

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Your app will be available at `http://your-server-ip:3000`

**For HTTPS**, set up Nginx reverse proxy with Let's Encrypt SSL.

---

## 🔑 Important: Get Gemini API Key

For AI chat to work, get a free API key:
1. Go to https://aistudio.google.com/app/apikey
2. Sign in with Google
3. Click "Create API Key"
4. Add it to your environment variables

---

## 📊 Deployment Comparison

| Platform | Frontend | Backend | Database | Cost | Ease |
|----------|----------|---------|----------|------|------|
| **Railway** | ❌ | ✅ | ✅ | Free tier | ⭐⭐⭐⭐⭐ |
| **Vercel** | ✅ | ❌ | ❌ | Free | ⭐⭐⭐⭐⭐ |
| **Render** | ❌ | ✅ | ✅ | Free tier | ⭐⭐⭐⭐ |
| **VPS** | ✅ | ✅ | ✅ | $5-10/mo | ⭐⭐⭐ |

**Recommended**: Vercel (Frontend) + Railway (Backend + DB)

---

## ✅ Post-Deployment Checklist

- [ ] Frontend is accessible via HTTPS
- [ ] Backend is accessible via HTTPS
- [ ] Database is connected
- [ ] Redis is connected
- [ ] CORS is configured correctly
- [ ] Environment variables are set
- [ ] Gemini API key is added (optional)
- [ ] Can sign up and log in
- [ ] Can create tasks
- [ ] Can chat with AI

---

## 🆘 Troubleshooting

**Frontend can't connect to backend:**
- Check NEXT_PUBLIC_BACKEND_URL is correct
- Check CORS settings in backend

**Backend crashes:**
- Check DATABASE_URL is correct
- Check all environment variables are set
- Check logs: `railway logs` or in Render dashboard

**Database connection fails:**
- Verify DATABASE_URL format
- Check database is running
- Check network connectivity

---

## 🎉 You're Done!

Your SABA AI Assistant is now deployed and accessible worldwide!

Share your deployment URL and enjoy your AI assistant! 🚀
