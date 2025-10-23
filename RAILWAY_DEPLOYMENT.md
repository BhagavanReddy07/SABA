# SABA AI Assistant - Railway Deployment Guide

## 🚀 Complete Railway Deployment Guide

Railway is the easiest way to deploy your full-stack app with databases included!

---

## 📋 Prerequisites

- GitHub account with your code pushed
- Railway account (sign up at https://railway.app)
- 15 minutes of time

---

## 🎯 Step-by-Step Deployment

### Step 1: Push Code to GitHub

Make sure all your code is pushed:

```bash
git add .
git commit -m "Ready for Railway deployment"
git push origin main
```

### Step 2: Create Railway Project

1. Go to https://railway.app
2. Click **"Login"** and sign in with GitHub
3. Click **"New Project"**
4. Select **"Deploy from GitHub repo"**
5. Choose your repository: `Manish-111913/SABA`
6. Railway will detect your project

### Step 3: Configure Backend Service

Railway will try to auto-detect. You need to configure it:

1. Click on the service that was created
2. Go to **"Settings"** tab
3. Configure:

**Root Directory:**
```
backend
```

**Build Command:** (leave empty - Docker handles it)

**Start Command:** (leave empty - Docker handles it)

**Custom Dockerfile Path:**
```
backend/Dockerfile
```

### Step 4: Add PostgreSQL Database

1. In your Railway project dashboard
2. Click **"New"** → **"Database"** → **"Add PostgreSQL"**
3. Railway automatically creates the database
4. Railway automatically adds `DATABASE_URL` to your backend service

### Step 5: Add Redis

1. Click **"New"** → **"Database"** → **"Add Redis"**
2. Railway automatically creates Redis
3. Railway automatically adds `REDIS_URL` to your backend service

### Step 6: Add Environment Variables

1. Click on your **backend service**
2. Go to **"Variables"** tab
3. Click **"New Variable"** and add these:

```bash
UVICORN_HOST=0.0.0.0
UVICORN_PORT=5000
JWT_SECRET_KEY=change-this-to-random-secret-key-abc123xyz
FRONTEND_ORIGIN=https://your-app.vercel.app
POSTGRES_HOST=${{Postgres.PGHOST}}
POSTGRES_PORT=${{Postgres.PGPORT}}
POSTGRES_DB=${{Postgres.PGDATABASE}}
POSTGRES_USER=${{Postgres.PGUSER}}
POSTGRES_PASSWORD=${{Postgres.PGPASSWORD}}
REDIS_URL_CELERY=${{Redis.REDIS_URL}}
REDIS_URL_CHAT=${{Redis.REDIS_URL}}
```

**Note:** Railway automatically provides:
- `DATABASE_URL` from PostgreSQL
- `REDIS_URL` from Redis
- The `${{...}}` syntax references other services

### Step 7: Generate Domain

1. Go to **"Settings"** tab of your backend service
2. Scroll to **"Networking"**
3. Click **"Generate Domain"**
4. You'll get a URL like: `https://saba-backend-production.up.railway.app`
5. Copy this URL - you'll need it for frontend!

### Step 8: Deploy

1. Railway will automatically deploy
2. Watch the **"Deployments"** tab for progress
3. Check logs for any errors
4. Once successful, test your backend URL

**Test Backend:**
Visit: `https://your-backend.railway.app`

You should see:
```json
{"message":"Personal AI Assistant backend running!"}
```

---

## 🌐 Deploy Frontend to Vercel

### Step 1: Deploy to Vercel

1. Go to https://vercel.com
2. Sign in with GitHub
3. Click **"Add New Project"**
4. Import your GitHub repository
5. Vercel auto-detects Next.js

### Step 2: Configure Environment Variables

Add these in Vercel:

```bash
NEXT_PUBLIC_BACKEND_URL=https://your-backend.railway.app
GEMINI_API_KEY=your-gemini-api-key-here
NEXT_PUBLIC_APP_NAME=SABA
NEXT_PUBLIC_APP_DESCRIPTION=Your AI Personal Assistant
```

**Get Gemini API Key (Free):**
- Go to: https://aistudio.google.com/app/apikey
- Sign in with Google
- Click "Create API Key"
- Copy and paste above

### Step 3: Deploy

1. Click **"Deploy"**
2. Wait 2-3 minutes
3. Your frontend will be live at: `https://your-app.vercel.app`

### Step 4: Update Backend CORS

Go back to Railway:

1. Click on your backend service
2. Go to **"Variables"** tab
3. Update `FRONTEND_ORIGIN`:

```bash
FRONTEND_ORIGIN=https://your-app.vercel.app
```

4. Railway will auto-redeploy

---

## 🔧 Railway Configuration Files

### railway.toml (Already Created)

This file tells Railway how to build and deploy your app:

```toml
[build]
builder = "DOCKERFILE"
dockerfilePath = "backend/Dockerfile"

[deploy]
startCommand = "python run_server.py"
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 10
```

This file is already in your project root.

---

## ✅ Post-Deployment Checklist

- [ ] Backend service is deployed on Railway
- [ ] PostgreSQL database is created and connected
- [ ] Redis cache is created and connected
- [ ] Backend has a public domain (e.g., `*.railway.app`)
- [ ] All environment variables are set
- [ ] Backend responds at its URL
- [ ] Frontend is deployed on Vercel
- [ ] Frontend can connect to backend
- [ ] Can sign up and log in
- [ ] Can create tasks
- [ ] Can chat with AI

---

## 🆘 Troubleshooting

### Deployment Failed: JSON Parse Error

**Error:** `Failed to parse JSON file railway.json`

**Solution:**
- Delete `railway.json` if it exists
- Use `railway.toml` instead (already created)
- Redeploy

### Backend Won't Start

**Check logs:**
1. Click on your service
2. Go to **"Deployments"** tab
3. Click on the latest deployment
4. View logs

**Common issues:**
- Missing environment variables
- Database not connected
- Wrong Dockerfile path

**Solution:**
- Verify all environment variables
- Check Root Directory is set to `backend`
- Check Custom Dockerfile Path is `backend/Dockerfile`

### Database Connection Error

**Error:** `could not connect to database`

**Solution:**
1. Make sure PostgreSQL is added to your project
2. Check `DATABASE_URL` is automatically set
3. Use Railway's internal network (automatic)

### Frontend Can't Connect to Backend

**Error:** `Failed to fetch` or `CORS error`

**Solution:**
1. Check `NEXT_PUBLIC_BACKEND_URL` in Vercel
2. Check `FRONTEND_ORIGIN` in Railway backend
3. Make sure backend domain is generated and public

### Service Keeps Restarting

**Check logs for errors:**
- Missing dependencies
- Port binding issues
- Database connection failures

**Solution:**
- Verify `UVICORN_HOST=0.0.0.0`
- Verify `UVICORN_PORT=5000`
- Check all environment variables

---

## 💰 Cost Breakdown

| Service | Plan | Cost | Limits |
|---------|------|------|--------|
| **Railway** | Hobby | $5/month | $5 credit included |
| **PostgreSQL** | Included | Free | 1GB storage |
| **Redis** | Included | Free | 100MB storage |
| **Vercel** | Free | $0/month | Unlimited |
| **Total** | | **$5/month** | (with $5 credit) |

**Railway Free Trial:**
- $5 credit per month
- Enough for small projects
- No credit card required initially

**After Free Credit:**
- Pay only for what you use
- ~$5-10/month for this project
- Can pause services when not in use

---

## 🚀 Railway vs Render Comparison

| Feature | Railway | Render |
|---------|---------|--------|
| **Setup** | Easier | More steps |
| **Auto-deploy** | ✅ Yes | ✅ Yes |
| **Databases** | Integrated | Separate |
| **Free Tier** | $5 credit | 750 hours |
| **Speed** | Faster | Slower (free) |
| **UI** | Modern | Traditional |

**Recommendation:** Railway is easier and faster!

---

## 📊 Architecture Diagram

```
┌─────────────────────────────────────────────────┐
│                   VERCEL                        │
│         https://your-app.vercel.app             │
│              (Frontend - Free)                  │
└────────────────┬────────────────────────────────┘
                 │
                 │ HTTPS API Calls
                 ▼
┌─────────────────────────────────────────────────┐
│                  RAILWAY                        │
│                                                 │
│  ┌──────────────────────────────────────────┐  │
│  │   Backend Service                        │  │
│  │   https://saba-backend.railway.app       │  │
│  │   (FastAPI + Python + Docker)            │  │
│  └──────┬───────────────────────────────────┘  │
│         │                                       │
│         │ Internal Network (Automatic)          │
│         │                                       │
│  ┌──────▼──────────┐    ┌──────────────────┐  │
│  │   PostgreSQL    │    │      Redis       │  │
│  │   (Database)    │    │     (Cache)      │  │
│  │   1GB Storage   │    │   100MB Storage  │  │
│  └─────────────────┘    └──────────────────┘  │
└─────────────────────────────────────────────────┘
```

---

## 🎯 Quick Commands Reference

### View Logs
```bash
# In Railway dashboard:
Service → Deployments → Click deployment → View logs
```

### Redeploy
```bash
# In Railway dashboard:
Service → Deployments → Click "..." → Redeploy
```

### Add Environment Variable
```bash
# In Railway dashboard:
Service → Variables → New Variable
```

### Generate Domain
```bash
# In Railway dashboard:
Service → Settings → Networking → Generate Domain
```

---

## 🔗 Helpful Links

- Railway Dashboard: https://railway.app/dashboard
- Railway Docs: https://docs.railway.app
- Vercel Dashboard: https://vercel.com/dashboard
- Gemini API: https://aistudio.google.com/app/apikey

---

## 🎉 Success!

Your SABA AI Assistant is now deployed on Railway!

**Your URLs:**
- Frontend: `https://your-app.vercel.app`
- Backend: `https://your-backend.railway.app`

**Enjoy your deployed AI assistant!** 🚀

---

## 📝 Next Steps

1. ✅ Test all features (signup, login, chat, tasks)
2. ✅ Add Gemini API key for AI responses
3. ✅ Share your app with others
4. ✅ Monitor usage in Railway dashboard
5. ✅ Set up custom domain (optional)

**Need help?** Check Railway docs or review the logs!

**Good luck!** 🎊
