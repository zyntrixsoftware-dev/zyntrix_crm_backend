// ══════════════════════════════════════════════════════════════════
//  DEPLOYMENT CONFIG
//  After deploying the backend to Railway, paste your Railway URL below.
//  Example: "https://zyntrixbackend-production-abc123.up.railway.app"
//
//  ⚠️  Do NOT add a trailing slash.
// ══════════════════════════════════════════════════════════════════
const RAILWAY_BACKEND_URL = "https://zyntrixcrmbackend-production.up.railway.app";

// Auto-detect environment: localhost → local server, anything else → Railway
const API_BASE = (
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1"
)
  ? "http://localhost:5000/api"
  : RAILWAY_BACKEND_URL + "/api";

// ── API REQUEST ───────────────────────────────────────────────────────────────
async function apiRequest(url, method = "GET", body = null) {
  const token = localStorage.getItem("token");

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
      return { error: true, msg: "Invalid server response (not JSON)" };
    }

    // Auto-logout on 401 (expired / invalid token)
    if (res.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = _resolveRootPath() + "index.html";
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
      msg:   window.location.hostname === "localhost"
               ? "Backend not reachable. Is the server running on port 5000?"
               : "Cannot reach the server. Please try again."
    };
  }
}

// ── Root path resolver (accounts for nested page directories) ─────────────────
function _resolveRootPath() {
  const path = window.location.pathname;
  if (path.includes("/HRMS/")) {
    const deep = ["/talent_acquisition/", "/employee_lifecycle/"];
    return deep.some(s => path.includes(s)) ? "../../../../" : "../../../";
  }
  if (path.includes("/modules/") || path.includes("/pages/")) return "../";
  return "";
}
