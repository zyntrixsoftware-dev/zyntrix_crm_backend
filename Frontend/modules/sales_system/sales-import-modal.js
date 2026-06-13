/**
 * Sales System — Multi-Format Import Modal
 * Works for: leads, courses, batches, demos, followups, coupons, commlogs, referrals, targets
 *
 * Usage in any sales page:
 *   openSalesImport(type, fieldsConfig, onSuccess)
 *
 * type         — "leads" | "courses" | "batches" | ...
 * fieldsConfig — array of { key, label, required, guess[] }
 * onSuccess    — callback() after import done
 */

// ── Field configs per entity ─────────────────────────────────────────────────
const SALES_IMPORT_FIELDS = {
  leads: [
    { key:"fullName",      label:"Full Name",      required:true,  guess:["full name","fullname","name","student name"] },
    { key:"phone",         label:"Phone",          required:false, guess:["phone","mobile","contact","cell","number"] },
    { key:"email",         label:"Email",          required:false, guess:["email","e-mail","mail"] },
    { key:"city",          label:"City",           required:false, guess:["city","location","place"] },
    { key:"course",        label:"Course",         required:false, guess:["course","course interest","program","interested course","course name"] },
    { key:"budget",        label:"Budget (₹)",     required:false, guess:["budget","budget (₹)","amount","fee budget"] },
    { key:"pipelineStage", label:"Pipeline Stage", required:false, guess:["pipeline stage","stage","status"] },
    { key:"source",        label:"Source",         required:false, guess:["source","lead source","how did you hear"] },
    { key:"followUpDate",  label:"Follow Up Date", required:false, guess:["follow up date","followupdate","followup","next call"] },
    { key:"notes",         label:"Notes",          required:false, guess:["notes","remarks","comment"] }
  ],
  courses: [
    { key:"title",         label:"Title",           required:true,  guess:["title","course name","name","course"] },
    { key:"category",      label:"Category",        required:false, guess:["category","type","subject"] },
    { key:"price",         label:"Price (₹)",       required:false, guess:["price","price (₹)","mrp","fee"] },
    { key:"discountPrice", label:"Discount Price",  required:false, guess:["discount price","selling price","offer price","discount price (₹)"] },
    { key:"mode",          label:"Mode",            required:false, guess:["mode","delivery","online/offline"] },
    { key:"durationWeeks", label:"Duration (Weeks)",required:false, guess:["duration","duration (weeks)","weeks"] }
  ],
  batches: [
    { key:"batchCode",   label:"Batch Code",    required:true,  guess:["batch code","batchcode","code","batch"] },
    { key:"courseTitle", label:"Course Title",  required:false, guess:["course title","course","course name"] },
    { key:"startDate",   label:"Start Date",    required:false, guess:["start date","start","from"] },
    { key:"endDate",     label:"End Date",      required:false, guess:["end date","end","to"] },
    { key:"totalSeats",  label:"Total Seats",   required:false, guess:["total seats","seats","capacity"] },
    { key:"mode",        label:"Mode",          required:false, guess:["mode","delivery"] },
    { key:"status",      label:"Status",        required:false, guess:["status","batch status"] }
  ],
  coupons: [
    { key:"code",          label:"Code",           required:true,  guess:["code","coupon code","coupon"] },
    { key:"couponType",    label:"Type",           required:false, guess:["coupon type","type"] },
    { key:"discountType",  label:"Discount Type",  required:false, guess:["discount type","type of discount"] },
    { key:"discountValue", label:"Discount Value", required:false, guess:["discount value","value","discount","value"] },
    { key:"maxUses",       label:"Max Uses",       required:false, guess:["max uses","max","limit","maximum uses"] },
    { key:"validTill",     label:"Valid Till",     required:false, guess:["valid till","expiry","expires","valid till"] }
  ],
  demos: [
    { key:"leadPhone",    label:"Lead Phone",    required:true,  guess:["lead phone","phone","mobile","student phone"] },
    { key:"scheduledAt",  label:"Scheduled At",  required:false, guess:["scheduled at","scheduled","date","datetime"] },
    { key:"conductedBy",  label:"Conducted By",  required:false, guess:["conducted by","conductedby","by","counselor"] },
    { key:"outcome",      label:"Outcome",       required:false, guess:["outcome","result","status"] },
    { key:"notes",        label:"Notes",         required:false, guess:["notes","remarks"] }
  ],
  followups: [
    { key:"leadPhone",   label:"Lead Phone", required:true,  guess:["lead phone","phone","mobile"] },
    { key:"dueAt",       label:"Due At",     required:false, guess:["due at","due","scheduled","date"] },
    { key:"type",        label:"Type",       required:false, guess:["type","follow up type","method"] },
    { key:"notes",       label:"Notes",      required:false, guess:["notes","remarks"] },
    { key:"isCompleted", label:"Completed",  required:false, guess:["is completed","completed","done"] }
  ],
  commlogs: [
    { key:"leadPhone", label:"Lead Phone", required:true,  guess:["lead phone","phone","mobile"] },
    { key:"type",      label:"Type",       required:false, guess:["type","comm type","channel"] },
    { key:"direction", label:"Direction",  required:false, guess:["direction","inbound/outbound"] },
    { key:"summary",   label:"Summary",    required:false, guess:["summary","notes","description"] },
    { key:"duration",  label:"Duration",   required:false, guess:["duration","duration (min)","duration (seconds)"] },
    { key:"loggedAt",  label:"Logged At",  required:false, guess:["logged at","date","created at"] }
  ],
  referrals: [
    { key:"referredByPhone", label:"Referred By Phone",  required:false, guess:["referred by phone","referrer phone","by phone"] },
    { key:"referredByName",  label:"Referred By Name",   required:false, guess:["referred by name","referrer","name","referred by (leadid)"] },
    { key:"referredLeadPhone",label:"Referred Lead Phone",required:true, guess:["referred lead phone","new lead phone","lead phone"] },
    { key:"incentiveType",   label:"Incentive Type",     required:false, guess:["incentive type","incentive"] },
    { key:"incentiveValue",  label:"Incentive Value (₹)",required:false, guess:["incentive value","value","amount"] },
    { key:"status",          label:"Status",             required:false, guess:["status","referral status"] }
  ],
  targets: [
    { key:"repEmail",           label:"Rep Email",           required:false, guess:["rep email","email","user"] },
    { key:"month",              label:"Month",               required:false, guess:["month"] },
    { key:"year",               label:"Year",                required:false, guess:["year"] },
    { key:"targetLeads",        label:"Target Leads",        required:false, guess:["target leads","leads target"] },
    { key:"targetDemos",        label:"Target Demos",        required:false, guess:["target demos","demos target"] },
    { key:"targetEnrollments",  label:"Target Enrollments",  required:false, guess:["target enrollments","enroll target"] },
    { key:"targetRevenue",      label:"Target Revenue (₹)",  required:false, guess:["target revenue","revenue target","target revenue (₹)"] }
  ]
};

// ── State ────────────────────────────────────────────────────────────────────
let _importType = "", _importFields = [], _importCallback = null;
let _pendingRows = [], _pendingHeaders = [], _pendingSource = "xlsx";

// ── Entry point ──────────────────────────────────────────────────────────────
function openSalesImport(type, onSuccess) {
  _importType     = type;
  _importFields   = SALES_IMPORT_FIELDS[type] || [];
  _importCallback = onSuccess;
  _pendingRows    = [];
  _pendingHeaders = [];

  // Update modal title
  const titles = {
    leads:"Student Leads", courses:"Courses", batches:"Batches",
    demos:"Demo Sessions", followups:"Follow-Ups", coupons:"Coupons",
    commlogs:"Comm Logs", referrals:"Referrals", targets:"Sales Targets"
  };
  document.getElementById("sim-modal-title").textContent = "Import " + (titles[type] || type);
  document.getElementById("sim-link-panel").style.display = "none";

  // Show source picker, hide mapping
  document.getElementById("sim-source-grid").style.display = "grid";
  document.getElementById("sim-map-section").style.display = "none";
  document.getElementById("sim-map-confirm-btn").style.display = "none";

  document.getElementById("sim-overlay").classList.add("open");
}

function closeSalesImport() {
  document.getElementById("sim-overlay").classList.remove("open");
}

// ── Source selection ─────────────────────────────────────────────────────────
function simPickFile(accept, source) {
  const inp = document.getElementById("sim-file-input");
  inp.accept = accept;
  inp.dataset.source = source;
  inp.value = "";
  inp.click();
}

function simOpenLink() {
  document.getElementById("sim-link-panel").style.display = "block";
}

async function simOnFilePicked(e) {
  const file   = e.target.files[0];
  const source = e.target.dataset.source || "xlsx";
  if (!file) return;
  simSetStatus("⏳ Parsing " + file.name + "…");
  try {
    let rows = [];
    if (source === "xlsx" || source === "csv" || source === "tsv") {
      rows = await simParseSpreadsheet(file, source);
    } else if (source === "html") {
      rows = await simParseHtml(file);
    } else if (source === "pdf") {
      rows = await simParsePdf(file);
    }
    if (!rows.length) { simSetStatus("❌ No rows could be parsed."); return; }
    _pendingRows    = rows;
    _pendingHeaders = Object.keys(rows[0]);
    _pendingSource  = source;
    simSetStatus("✅ Parsed " + rows.length + " rows — now map your columns below");
    simOpenMapping();
  } catch (err) {
    simSetStatus("❌ " + err.message);
  }
}

async function simFetchFromLink() {
  const url = document.getElementById("sim-link-url").value.trim();
  if (!url) return;
  simSetStatus("⏳ Fetching from link…");
  const API_BASE = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
    ? "http://localhost:5000/api" : "https://api.zyntrixsoftware.com/api";
  try {
    const res = await fetch(API_BASE + "/hr/candidates/import-from-link", {
      method: "POST",
      headers: { "Content-Type": "application/json",
        Authorization: "Bearer " + (sessionStorage.getItem("token") || "") },
      body: JSON.stringify({ url })
    });
    const data = await res.json();
    if (!res.ok) { simSetStatus("❌ " + (data.msg || "Fetch failed")); return; }
    let rows = [];
    if (data.format === "xlsx") {
      const bytes = Uint8Array.from(atob(data.data), c => c.charCodeAt(0));
      const wb = XLSX.read(bytes, { type:"array" });
      const sh = wb.Sheets[wb.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(sh, { defval:"" });
    } else {
      const wb = XLSX.read(data.data, { type:"string" });
      const sh = wb.Sheets[wb.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(sh, { defval:"" });
    }
    if (!rows.length) { simSetStatus("❌ Link fetched but no rows found."); return; }
    _pendingRows    = rows;
    _pendingHeaders = Object.keys(rows[0]);
    _pendingSource  = data.source || "google_sheets";
    simSetStatus("✅ Fetched " + rows.length + " rows");
    simOpenMapping();
  } catch (err) {
    simSetStatus("❌ " + err.message);
  }
}

// ── Parsers ─────────────────────────────────────────────────────────────────
function simParseSpreadsheet(file, source) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: source === "xlsx" ? "array" : "string" });
        resolve(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval:"" }));
      } catch (err) { reject(err); }
    };
    r.onerror = () => reject(new Error("File read failed"));
    source === "xlsx" ? r.readAsArrayBuffer(file) : r.readAsText(file);
  });
}

function simParseHtml(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = (e) => {
      try {
        const doc   = new DOMParser().parseFromString(e.target.result, "text/html");
        const table = doc.querySelector("table");
        if (!table) return reject(new Error("No <table> found in HTML"));
        const wb = XLSX.utils.table_to_book(table);
        resolve(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval:"" }));
      } catch (err) { reject(err); }
    };
    r.onerror = () => reject(new Error("File read failed"));
    r.readAsText(file);
  });
}

async function simParsePdf(file) {
  if (!window.pdfjsLib) throw new Error("pdf.js not loaded — try Excel or CSV instead");
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const lines = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const txt  = await page.getTextContent();
    let buf2 = "", lastY = null;
    for (const it of txt.items) {
      const y = it.transform[5];
      if (lastY !== null && Math.abs(y - lastY) > 2) { if (buf2.trim()) lines.push(buf2.trim()); buf2 = ""; }
      buf2 += (buf2 ? " " : "") + it.str; lastY = y;
    }
    if (buf2.trim()) lines.push(buf2.trim());
  }
  const rows = [];
  for (const line of lines) {
    const emailM = line.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
    if (emailM) {
      const email = emailM[0];
      const rest  = line.replace(email, "").trim();
      const phoneM = rest.match(/[+\d][\d\s\-(]{7,}/);
      const phone  = phoneM ? phoneM[0].trim() : "";
      const name   = rest.replace(phoneM ? phoneM[0] : "", "").replace(/[|,;]+/g," ").trim() || "Unknown";
      rows.push({ "Full Name": name, "Email": email, "Phone": phone });
    } else {
      // Try phone-only lines for leads
      const phoneM2 = line.match(/^[+\d][\d\s\-()]{8,}$/);
      if (phoneM2) rows.push({ "Phone": phoneM2[0].trim(), "Full Name": "" });
    }
  }
  if (!rows.length) throw new Error("No recognizable rows in PDF — use CSV/Excel for structured data");
  return rows;
}

// ── Mapping UI ────────────────────────────────────────────────────────────────
function simGuessHeader(guesses, headers) {
  for (const g of guesses) {
    const match = headers.find(h => h.toLowerCase().replace(/[^a-z0-9]/g," ").trim() === g.toLowerCase().replace(/[^a-z0-9]/g," ").trim());
    if (match) return match;
  }
  // Partial match
  for (const g of guesses) {
    const match = headers.find(h => h.toLowerCase().includes(g.toLowerCase()) || g.toLowerCase().includes(h.toLowerCase()));
    if (match) return match;
  }
  return "";
}

function simOpenMapping() {
  document.getElementById("sim-source-grid").style.display = "none";
  document.getElementById("sim-link-panel").style.display  = "none";
  document.getElementById("sim-map-section").style.display = "block";
  document.getElementById("sim-map-confirm-btn").style.display = "inline-flex";
  document.getElementById("sim-map-count").textContent = _pendingRows.length + " rows";

  document.getElementById("sim-map-form").innerHTML = _importFields.map(f => {
    const auto = simGuessHeader(f.guess, _pendingHeaders);
    const opts = `<option value="">— Skip —</option>` +
      _pendingHeaders.map(h =>
        `<option value="${h.replace(/"/g,'&quot;')}" ${auto===h?"selected":""}>${h}</option>`
      ).join("");
    return `<div style="display:grid;grid-template-columns:160px 24px 1fr;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.05)">
      <div style="font-size:12px;font-weight:600;color:var(--text2)">${f.label}${f.required?'<span style="color:var(--rose)"> *</span>':''}</div>
      <div style="color:var(--text3);text-align:center">→</div>
      <select id="simmap-${f.key}" style="background:var(--bg3);border:1px solid rgba(255,255,255,.11);border-radius:6px;color:var(--text);font-family:var(--font);font-size:12px;padding:5px 8px;outline:none;width:100%">${opts}</select>
    </div>`;
  }).join("");
}

// ── Commit import ─────────────────────────────────────────────────────────────
async function simCommitImport() {
  const btn = document.getElementById("sim-map-confirm-btn");
  btn.disabled = true;
  btn.textContent = "Importing…";
  simSetStatus("⏳ Uploading to server…");

  // Build mapping from the selects
  const mapping = _importFields.map(f => ({
    excelHeader: document.getElementById("simmap-" + f.key)?.value || "",
    systemKey: f.key
  })).filter(m => m.excelHeader);

  // Re-map pendingRows using the mapping, then reconstruct as CSV for FormData
  const remapped = _pendingRows.map(row => {
    const obj = {};
    mapping.forEach(m => { if (row[m.excelHeader] !== undefined) obj[m.excelHeader] = row[m.excelHeader]; });
    return obj;
  });

  // Convert remapped rows to CSV blob and send as file upload
  const headers = [...new Set(mapping.map(m => m.excelHeader))];
  const csvLines = [headers.map(h => `"${h}"`).join(","),
    ...remapped.map(row => headers.map(h => `"${String(row[h]||"").replace(/"/g,'""')}"`).join(","))
  ];
  const csvBlob = new Blob([csvLines.join("\n")], { type: "text/csv" });
  const fd = new FormData();
  fd.append("file", csvBlob, "import.csv");

  const API_BASE = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
    ? "http://localhost:5000/api" : "https://api.zyntrixsoftware.com/api";

  try {
    const res = await fetch(API_BASE + "/sales/import/" + _importType, {
      method: "POST",
      headers: { Authorization: "Bearer " + (sessionStorage.getItem("token") || "") },
      body: fd
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.msg || "Import failed");

    const errList = (data.errors||[]).slice(0,5).map(e => `<li>${e.row}: ${e.err}</li>`).join("");
    simSetStatus(`✅ Done — <strong>${data.inserted||0}</strong> imported, ${data.skipped||0} skipped${errList?`, <span style="color:var(--rose)">${data.errors.length} errors</span>`:""}`);
    document.getElementById("sim-errors").innerHTML = errList
      ? `<ul style="margin:8px 0 0 16px;font-size:11px;color:var(--rose)">${errList}</ul>` : "";

    setTimeout(() => {
      closeSalesImport();
      if (_importCallback) _importCallback(data);
    }, 1800);
  } catch (err) {
    simSetStatus("❌ " + err.message);
    btn.disabled = false;
    btn.textContent = "Import";
  }
}

function simSetStatus(msg) {
  const el = document.getElementById("sim-status");
  if (el) el.innerHTML = msg;
}

// ── Inject modal HTML into DOM on load ───────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  // Load xlsx.js if not already present
  if (!window.XLSX) {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    document.head.appendChild(s);
  }
  // Load pdf.js
  if (!window.pdfjsLib) {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    document.head.appendChild(s);
  }

  // Inject the modal HTML
  const modal = document.createElement("div");
  modal.innerHTML = `
<style>
.sim-overlay{position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:500;display:none;align-items:center;justify-content:center}
.sim-overlay.open{display:flex}
.sim-modal{background:#0d1624;border:1px solid rgba(255,255,255,.11);border-radius:16px;width:620px;max-width:95vw;max-height:90vh;display:flex;flex-direction:column;overflow:hidden}
.sim-hdr{padding:20px 24px;border-bottom:1px solid rgba(255,255,255,.06);display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
.sim-title{font-family:var(--display,'Syne',sans-serif);font-size:16px;font-weight:700;color:#e8f0fe}
.sim-close{background:none;border:none;color:#4e6680;cursor:pointer;font-size:20px;line-height:1;padding:2px}.sim-close:hover{color:#e8f0fe}
.sim-body{padding:20px 24px;overflow-y:auto;flex:1}
.sim-source-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:0}
.sim-src-card{background:#111e30;border:1px solid rgba(255,255,255,.07);border-radius:12px;padding:18px 12px;text-align:center;cursor:pointer;transition:all .15s}
.sim-src-card:hover{border-color:rgba(0,229,176,.4);background:rgba(0,229,176,.06)}
.sim-src-icon{font-size:28px;margin-bottom:8px}
.sim-src-name{font-size:12.5px;font-weight:700;color:#e8f0fe;margin-bottom:3px}
.sim-src-desc{font-size:10.5px;color:#4e6680}
.sim-link-input{width:100%;background:#111e30;border:1px solid rgba(255,255,255,.11);border-radius:8px;color:#e8f0fe;font-size:12px;padding:9px 12px;outline:none;margin-top:8px;box-sizing:border-box}
.sim-link-input:focus{border-color:#00e5b0}
.sim-status{margin-top:12px;font-size:12px;color:#8ba3bf;min-height:20px}
.sim-ft{padding:14px 24px;border-top:1px solid rgba(255,255,255,.06);display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
.sim-btn{display:inline-flex;align-items:center;gap:5px;padding:8px 18px;border-radius:8px;border:none;cursor:pointer;font-size:12.5px;font-weight:600;transition:all .15s;font-family:inherit}
.sim-btn-prim{background:#00e5b0;color:#080e18}.sim-btn-prim:hover{background:#00c99a}
.sim-btn-ghost{background:transparent;border:1px solid rgba(255,255,255,.11);color:#8ba3bf}.sim-btn-ghost:hover{background:#111e30;color:#e8f0fe}
.sim-btn:disabled{opacity:.4;cursor:not-allowed}
</style>

<div class="sim-overlay" id="sim-overlay">
  <div class="sim-modal">
    <div class="sim-hdr">
      <div>
        <div class="sim-title" id="sim-modal-title">Import Data</div>
        <div style="font-size:11.5px;color:#4e6680;margin-top:2px">Choose where your data is coming from</div>
      </div>
      <button class="sim-close" onclick="closeSalesImport()">×</button>
    </div>
    <div class="sim-body">
      <!-- Source grid -->
      <div class="sim-source-grid" id="sim-source-grid">
        <div class="sim-src-card" onclick="simPickFile('.xlsx,.xls','xlsx')">
          <div class="sim-src-icon">📊</div>
          <div class="sim-src-name">Excel (.xlsx / .xls)</div>
          <div class="sim-src-desc">Parsed in your browser</div>
        </div>
        <div class="sim-src-card" onclick="simPickFile('.csv','csv')">
          <div class="sim-src-icon">📄</div>
          <div class="sim-src-name">CSV</div>
          <div class="sim-src-desc">Comma-separated values</div>
        </div>
        <div class="sim-src-card" onclick="simPickFile('.tsv,.txt','tsv')">
          <div class="sim-src-icon">📃</div>
          <div class="sim-src-name">TSV</div>
          <div class="sim-src-desc">Tab-separated values</div>
        </div>
        <div class="sim-src-card" onclick="simPickFile('.html,.htm','html')">
          <div class="sim-src-icon">🌐</div>
          <div class="sim-src-name">HTML Table</div>
          <div class="sim-src-desc">First &lt;table&gt; on the page</div>
        </div>
        <div class="sim-src-card" onclick="simPickFile('.pdf','pdf')">
          <div class="sim-src-icon">📕</div>
          <div class="sim-src-name">PDF</div>
          <div class="sim-src-desc">Best-effort text extraction</div>
        </div>
        <div class="sim-src-card" onclick="simOpenLink()">
          <div class="sim-src-icon">🔗</div>
          <div class="sim-src-name">Google Sheets / OneDrive</div>
          <div class="sim-src-desc">Paste a share link</div>
        </div>
      </div>

      <!-- Link panel -->
      <div id="sim-link-panel" style="display:none;margin-top:16px;padding-top:16px;border-top:1px solid rgba(255,255,255,.06)">
        <div style="font-size:12px;font-weight:600;color:#8ba3bf;margin-bottom:6px">Paste Google Sheets or OneDrive share link</div>
        <input class="sim-link-input" id="sim-link-url" placeholder="https://docs.google.com/spreadsheets/d/... or OneDrive share link">
        <div style="font-size:11px;color:#4e6680;margin-top:6px;line-height:1.5">
          Google Sheets: <strong>File → Share → Anyone with the link</strong> · OneDrive: copy the Embed or public share link
        </div>
        <div style="margin-top:10px;display:flex;gap:8px;justify-content:flex-end">
          <button class="sim-btn sim-btn-ghost" onclick="document.getElementById('sim-link-panel').style.display='none'">Cancel</button>
          <button class="sim-btn sim-btn-prim" onclick="simFetchFromLink()">Fetch & Parse</button>
        </div>
      </div>

      <!-- Mapping section -->
      <div id="sim-map-section" style="display:none">
        <div style="font-size:11px;color:#4e6680;margin-bottom:12px;font-weight:600;text-transform:uppercase;letter-spacing:.5px">Map Your Columns → System Fields</div>
        <div id="sim-map-form"></div>
      </div>

      <div class="sim-status" id="sim-status"></div>
      <div id="sim-errors"></div>
    </div>
    <div class="sim-ft">
      <div style="font-size:11px;color:#4e6680" id="sim-map-count"></div>
      <div style="display:flex;gap:8px">
        <button class="sim-btn sim-btn-ghost" onclick="closeSalesImport()">Cancel</button>
        <button class="sim-btn sim-btn-prim" id="sim-map-confirm-btn" style="display:none" onclick="simCommitImport()">Import</button>
      </div>
    </div>
  </div>
</div>

<input type="file" id="sim-file-input" style="display:none" onchange="simOnFilePicked(event)">
`;
  document.body.appendChild(modal);
});
