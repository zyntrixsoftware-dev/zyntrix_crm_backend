/* ═══════════════════════════════════════════════════════════
   data-loader.js  —  ZyntrixCRM  Dynamic Data Layer
   Fetches imported records and maps them to the shape each
   page expects. All pages call initPage() on load.
═══════════════════════════════════════════════════════════ */

/* ─── owner colour pool ──────────────────────────────────── */
const _PALETTE = ['#00e5b0','#3d8ef0','#b57bee','#f5a623','#22d3ee','#ff7d40','#ff4d6d','#22c55e'];
const _ownerMap = {};
let   _palIdx   = 0;
function ownerColor(name) {
  if (!name) return _PALETTE[0];
  if (!_ownerMap[name]) _ownerMap[name] = _PALETTE[_palIdx++ % _PALETTE.length];
  return _ownerMap[name];
}
function ownerInit(name) {
  if (!name) return '?';
  return name.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().substring(0, 2);
}

/* ─── number cleaner ──────────────────────────────────────── */
function toNum(v) {
  const n = parseFloat(String(v ?? '').replace(/[₹$€£,\s]/g, ''));
  return isNaN(n) ? 0 : n;
}

/* ─── flexible field getter ──────────────────────────────── */
function pick(rec, ...keys) {
  for (const k of keys) {
    const v = rec[k];
    if (v !== undefined && v !== null && v !== '') return v;
    // case-insensitive fallback
    const lk = k.toLowerCase();
    for (const rk of Object.keys(rec)) {
      if (rk.toLowerCase() === lk && rec[rk] !== undefined && rec[rk] !== '') return rec[rk];
    }
  }
  return '';
}

/* ─── record mappers ──────────────────────────────────────── */
function mapLead(r, i) {
  const name  = pick(r,'name','full_name','lead_name','contact_name','Name') || `Lead ${i+1}`;
  const owner = pick(r,'owner','assigned_to','rep','sales_rep','Owner','Assigned To');
  return {
    id:           r._id || i + 1,
    name,
    company:      pick(r,'company','company_name','organization','account','Company'),
    email:        pick(r,'email','email_address','Email'),
    phone:        pick(r,'phone','mobile','contact_number','Phone','Mobile'),
    title:        pick(r,'title','job_title','designation','role','Title','Job Title'),
    size:         pick(r,'size','company_size','Size') || '—',
    source:       pick(r,'source','lead_source','channel','Source') || 'Import',
    status:       pick(r,'status','lead_status','Status') || 'New',
    score:        parseInt(pick(r,'score','lead_score','rating','Score')) || 50,
    owner,
    oi:           ownerInit(owner),
    oCol:         ownerColor(owner),
    product:      pick(r,'product','product_interest','interest','Product'),
    budget:       toNum(pick(r,'budget','est_budget','Budget','Est Budget')),
    notes:        pick(r,'notes','remarks','comments','Notes'),
    created:      pick(r,'created','created_date','date','Created','Date') || new Date().toISOString().slice(0,10),
    lastActivity: pick(r,'last_activity','last_contact','updated','Last Activity') || new Date().toISOString().slice(0,10),
    converted:    String(pick(r,'converted','is_converted')).toLowerCase() === 'true',
    dealName:     pick(r,'deal_name','deal','Deal Name'),
    dealValue:    toNum(pick(r,'deal_value','Deal Value')),
    convDate:     pick(r,'conv_date','converted_date','Conv Date'),
  };
}

function mapDeal(r, i) {
  const name  = pick(r,'name','deal_name','opportunity','title','Name','Deal Name') || `Deal ${i+1}`;
  const owner = pick(r,'owner','assigned_to','rep','sales_rep','Owner','Assigned To');
  return {
    id:          r._id || i + 1,
    name,
    company:     pick(r,'company','company_name','account','client','Company'),
    owner,
    oi:          ownerInit(owner),
    oCol:        ownerColor(owner),
    value:       toNum(pick(r,'value','deal_value','amount','revenue','Value','Deal Value','Amount')),
    acv:         toNum(pick(r,'acv','value','amount','ACV','Value')),
    stage:       pick(r,'stage','deal_stage','status','Stage') || 'Prospecting',
    prob:        parseInt(pick(r,'prob','probability','win_prob','Probability')) || 50,
    close:       pick(r,'close','close_date','expected_close','Close Date','Close'),
    source:      pick(r,'source','lead_source','channel','Source') || 'Import',
    product:     pick(r,'product','product_name','Product'),
    priority:    pick(r,'priority','Priority') || 'Medium',
    notes:       pick(r,'notes','remarks','Notes'),
    created:     pick(r,'created','created_date','Created') || new Date().toISOString().slice(0,10),
    lastContact: pick(r,'last_contact','last_activity','Last Contact'),
    lossReason:  pick(r,'loss_reason','lost_reason','Loss Reason'),
  };
}

function mapCandidate(r, i) {
  const name = pick(r,'name','full_name','candidate_name','Name','Full Name') || `Candidate ${i+1}`;
  return {
    id:    r._id || i + 1,
    name,
    init:  ownerInit(name),
    col:   _PALETTE[i % _PALETTE.length],
    email: pick(r,'email','Email'),
    phone: pick(r,'phone','mobile','Phone','Mobile'),
    role:  pick(r,'role','position','job_title','designation','Role','Position'),
    qual:  pick(r,'qualification','education','degree','Qualification','Education'),
    loc:   pick(r,'location','city','Location','City'),
    exp:   pick(r,'experience','exp','years_experience','Experience'),
    source:pick(r,'source','channel','Source') || 'Import',
    date:  pick(r,'date','applied_date','created','Date'),
    stage: pick(r,'stage','status','Stage','Status') || 'Applied',
    score: parseInt(pick(r,'score','rating','Score')) || 70,
    skills: pick(r,'skills','tech_stack','Skills') ? String(pick(r,'skills','tech_stack','Skills')).split(',').map(s=>s.trim()).filter(Boolean) : [],
    competencies:{ Technical:70,Communication:65,'Problem Solving':68,'Culture Fit':65,Leadership:62 },
    notes: pick(r,'notes','remarks','Notes'),
  };
}

/* ─── empty state HTML generator ─────────────────────────── */
function emptyStateHTML(system, type, targetContainerId) {
  const importURL = (() => {
    // figure out relative depth by counting path segments
    const depth = window.location.pathname.split('/').filter(Boolean).length;
    const back  = depth > 2 ? '../'.repeat(depth - 2) : '';
    return `${back}modules/import.html?system=${system}&type=${type}`;
  })();

  return `
  <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
    height:100%;min-height:400px;text-align:center;padding:60px 24px;">
    <div style="font-size:56px;margin-bottom:20px;opacity:0.5;">📭</div>
    <div style="font-family:var(--display);font-size:20px;font-weight:700;color:var(--text);margin-bottom:10px;">
      No ${type} data yet
    </div>
    <div style="font-size:14px;color:var(--text3);max-width:400px;margin-bottom:28px;line-height:1.7;">
      Import your Excel spreadsheet to populate this page with real data.
      All charts, KPIs, and tables will update automatically.
    </div>
    <a href="${importURL}"
      style="display:inline-flex;align-items:center;gap:9px;padding:12px 26px;
      background:var(--accent);color:var(--bg);border-radius:10px;font-size:14px;
      font-weight:700;text-decoration:none;font-family:var(--display);
      box-shadow:0 0 24px rgba(0,229,176,0.3);transition:opacity 0.15s;"
      onmouseover="this.style.opacity='.85'" onmouseout="this.style.opacity='1'">
      ↑ Import ${type.charAt(0).toUpperCase()+type.slice(1)} from Excel
    </a>
    <div style="margin-top:20px;font-size:12px;color:var(--text3);">
      Supports .xlsx &amp; .xls · Maps columns automatically · Live instantly
    </div>
  </div>`;
}

/* ─── populate a <select> filter from data ───────────────── */
function populateFilter(selectId, values, allLabel = 'All') {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const unique = [...new Set(values.filter(Boolean))].sort();
  const current = sel.value;
  sel.innerHTML = `<option value="">${allLabel}</option>` +
    unique.map(v => `<option value="${v}"${v===current?' selected':''}>${v}</option>`).join('');
}

/* ─── main loader used by each page ─────────────────────────
   Usage:
     loadPageData('sales','leads', records => { LEADS = records.map(mapLead); renderCurrentView(); }, 'content')
──────────────────────────────────────────────────────────── */
async function loadPageData(system, type, mapper, onSuccess, contentId = 'content-area') {
  // Show skeleton while loading
  const area = document.getElementById(contentId);
  if (area) area.style.opacity = '0.4';

  try {
    const result = await getRecords(system, type, 1, 1000);

    if (area) area.style.opacity = '1';

    if (result.error || !result.records || result.records.length === 0) {
      if (area) area.innerHTML = emptyStateHTML(system, type);
      return false;
    }

    const mapped = result.records.map(mapper);
    onSuccess(mapped);
    return true;

  } catch (err) {
    console.warn('loadPageData failed:', err);
    if (area) {
      area.style.opacity = '1';
      area.innerHTML = emptyStateHTML(system, type);
    }
    return false;
  }
}
