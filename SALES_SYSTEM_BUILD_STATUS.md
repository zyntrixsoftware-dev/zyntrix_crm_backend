# Sales System — Build Status & Handoff Notes
_Last updated: May 27, 2026 — ALL PAGES COMPLETE ✅_

---

## ✅ COMPLETED

### Backend (100% done)

| File | Status |
|------|--------|
| `Backend/models/StudentLead.js` | ✅ Done |
| `Backend/models/Course.js` | ✅ Done |
| `Backend/models/Batch.js` | ✅ Done |
| `Backend/models/DemoSession.js` | ✅ Done |
| `Backend/models/Enrollment.js` | ✅ Done |
| `Backend/models/Payment.js` | ✅ Done |
| `Backend/models/FollowUp.js` | ✅ Done |
| `Backend/models/SalesTarget.js` | ✅ Done |
| `Backend/controllers/salesController.js` | ✅ Done — all CRUD + reports |
| `Backend/routes/salesRoutes.js` | ✅ Done — all 40+ routes |
| `Backend/utils/studentEmails.js` | ✅ Done — 5 GAS email triggers |
| `Backend/server.js` | ✅ Done — sales routes registered at `/api` |

### Frontend Pages (partially done)

| File | Status |
|------|--------|
| `Frontend/modules/sales_system/leads.html` | ✅ Done — Kanban board, drag-drop, add/edit drawer |
| `Frontend/modules/sales_system/courses.html` | ✅ Done — card grid, add/edit drawer, curriculum builder |
| `Frontend/modules/sales_system/batches.html` | ✅ Done — table, seats bar, add/edit drawer |
| `Frontend/modules/sales_system/demos.html` | ✅ Done — table, KPI bar, schedule/mark-attended/reminder |
| `Frontend/modules/sales_system/enrollments.html` | ✅ Done — table, fee progress bar, detail drawer, Record Payment, Issue Certificate |
| `Frontend/modules/sales_system/payments.html` | ✅ Done — KPI cards, table, filter bar, Record Payment drawer, Void with reason |
| `Frontend/modules/sales_system/followups.html` | ✅ Done — Due Today section, pending table, Mark Complete popup, Add Follow-Up drawer |
| `Frontend/modules/sales_system/targets.html` | ✅ Done — month/year picker, rep cards with 4 progress bars, Set Targets drawer, leaderboard |
| `Frontend/modules/sales_system/reports.html` | ✅ Done — Pipeline funnel, Monthly Revenue bars, Conversion funnel, Rep Performance table |

---

## ✅ ALL FRONTEND PAGES COMPLETE

---

## REFERENCE (completed pages spec)

All pages must use the same sidebar nav and CSS variables as the existing pages.
All API calls use `apiRequest(url)` from `../../assets/js/api.js`.
All routes start with `/sales/...` (NOT `/api/sales/...`).

---

### 1. `enrollments.html`

**API calls:**
- `GET /sales/enrollments` — list with filters: `?batch=&course=&status=&lead=`
- `GET /sales/enrollments/:id` — detail with payments array
- `POST /sales/enrollments` — create (body: `lead, batch, course, paymentPlan, totalFee, emiMonths`)
- `PATCH /sales/enrollments/:id` — update (e.g. `completionStatus`, `certificateIssued`, `certificateUrl`)
- `DELETE /sales/enrollments/:id` — delete

**Features to build:**
- Table: student name, course, batch code, plan badge, fee paid/total, status chip
- Color-coded payment status: `feePaid >= totalFee` = green (Paid), `feePaid > 0` = amber (Partial), `feePaid === 0` = rose (Unpaid)
- Click row → open detail drawer:
  - Show enrollment info (course, batch, dates, fee, plan)
  - Show payment history list (from `payments` array in GET /:id response)
  - "Record Payment" button → mini form: amount, method, instalmentNumber, transactionId
  - "Issue Certificate" button → sets `certificateIssued: true` + `certificateUrl` input
- "Enroll Student" button → opens add drawer with dropdowns for lead, course, batch
- URL param support: `?lead=ID` → pre-filter by lead, `?batch=ID` → pre-filter by batch

**Record Payment form fields:**
```
amount (number), method (select: upi/card/bank_transfer/cash/cheque/other),
instalmentNumber (number), transactionId (text), remarks (text)
```
**POST to:** `POST /sales/payments` with body: `{ enrollment, lead, course, amount, method, instalmentNumber, transactionId, remarks }`

---

### 2. `payments.html`

**API calls:**
- `GET /sales/payments/summary` — returns `{ todayTotal, monthTotal, totalCollected, overdueCount }`
- `GET /sales/payments` — list with filters: `?enrollment=&lead=&from=&to=&method=`
- `POST /sales/payments` — record payment
- `DELETE /sales/payments/:id` — void payment (sends `{ reason }` in body)

**Features to build:**
- KPI cards row: Today's Collection, This Month, Total Collected, Overdue Enrollments
- Table: student, course, amount, method badge, instalment#, date, transaction ID, void button
- Filter bar: date range (from/to), method dropdown
- "Record Payment" button → drawer with full payment form
- Void button: `DELETE /sales/payments/:id` with reason — admin only, shows confirmation dialog

---

### 3. `followups.html`

**API calls:**
- `GET /sales/followups?completed=false` — pending follow-ups
- `GET /sales/followups/today` — today's follow-ups for current user
- `POST /sales/followups` — schedule follow-up
- `PATCH /sales/followups/:id` — mark complete

**Features to build:**
- "Due Today" highlighted section at top (amber border)
- Main table: student name, type badge, scheduled date, status (overdue = rose, today = amber, future = blue)
- "Mark Complete" button per row → opens mini popup:
  - outcome dropdown: `no_answer | callback | interested | not_interested | demo_booked | enrolled | dropped`
  - notes textarea
  - nextFollowUp date picker
  - Save button → `PATCH /sales/followups/:id` with `{ isCompleted: true, outcome, notes, nextFollowUp }`
- "Add Follow-Up" button → drawer:
  - Lead dropdown (GET /sales/leads)
  - scheduledAt datetime
  - type: call/whatsapp/email/meeting/other
  - notes

---

### 4. `targets.html`

**API calls:**
- `GET /sales/targets/dashboard?month=&year=` — returns enriched targets with achieved values
- `POST /sales/targets` — upsert target (body: `user, month, year, targetLeads, targetDemos, targetEnrollments, targetRevenue`)

**Features to build:**
- Month/year picker at top
- Cards per sales rep showing:
  - Rep name + avatar
  - 4 progress bars: Leads, Demos, Enrollments, Revenue — each shows achieved/target
  - Overall score % = average of 4 achievement %
- "Set Targets" button → drawer to enter targets for each rep
- Sort by revenue achievement descending (leaderboard style)

---

### 5. `reports.html`

**API calls:**
- `GET /sales/reports/pipeline` — `{ stages: [{_id, count}] }`
- `GET /sales/reports/revenue?months=6` — `{ revenue: [{_id:{year,month}, total, count}] }`
- `GET /sales/reports/conversion` — `{ totalLeads, contacted, demos, demoAttended, enrolled }`
- `GET /sales/reports/rep-performance?month=&year=` — `{ reps: [{user, leads, enrollments, revenue}] }`

**Features to build:**
- No chart library needed — use pure CSS bar charts (div with percentage width)
- Section 1: Pipeline Funnel — horizontal bars per stage showing count + %
- Section 2: Monthly Revenue — bar chart (last 6 months), totals per month
- Section 3: Conversion Funnel — leads → contacted → demo → attended → enrolled with % at each step
- Section 4: Rep Performance Table — name, leads, demos, enrollments, revenue columns, sorted by revenue

---

## IMPORTANT NOTES FOR NEXT SESSION

1. **All API calls:** use `apiRequest("/sales/...")` — NOT `/api/sales/...`
2. **Sidebar nav** — copy exactly from `demos.html` or `batches.html` (same CSS + HTML structure)
3. **CSS variables** — all pages share the same `:root` variables (copy from any existing page)
4. **Error handling pattern:**
   ```js
   const d = await apiRequest("/sales/...");
   if (d.error) { toast(d.msg, "err"); return; }
   ```
5. **Toast function** (same in all pages):
   ```js
   function toast(msg, t="info") {
     const w = document.getElementById("tw");
     const el = document.createElement("div");
     el.className = `toast ${t}`;
     el.textContent = msg;
     w.appendChild(el);
     setTimeout(() => el.remove(), 3500);
   }
   ```
6. **Write files using bash** (not Write tool) to avoid file truncation:
   ```bash
   cat > /sessions/.../mnt/zyntrix_crm_backend-main/Frontend/modules/sales_system/PAGE.html << 'EOF'
   ... html content ...
   EOF
   ```
7. **GAS email for student system:** Add the new handlers to the GAS script (Code.gs or GAS_Script_Fixed.js):
   - `sendStudentWelcome`
   - `sendStudentDemoConfirmation`
   - `sendStudentDemoReminder`
   - `sendStudentEnrollmentConfirmation`
   - `sendStudentCertificate`
   Set `GAS_STUDENT_EMAIL_URL` in Render environment variables.

8. **Deploy:** After all pages are done, push to GitHub → Render auto-deploys backend. Frontend is static HTML.

---

## QUICK TEST CHECKLIST (after everything is built)

- [ ] Create a Course → appears in courses.html
- [ ] Create a Batch for that course → appears in batches.html
- [ ] Add a Student Lead → appears in leads.html kanban
- [ ] Schedule a Demo for the lead → demo appears in demos.html, lead moves to `demo_scheduled`
- [ ] Mark Demo as Attended → lead moves to `demo_attended`
- [ ] Create Enrollment → lead moves to `enrolled`, batch seats increment
- [ ] Record Payment → enrollment feePaid updates, appears in payments.html
- [ ] Add Follow-Up → appears in followups.html Today section
- [ ] Set Sales Target → appears in targets.html
- [ ] Check reports.html — pipeline funnel and revenue charts
