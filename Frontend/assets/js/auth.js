// ── ROLE → MODULE PERMISSIONS ─────────────────────────────────────────────────
// Payroll is NOT a role-based module — it is restricted to two dedicated login
// accounts (see PAYROLL_EMAILS + requirePayrollAccess below).
const ROLE_MODULES = {
  super_admin: ["admin", "hr", "sales", "marketing", "lms", "attendance"],
  hr:          ["hr"],
  sales:       ["sales"],
  payroll:     ["payroll"],
  marketing:   ["marketing"],
  lms:         ["lms"],
  employee:    ["attendance"]
};

// ── PAYROLL SECTION ACCESS (account-based) ────────────────────────────────────
// Only these two accounts can see the Payroll section. Everyone else — including
// super_admin and all hr/sales users — is blocked.
const PAYROLL_EMAILS = [
  "salespay@zyntrixsoftware.com",
  "hrpay@zyntrixsoftware.com"
];
function isPayrollUser(user) {
  return !!user && PAYROLL_EMAILS.includes(String(user.email || "").trim().toLowerCase());
}

// ── SESSION HELPERS ───────────────────────────────────────────────────────────
function setSession(data) {
  localStorage.setItem("token", data.token);
  localStorage.setItem("user", JSON.stringify(data.user));
}

function getUser() {
  try {
    return JSON.parse(localStorage.getItem("user"));
  } catch {
    return null;
  }
}

// ── JWT EXPIRY CHECK ──────────────────────────────────────────────────────────
function isTokenExpired(token) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

// ── LOGOUT ────────────────────────────────────────────────────────────────────
window.logout = function () {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  window.location.href = window.location.origin + "/crm/index.html";
};

// ── ROLE REDIRECT AFTER LOGIN ─────────────────────────────────────────────────
function redirectByRole(role) {
  const base = window.location.origin;

  // Dedicated payroll logins go straight to the payroll section — it is their
  // only area. This takes priority over role-based routing.
  const u = getUser();
  if (isPayrollUser(u) || role === "payroll") {
    window.location.href = base + "/crm/modules/payroll_system/payroll.html";
    return;
  }

  switch (role) {
    case "super_admin":
      window.location.href = base + "/crm/modules/admin.html";
      break;
    case "hr":
      window.location.href = base + "/crm/modules/HRMS/dashboard/hr.html";
      break;
    case "sales":
      window.location.href = base + "/crm/modules/sales_system/leads.html";
      break;
    case "marketing":
      window.location.href = base + "/crm/modules/marketing.html";
      break;
    case "lms":
      window.location.href = base + "/crm/modules/lms.html";
      break;
    case "employee":
    default:
      window.location.href = base + "/crm/modules/attendance.html";
      break;
  }
}

// ── LOGIN FORM ────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", function () {
  const form = document.getElementById("loginForm");
  if (!form) return;

  form.addEventListener("submit", async function (e) {
    e.preventDefault();

    const email    = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    if (!email || !password) {
      alert("Please enter your email and password.");
      return;
    }

    const data = await apiRequest("/auth/login", "POST", { email, password });

    if (!data.error && data.token) {
      setSession(data);
      redirectByRole(data.user.role);
    } else {
      alert(data.msg || "Login failed");
    }
  });
});

// ── AUTH GUARD ────────────────────────────────────────────────────────────────
function requireAuth() {
  const token = localStorage.getItem("token");

  if (!token || isTokenExpired(token)) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = window.location.origin + "/crm/index.html";
  }
}

// ── MODULE ACCESS GUARD ───────────────────────────────────────────────────────
function requireModuleAccess(module) {
  const user = getUser();
  if (!user) return;

  const allowed = ROLE_MODULES[user.role] || [];
  if (!allowed.includes(module)) {
    alert("Access denied");
    redirectByRole(user.role);
  }
}

// ── PAYROLL SECTION GUARD (account-based) ─────────────────────────────────────
// Gate the payroll section by email — only the two authorized payroll accounts
// may view it. Used in place of requireModuleAccess on the payroll page.
function requirePayrollAccess() {
  const user = getUser();
  if (!user) return;
  if (!isPayrollUser(user)) {
    alert("Access denied — the payroll section is restricted to authorized payroll accounts.");
    redirectByRole(user.role);
  }
}

// ── UI HELPERS ────────────────────────────────────────────────────────────────
function togglePassword() {
  const pass = document.getElementById("password");
  pass.type = pass.type === "password" ? "text" : "password";
}

function forgotPassword() {
  window.location.href = window.location.origin + "/crm/pages/forgot-password.html";
}
// ─────────────────────────────────────────────────────────────────────────────
// AVATAR SYNC ACROSS PAGES
//
// Every page in the app embeds a topbar/sidebar with the current employee's
// avatar. Without this helper each page would show whatever stock placeholder
// was hardcoded in its HTML — so when an employee uploads a new photo on the
// Profile page, no other page picks it up until the next login.
//
// This block:
//   1. On every page load, paints the user's photo from localStorage (instant).
//   2. Then asks /api/employee/profile for the latest photo URL and repaints,
//      so the topbar is always in sync with what's actually in MongoDB.
// ─────────────────────────────────────────────────────────────────────────────

// IDs of <img> tags used as avatars across the various pages. Adding a new one
// here will make every future page-load update it automatically.
const AVATAR_ELEMENT_IDS = [
  "topAvatar",     // top-right of every module page
  "sideAvatar",    // sidebar avatars where present
  "profileAvatar"  // the big avatar card on profile.html
];

// Text-based avatar containers (initials shown when there's no photo yet).
const AVATAR_TEXT_IDS = ["sb-avatar", "panel-avatar"];

function _initialsFrom(name) {
  return (name || "?")
    .split(" ")
    .map(w => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// CSS selectors for avatar <img> tags that don't have an explicit id. The
// app's various page templates wrap the topbar avatar in <div class="top-profile">
// and the sidebar avatar in <div class="user-pill"> / <div class="brand">, so
// we walk those containers and pick the first <img> inside.
const AVATAR_SELECTOR_PATHS = [
  ".top-profile img",
  ".user-pill img.avatar, .user-pill .avatar img",
  ".sidebar .avatar img"
];

function _collectAvatarImgs() {
  const set = new Set();
  AVATAR_ELEMENT_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el && el.tagName === "IMG") set.add(el);
  });
  AVATAR_SELECTOR_PATHS.forEach(sel => {
    document.querySelectorAll(sel).forEach(img => {
      if (img && img.tagName === "IMG") set.add(img);
    });
  });
  return Array.from(set);
}

// Paint the topbar/sidebar avatars from whatever we already know locally.
function renderUserAvatar() {
  const u = getUser();
  if (!u) return;

  if (u.photo) {
    _collectAvatarImgs().forEach(img => { img.src = u.photo; });
    // For text-avatar containers (initials), swap in an <img> if there's a photo.
    AVATAR_TEXT_IDS.forEach(id => {
      const el = document.getElementById(id);
      if (el && !el.querySelector("img")) {
        el.innerHTML = `<img src="${u.photo}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit">`;
      }
    });
  } else {
    // No photo on record — fall back to initials in the text-avatar slots.
    const initials = _initialsFrom(u.name);
    AVATAR_TEXT_IDS.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = initials;
    });
  }
}

// Pull the freshest profile from the API so a photo uploaded on another tab /
// device shows up here too. Updates localStorage AND repaints.
async function refreshUserAvatar() {
  try {
    if (typeof apiRequest !== "function") return;          // api.js not loaded
    if (!localStorage.getItem("token"))    return;          // not logged in
    const res = await apiRequest("/employee/profile");
    if (!res || res.error) return;
    const p = res.profile || res;
    if (!p) return;

    const u = getUser() || {};
    // Bust the browser cache so the freshly uploaded photo replaces the old one.
    const photoUrl = p.photo
      ? p.photo + (p.photo.includes("?") ? "&" : "?") + "t=" + Date.now()
      : "";
    u.photo = photoUrl;
    if (p.name) u.name = p.name;
    localStorage.setItem("user", JSON.stringify(u));
    renderUserAvatar();
  } catch (_) { /* silent — avatar sync should never break a page */ }
}

// Run automatically on every page that loads auth.js.
document.addEventListener("DOMContentLoaded", () => {
  renderUserAvatar();    // instant from localStorage
  refreshUserAvatar();   // then sync with the server
});
