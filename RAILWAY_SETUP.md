# Railway Deployment Fix Guide

## Problem
The bot keeps restarting in a loop on Railway. Logs show:
- Multiple database connections before new container starts
- Container starts successfully, server listens on port 8080
- Immediately gets "Stopping Container" and SIGTERM
- Process repeats

## Root Cause
Railway has **multiple deployments or instances running simultaneously**, or is configured incorrectly.

## Solution - Railway Dashboard Steps

### 1. **Check Active Deployments** (CRITICAL)
1. Go to Railway Dashboard → Your Project
2. Click on your service (moist-lieutenant)
3. Click the **"Deployments"** tab
4. Look for deployments marked as **"Active"**
5. **You should only see ONE "Active" deployment**
6. If you see multiple "Active" deployments:
   - Click on each OLD deployment
   - Click the three dots (⋮) → **"Remove"** or **"Stop"**
   - Leave only the NEWEST deployment active

### 2. **Verify Service Settings**
1. Click on your service → **"Settings"** tab
2. Check these settings:
   - **Service Name**: Should be clear (e.g., "moist-lieutenant-bot")
   - **Root Directory**: Should be `/` or blank
   - **Start Command**: Should be `npm start`
   - **Build Command**: Should be blank (Nixpacks handles it)

### 3. **Check Scaling/Replicas** (VERY IMPORTANT)
1. In Settings, look for:
   - **"Replicas"** or **"Instances"** or **"Scale"**
   - **MUST be set to `1`** (not 2, 3, or auto-scale)
2. If you don't see this setting:
   - Railway free tier only allows 1 replica by default
   - This might not be the issue

### 4. **Verify Watch Paths / Auto-Deploy**
1. Settings → **"Source"** or **"Deploy"** section
2. Look for **"Watch Paths"** setting
3. Should be: `/**` (watches all changes)
4. Check **"Auto Deploy"** toggle:
   - If enabled: Deploys on every git push
   - **Temporarily DISABLE** to stop the loop during testing

### 5. **Environment Variables** (Must Be Set)
Settings → **"Variables"** tab - Ensure these exist:
```
DISCORD_TOKEN=<your-bot-token>
DISCORD_CLIENT_ID=<your-client-id>
DISCORD_CLIENT_SECRET=<your-client-secret>
DISCORD_CALLBACK_URL=https://<your-railway-url>.up.railway.app/auth/discord/callback
SESSION_SECRET=<random-string>
DATABASE_URL=<automatically-set-by-railway-postgres>
BOT_PUBLIC_URL=https://<your-railway-url>.up.railway.app
```

### 6. **Force Single Deployment**
1. Go to Deployments tab
2. **Remove/Stop ALL deployments** 
3. Click **"Deploy"** → **"Trigger Deploy"** 
4. Wait for it to build
5. **Only this ONE deployment should be active**

### 7. **Check Service Type**
1. Settings → Check if there's a **"Service Type"** option
2. Should be set to **"Web Service"** (NOT "Worker" or "Cron")
3. If you don't see this option, Railway auto-detects from `Procfile` (which we added)

## Verification
After fixing, you should see in logs:
```
[timestamp] Starting Moist Lieutenant bot...
[timestamp] Process ID: 13
[timestamp] Logged in as Moist Lieutenant#1747
[timestamp] Server ready to accept connections
[timestamp] Keep-alive: Service running, uptime 30s
[timestamp] Keep-alive: Service running, uptime 60s
```

**NO "Stopping Container" messages immediately after startup**

## If Still Failing
1. **Check Railway Status**: https://status.railway.app
2. **Contact Railway Support**: Provide these logs showing multiple instances
3. **Temporary Workaround**: Manually stop all deployments, then trigger ONE new deployment
4. **Check Billing**: Free tier has limits - ensure you're not hitting them

## Railway Commands (if using CLI)
```bash
railway status                    # Check current deployment
railway up                        # Deploy 
railway logs                      # View logs
railway variables                 # List environment variables
```

## Expected Behavior
- **1 deployment** marked as "Active"
- **1 database connection** on startup
- Service stays running without restarts
- Keep-alive messages every 30 seconds in logs
