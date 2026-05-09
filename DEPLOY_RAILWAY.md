# Railway Deployment Guide — ZyntrixCRM Backend

## What deploys to Railway
Only the `Backend/` folder → this becomes your API server.

---

## Step 1 — Push Backend to GitHub

Railway deploys from GitHub. Create a **separate repo** for the backend:

```bash
# Inside the Backend/ folder
cd Backend
git init
git add .
git commit -m "Initial backend"
git remote add origin https://github.com/YOUR_USERNAME/zyntrixcrm-backend.git
git push -u origin main
```

> ⚠️  The `.gitignore` already excludes `.env` — your credentials will NOT be pushed.

---

## Step 2 — Create a Railway Project

1. Go to [railway.app](https://railway.app) and log in
2. Click **New Project** → **Deploy from GitHub repo**
3. Select your `zyntrixcrm-backend` repo
4. Railway auto-detects `railway.json` and starts the build

---

## Step 3 — Set Environment Variables

1. Open your service in Railway
2. Go to **Variables** tab → click **Raw Editor**
3. Paste the entire contents of **`RAILWAY_ENV_VARS.txt`** → click Save
4. Railway will automatically redeploy

---

## Step 4 — Get Your Railway URL

1. Go to **Settings** tab → **Networking** → **Generate Domain**
2. Your URL will be something like:
   ```
   https://zyntrixbackend-production-abc123.up.railway.app
   ```
3. Test it — open the URL in browser, you should see:
   ```json
   { "status": "ok", "message": "ZyntrixCRM API Running" }
   ```

---

## Step 5 — Update Frontend with Railway URL

Open `Frontend/assets/js/api.js` and update line 8:

```js
// BEFORE (placeholder)
const RAILWAY_BACKEND_URL = "https://zyntrixbackend-production.up.railway.app";

// AFTER (your real URL)
const RAILWAY_BACKEND_URL = "https://zyntrixbackend-production-abc123.up.railway.app";
```

Save the file. Now upload the Frontend to Hostinger (see DEPLOY_HOSTINGER.md).

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Build fails | Check Railway logs → Deployments tab |
| DB connection error | Verify MONGO_URI in Variables tab — check Atlas IP whitelist (add 0.0.0.0/0 for Railway) |
| Email not sending | Set DEV_SKIP_EMAIL=false and check EMAIL_* vars are correct |
| CORS error in browser | Confirm FRONTEND_URL in Railway matches exactly what Hostinger serves |
| 502 / service crashed | Check Railway logs for startup errors |

### MongoDB Atlas IP Whitelist for Railway
Railway uses dynamic IPs. In Atlas:
1. Go to **Network Access** → **Add IP Address**
2. Click **Allow Access from Anywhere** → `0.0.0.0/0`
3. Confirm

