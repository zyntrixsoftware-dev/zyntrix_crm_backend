# Zyntrix CRM — Daily Work Report

**Date:** Saturday, 6 June 2026
**Prepared for:** Zyntrix Software Solutions Pvt. Ltd.
**System:** Zyntrix CRM (Backend on Oracle Cloud · Frontend on Hostinger · Mail on Microsoft 365)

---

## 1. Executive Summary

| Area | Outcome |
|---|---|
| HRMS UI | Logout + HR profile standardised across the dashboard and all 14 HRMS pages |
| Authentication | In-profile password change removed; Forgot-Password flow redesigned |
| Email system | Migrated outbound mail to Microsoft Graph API; inbound moved to Microsoft 365 (MX) |
| CRM expansion | New **Pre-Sales** and **Post-Sales** panels added to the Sales System |
| Status | Code complete & verified; awaiting DNS propagation + Hostinger uploads |

---

## 2. HRMS — Logout & Profile

- Added the HR profile block (avatar, name, role) to the **top-right corner** of the HRMS dashboard.
- Added an employee-system-style rose **"⏻ Logout"** pill at the **bottom-left** of the sidebar.
- Applied the same pattern consistently to **all 14 HRMS pages** (Employees, Attendance, Requests, Shift Requests, Candidates, Interviews, Careers, Onboarding, Orientation, Deployment, Offboarding, Offer Letters, Escalations, Performance).
- Reused each page's existing element IDs so name/role keep auto-populating from the logged-in user.

---

## 3. Login & Password Reset

- **Removed** the in-app "Change Password" panel from the employee Profile (Security tab now keeps only Active Sessions and 2FA).
- **Redesigned** the Forgot-Password page into a polished 3-step flow:
  1. Enter account email (validated)
  2. Verify 6-digit OTP (resend / change-email options)
  3. Set + confirm new password (live strength meter and match check)
  4. Auto-redirect to the login page on success.

---

## 4. Email System Migration (Hostinger → Microsoft 365)

### 4.1 Sending — Microsoft Graph API
- Reworked `Backend/utils/sendEmail.js` to send via **Microsoft Graph** (SMTP kept as automatic fallback).
- Created an Entra **app registration** ("Zyntrix CRM Mailer") with application permission **`Mail.Send`** (admin consent granted).
- Configured the VM `.env` with tenant/client/secret + sender `hr@zyntrixsoftware.com`.
- **Result:** test send returned `✅ SENT OK`. MFA and Security Defaults remain enabled — no app passwords used.

### 4.2 Receiving — MX to Microsoft 365
- Updated DNS at Hostinger for `zyntrixsoftware.com`:
  - **MX** → `zyntrixsoftware-com.mail.protection.outlook.com` (priority 0)
  - **SPF (TXT)** → `v=spf1 include:spf.protection.outlook.com -all`
  - **CNAME** `autodiscover` → `autodiscover.outlook.com` (verified green)
  - Old Hostinger MX records removed.
- **Status:** autodiscover verified; MX/TXT awaiting DNS propagation (up to a few hours due to old 4-hour TTL).

---

## 5. CRM Expansion — New Panels

### 5.1 Pre-Sales (`presales.html`)
- KPI strip: Active Prospects · Qualified · Upcoming Demos · Conversion Rate.
- Tabs: **Pipeline** (funnel + sources + pipeline value), **Inquiries & Qualification** (queue with live stage change), **Demos & Follow-ups**, **Quotes** (quote/proposal generator).

### 5.2 Post-Sales (`postsales.html`)
- KPI strip: Active Students · Collected (Month) · Outstanding · Overdue.
- Tabs: **Onboarding & Payments** (fee-progress, balance, due dates), **Support Tickets**, **Renewals & Upsells** (fully-paid vs at-risk students).

### 5.3 Integration
- Added a **"Customer Lifecycle"** navigation group (Pre-Sales, Post-Sales) to every Sales System page.
- Both panels reuse existing sales APIs — no backend or schema changes.

---

## 6. Verification

- All edited inline JavaScript passed `node --check`.
- HTML markup confirmed balanced (open/close `<div>` counts match) on every changed page.
- Graph email send tested live and confirmed delivered.

---

## 7. Pending / Next Steps

| # | Item | Owner |
|---|---|---|
| 1 | Wait for MX/TXT health check to turn green, then test inbound mail | You |
| 2 | Run the live Forgot-Password OTP test with an employee account | You |
| 3 | Upload changed Frontend files (HRMS pages, forgot-password, sales panels) to Hostinger | You |
| 4 | **Rotate exposed secrets** (Graph client secret, `JWT_SECRET`, Mongo URI) | You |
| 5 | (Optional) Enable Microsoft DKIM for best deliverability | You |
| 6 | (Optional) Add backend persistence for support tickets & quotes | Dev |

---

*Report generated for the Zyntrix CRM development log — 6 June 2026.*
