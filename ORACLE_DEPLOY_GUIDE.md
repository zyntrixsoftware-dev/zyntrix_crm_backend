# Migrating the Zyntrix CRM Backend to Oracle Cloud Free Tier

**Goal:** move the Node/Express backend from Render to an Oracle Cloud *Always Free* ARM VM, served over HTTPS at **`https://api.zyntrixsoftware.com`**, managed with **pm2 + nginx**. MongoDB stays on Atlas; the frontend stays on Hostinger.

> Why this is better than Render free: the Always Free ARM VM (up to 4 OCPU / 24 GB RAM / 200 GB storage) **never sleeps**, so no cold-start delay on the first request.

---

## Overview of what changes

| Piece | Before | After |
|---|---|---|
| Backend host | `zyntrix-crm-backend.onrender.com` | `api.zyntrixsoftware.com` (Oracle VM) |
| Process | Render-managed | `pm2` on Ubuntu, behind `nginx` |
| SSL | Render auto | Let's Encrypt (`certbot`) via nginx |
| DB | MongoDB Atlas | unchanged (just allowlist the new VM IP) |
| Frontend | Hostinger | unchanged (just repoint API URL) |

---

## Step 1 — Create the Oracle account and ARM VM

1. Sign up at **cloud.oracle.com** (Always Free; a card is required for identity verification but Always Free resources aren't charged). Pick a **home region** near your users (e.g. *India South (Hyderabad)* or *India West (Mumbai)*).
2. In the console: **Menu → Compute → Instances → Create instance**.
3. Configure:
   - **Image:** Canonical **Ubuntu 22.04**.
   - **Shape:** click *Change shape* → **Ampere (ARM)** → `VM.Standard.A1.Flex` → set **2 OCPU / 12 GB** (well within the free 4 OCPU / 24 GB; leaves room for a second VM later).
   - **SSH keys:** choose *Generate a key pair for me* and **download both** the private and public keys. Keep the private key safe — you log in with it.
4. Click **Create**. When it's running, copy the **Public IP address**.

> **"Out of capacity" on ARM?** ARM A1 is in high demand. If creation fails, switch the *Availability Domain* dropdown and retry, try at off-peak hours, or temporarily use the AMD `VM.Standard.E2.1.Micro` Always Free shape. A small script that retries creation is also common — ask me and I'll give you one.

---

## Step 2 — Open the network ports (two layers!)

Oracle blocks traffic in **two** places. You must open both or HTTPS won't work.

**2a. Security List (cloud firewall):**
Instance page → *Virtual Cloud Network* → *Security Lists* → *Default Security List* → **Add Ingress Rules**:

| Source CIDR | Protocol | Dest. Port |
|---|---|---|
| `0.0.0.0/0` | TCP | `80` |
| `0.0.0.0/0` | TCP | `443` |

(Port 22 for SSH is already open.)

**2b. The VM's own firewall (the step everyone forgets):**
Oracle's Ubuntu image ships with strict `iptables` rules. After you SSH in (Step 3), run:

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

---

## Step 3 — Connect to the VM

On your computer (PowerShell or terminal), from the folder holding the downloaded private key:

```bash
chmod 600 ./your-private-key.key          # mac/linux; skip on Windows
ssh -i ./your-private-key.key ubuntu@YOUR_VM_PUBLIC_IP
```

The default user for Ubuntu images is **`ubuntu`**.

---

## Step 4 — Install the runtime

```bash
sudo apt update && sudo apt upgrade -y
# Node 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git nginx
sudo npm install -g pm2
node -v && npm -v          # confirm
```

---

## Step 5 — Get the backend code onto the VM

Easiest is Git. From your repo (push it to GitHub first if it isn't already), then on the VM:

```bash
cd ~
git clone https://github.com/<you>/<your-repo>.git zyntrix
cd zyntrix/Backend
npm install --omit=dev      # installs production deps only
```

> No GitHub? Tell me and I'll give you an `scp` one-liner to copy the `Backend` folder straight from your PC.

---

## Step 6 — Create the `.env` file

```bash
nano ~/zyntrix/Backend/.env
```

Paste your real values. These are every variable the app reads:

```ini
# Core
NODE_ENV=production
PORT=5000
MONGO_URI=your-atlas-connection-string
JWT_SECRET=your-jwt-secret
FRONTEND_URL=https://zyntrixsoftware.com
ALLOWED_EMAIL_DOMAIN=zyntrixsoftware.com

# Google Apps Script (email + onboarding)
GAS_WEBAPP_URL=your-gas-exec-url
GAS_URL=your-gas-exec-url
GAS_STUDENT_EMAIL_URL=your-student-gas-url
ONBOARDING_WEBHOOK_SECRET=Zyntrix_webhook

# SMTP (only if you use the non-GAS email path; leave as-is from Render)
EMAIL_HOST=
EMAIL_PORT=
EMAIL_USER=
EMAIL_PASS=
EMAIL_FROM=
EMAIL_SENDER_NAME=
DEV_SKIP_EMAIL=false

# Company / payroll constants (copy from your Render env)
COMPANY_NAME=
COMPANY_SHORTNAME=
COMPANY_ADDRESS=
COMPANY_CIN=
COMPANY_GSTN=
COMPANY_PAN=
COMPANY_PHONE=
COMPANY_HR_EMAIL=
COMPANY_SUPPORT_EMAIL=
HOURLY_RATE=
HRA_PERCENT=
TAX_PERCENT=
OVERTIME_MULTIPLIER=
OVERTIME_BONUS_AMOUNT=
OVERTIME_BONUS_THRESHOLD_HOURS=
```

> Copy the exact values from your current **Render dashboard → Environment** so nothing is missed. Save in nano with `Ctrl+O`, `Enter`, `Ctrl+X`.

---

## Step 7 — Run it with pm2 (auto-restart + start on boot)

```bash
cd ~/zyntrix/Backend
pm2 start server.js --name zyntrix-api
pm2 save
pm2 startup        # prints a command — copy/paste & run the line it gives you
```

Check it's alive locally:

```bash
curl http://localhost:5000        # should respond (not "connection refused")
pm2 logs zyntrix-api              # watch logs; Ctrl+C to exit
```

---

## Step 8 — Point the subdomain at the VM (DNS)

In **Hostinger → Domains → DNS / Nameservers** for `zyntrixsoftware.com`, add an **A record**:

| Type | Name | Points to | TTL |
|---|---|---|---|
| A | `api` | `YOUR_VM_PUBLIC_IP` | 3600 |

Wait a few minutes, then verify from anywhere:

```bash
ping api.zyntrixsoftware.com      # should resolve to your VM IP
```

---

## Step 9 — nginx reverse proxy

```bash
sudo nano /etc/nginx/sites-available/zyntrix-api
```

Paste:

```nginx
server {
    listen 80;
    server_name api.zyntrixsoftware.com;

    client_max_body_size 25M;   # allows resume/offer PDF uploads

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable it:

```bash
sudo ln -s /etc/nginx/sites-available/zyntrix-api /etc/nginx/sites-enabled/
sudo nginx -t          # test config
sudo systemctl reload nginx
```

Now `http://api.zyntrixsoftware.com` should reach the backend.

---

## Step 10 — Free HTTPS with Let's Encrypt

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d api.zyntrixsoftware.com
```

Answer the prompts (enter email, agree to terms, choose **redirect HTTP→HTTPS**). Certbot edits the nginx config and auto-renews. Verify:

```bash
curl https://api.zyntrixsoftware.com
```

---

## Step 11 — Allowlist the VM in MongoDB Atlas

Atlas only accepts connections from approved IPs. Render's IPs were allowlisted before; the new VM is not.

Atlas → **Network Access → Add IP Address** → add your **VM's public IP** (`YOUR_VM_PUBLIC_IP/32`). If your free Atlas was set to `0.0.0.0/0` it already works, but locking it to the VM IP is safer.

Confirm the backend connected: `pm2 logs zyntrix-api` should show `✅ MongoDB Atlas Connected`.

---

## Step 12 — Repoint the frontend and GAS to the new backend

**Frontend (Hostinger).** These 5 files hardcode the old Render URL — change `https://zyntrix-crm-backend.onrender.com/api` → `https://api.zyntrixsoftware.com/api`:

- `Frontend/assets/js/api.js`
- `Frontend/modules/sales_system/comms.html`
- `Frontend/modules/sales_system/coupons.html`
- `Frontend/modules/sales_system/sales-reps.html`
- `Frontend/modules/sales_system/sales-import-modal.js`

Then re-upload those files to Hostinger.
*(I can do this find-and-replace across all 5 files for you right now — just say so.)*

**Google Apps Script.** In Apps Script → **Project Settings → Script properties**, change `BACKEND_URL` to `https://api.zyntrixsoftware.com` so the onboarding webhook hits the new server.

**CORS:** no change needed — your `server.js` already allows every `*.zyntrixsoftware.com` origin, and the frontend origin (`zyntrixsoftware.com`) stays the same.

---

## Step 13 — Test the cutover

1. Open the live app, log in — confirm data loads (calls now go to `api.zyntrixsoftware.com`).
2. `pm2 logs zyntrix-api` on the VM — watch requests arrive.
3. Submit a test onboarding form — confirm the webhook hits the new backend.
4. Once everything works, you can suspend the Render service.

---

## Updating the backend later

```bash
cd ~/zyntrix
git pull
cd Backend
npm install --omit=dev
pm2 restart zyntrix-api
```

---

## Quick troubleshooting

- **Site unreachable on port 80/443:** you missed Step 2b (the VM `iptables` rules) or 2a (security list).
- **502 Bad Gateway from nginx:** the Node app isn't running — `pm2 status`, `pm2 logs zyntrix-api`.
- **`MongoNetworkError` in logs:** VM IP not allowlisted in Atlas (Step 11).
- **certbot fails:** DNS hasn't propagated yet, or port 80 isn't open — wait and re-run.
- **Frontend calls fail / CORS error:** a frontend file still points at the old Render URL (Step 12), or you opened the app over `http://`.
- **App didn't restart after reboot:** you skipped the `pm2 startup` command output in Step 7.

---

### What I can do for you right now
- Run the find-and-replace on the 5 frontend files (Render URL → `api.zyntrixsoftware.com`).
- Generate an `ecosystem.config.js` for pm2 (cleaner than CLI flags).
- Give you a `scp` command to upload the Backend folder if you're not using GitHub.
- Provide an ARM "retry until capacity" creation script.

Just tell me which.
