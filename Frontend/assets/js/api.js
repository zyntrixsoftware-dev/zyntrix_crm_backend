// ══════════════════════════════════════════════════════════════════
//  DEPLOYMENT CONFIG
// ══════════════════════════════════════════════════════════════════
// ⚠ UPDATE THIS to your actual Railway backend URL if it changes
const RAILWAY_BACKEND_URL = "https://api.zyntrixsoftware.com";

const API_BASE = (
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1"
)
  ? "http://localhost:5000/api"
  : RAILWAY_BACKEND_URL + "/api";

// ── API REQUEST ───────────────────────────────────────────────────
async function apiRequest(url, method = "GET", body = null) {
  const token = sessionStorage.getItem("token");

  try {
    const res = await fetch(API_BASE + url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token && { Authorization: "Bearer " + token })
      },
      body: body ? JSON.stringify(body) : null
    });

    let data;
    try {
      data = await res.json();
    } catch {
      // Backend returned HTML instead of JSON — usually means:
      // 1. Wrong Railway URL in RAILWAY_BACKEND_URL above
      // 2. Backend is down / deploying
      // 3. CORS blocked the request
      console.error("Non-JSON response from:", API_BASE, "Status:", res.status, "URL:", res.url);
      return {
        error: true,
        msg: res.status === 0 || res.status >= 500
          ? "Backend unreachable — check Railway deployment or RAILWAY_BACKEND_URL in api.js"
          : `Server error (${res.status}) — check backend logs`
      };
    }

    // Auto-logout on 401 (expired / invalid token)
    if (res.status === 401) {
      sessionStorage.removeItem("token");
      sessionStorage.removeItem("user");
      window.location.href = window.location.origin + "/crm/index.html";
      return { error: true, msg: "Session expired. Please log in again." };
    }

    if (!res.ok) {
      return { error: true, msg: data.msg || "Request failed" };
    }

    return data;

  } catch (err) {
    console.error("API ERROR:", err);
    return {
      error: true,
      msg: window.location.hostname === "localhost"
        ? "Backend not reachable. Is the server running on port 5000?"
        : "Cannot reach the server. Please try again."
    };
  }
}

// ── Root path resolver ────────────────────────────────────────────
function _resolveRootPath() {
  return window.location.origin + "/crm/";
}

// ── IMPORT HELPERS ────────────────────────────────────────────────

/**
 * Upload an Excel file with column mapping to the server.
 * @param {File}   file     - the .xlsx File object
 * @param {string} system   - "hrms" | "sales" | "employee"
 * @param {string} type     - e.g. "candidates", "deals", "leads"
 * @param {Array}  mapping  - [{excelHeader, systemKey, label, dataType}]
 */
async function importExcel(file, system, type, mapping) {
  const token = sessionStorage.getItem("token");
  const fd = new FormData();
  fd.append("file", file);
  fd.append("system", system);
  fd.append("type", type);
  fd.append("mapping", JSON.stringify(mapping));

  try {
    const res = await fetch(API_BASE + "/import/upload", {
      method: "POST",
      headers: { ...(token && { Authorization: "Bearer " + token }) },
      body: fd
    });
    const data = await res.json();
    if (!res.ok) return { error: true, msg: data.msg || "Upload failed" };
    return data;
  } catch (err) {
    return { error: true, msg: "Upload failed: " + err.message };
  }
}

/** Fetch the saved column schema for a system+type combo */
async function getSchema(system, type) {
  return await apiRequest(`/import/schema?system=${system}&type=${type}`);
}

/** Fetch paginated imported records */
async function getRecords(system, type, page = 1, limit = 100) {
  return await apiRequest(`/import/records?system=${system}&type=${type}&page=${page}&limit=${limit}`);
}

/** Delete a single record */
async function deleteImportedRecord(id) {
  return await apiRequest(`/import/record/${id}`, "DELETE");
}

/** Fetch all system+type combos this client has imported data for */
async function getImportedTypes() {
  return await apiRequest("/import/types");
}

/**
 * Dynamically render a table using schema + records.
 * @param {Object} schema       - the SchemaConfig object (with .fields array)
 * @param {Array}  records      - array of flat row objects (with _id)
 * @param {string} tbodyId      - id of the <tbody> element
 * @param {string} theadId      - id of the <thead> element
 * @param {Function} [onView]   - optional callback(row) when View is clicked
 * @param {Function} [onDelete] - optional callback(id) when Delete is clicked
 */
function renderDynamicTable(schema, records, tbodyId, theadId, onView, onDelete) {
  const fields = (schema && schema.fields) ? schema.fields : [];
  const thead  = document.getElementById(theadId);
  const tbody  = document.getElementById(tbodyId);
  if (!thead || !tbody) return;

  // Build header
  thead.innerHTML = "<tr>" +
    fields.map(f => `<th>${f.label || f.systemKey}</th>`).join("") +
    "<th>Actions</th>" +
    "</tr>";

  // Build rows
  if (!records || records.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${fields.length + 1}" style="text-align:center;padding:40px;color:var(--text3);">
      No data yet. <a href="/crm/Frontend/modules/import.html">Import from Excel →</a>
    </td></tr>`;
    return;
  }

  tbody.innerHTML = records.map(row =>
    "<tr>" +
    fields.map(f => `<td>${row[f.systemKey] ?? ""}</td>`).join("") +
    `<td>
      ${onView   ? `<button class="btn-sm" onclick='(${onView.toString()})(' + JSON.stringify(row) + ')'>View</button>` : ""}
      ${onDelete ? `<button class="btn-sm btn-danger" onclick='(${onDelete.toString()})("${row._id}")'>Delete</button>` : ""}
    </td>` +
    "</tr>"
  ).join("");
}