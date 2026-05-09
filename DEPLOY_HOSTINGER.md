# Hostinger Deployment Guide — ZyntrixCRM Frontend

## What deploys to Hostinger
Only the `Frontend/` folder → uploaded to your Hostinger public_html.

---

## Before You Upload — Set the Railway URL

Open `Frontend/assets/js/api.js` and update **line 8** with your real Railway URL:

```js
const RAILWAY_BACKEND_URL = "https://YOUR-REAL-RAILWAY-URL.up.railway.app";
```

Save the file. This is the **only change** needed before uploading.

---

## Option A — File Manager (Easiest)

1. Log in to [hpanel.hostinger.com](https://hpanel.hostinger.com)
2. Go to **Hosting** → your plan → **File Manager**
3. Navigate to `public_html/`
4. Delete any existing files if starting fresh
5. Click **Upload** → select all files from `Frontend/` and upload
6. Make sure `index.html` ends up at `public_html/index.html`

**Folder structure in public_html should match exactly:**
```
public_html/
├── index.html
├── assets/
│   ├── css/
│   └── js/
├── modules/
└── pages/
```

---

## Option B — FTP (FileZilla)

1. In Hostinger hPanel → **Hosting** → **FTP Accounts** → copy credentials
2. Open FileZilla:
   - Host: your FTP host (e.g. `ftp.zyntrixsoftware.com`)
   - Username / Password: from hPanel
   - Port: 21
3. Left panel: navigate to your local `Frontend/` folder
4. Right panel: navigate to `public_html/`
5. Select all files in `Frontend/` → drag to right panel

---

## Option C — Git via SSH (Advanced)

Hostinger Premium/Business plans support Git deployment:
1. hPanel → **Advanced** → **Git**
2. Add your GitHub frontend repo
3. Set auto-deploy on push

---

## Verify the Deployment

1. Open `https://zyntrixsoftware.com`
2. You should see the ZyntrixCRM login page
3. Try logging in — check browser Console (F12) for any CORS or 404 errors

---

## Common Issues

| Problem | Fix |
|---|---|
| Blank page / 404 | Make sure `index.html` is directly inside `public_html/`, not in a subfolder |
| "Cannot reach server" | Verify `RAILWAY_BACKEND_URL` in `api.js` is correct and Railway is running |
| CORS error | In Railway vars, confirm `FRONTEND_URL=https://zyntrixsoftware.com` (no trailing slash) |
| Password reset link wrong URL | In Railway vars, set `FRONTEND_URL=https://zyntrixsoftware.com` |
| CSS not loading | Check file paths are correct; Hostinger is case-sensitive |
| Mixed content warning | Both frontend (Hostinger) and backend (Railway) must use HTTPS |

---

## SSL Certificate

Hostinger automatically provisions a free SSL certificate for your domain.
If it's not active:
1. hPanel → **SSL** → **Install SSL** → Select your domain → Enable

Railway also provides HTTPS automatically — no action needed.

