# ZyntrixCRM — Local Development Setup

## Prerequisites
- Node.js >= 18 (`node --version`)
- MongoDB (local) OR use the Atlas cluster already configured
- VS Code + Live Server extension (recommended for frontend)

---

## 1 — Backend

```bash
cd Backend
npm install
npm run dev       # auto-restarts on file changes
# or: npm start   # no auto-restart
```

Expected output:
```
ZyntrixCRM API running on port 5000
✅ MongoDB Atlas Connected
```

The `.env` is already configured to use the Atlas cluster.
`DEV_SKIP_EMAIL=true` means reset-link emails print to the terminal instead of sending.

---

## 2 — Frontend

**VS Code Live Server (easiest):**
1. Open the `Frontend/` folder in VS Code
2. Right-click `index.html` → **Open with Live Server**
3. Opens at `http://localhost:5500`

**Or Python:**
```bash
cd Frontend && python -m http.server 5500
```

**Or Node:**
```bash
cd Frontend && npx http-server -p 5500
```

---

## 3 — Test the Password Reset Flow (local)

Since `DEV_SKIP_EMAIL=true`, the reset link prints to the backend terminal.

1. Open `http://localhost:5500/pages/forgot-password.html`
2. Enter any registered email
3. Copy the reset link from the **backend terminal**
4. Paste it in your browser

---

## Deployment

| Target | Guide |
|--------|-------|
| Backend → Railway | `DEPLOY_RAILWAY.md` |
| Frontend → Hostinger | `DEPLOY_HOSTINGER.md` |
| Railway env variables | `RAILWAY_ENV_VARS.txt` |

