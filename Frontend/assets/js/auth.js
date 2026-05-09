// ── ROLE → MODULE PERMISSIONS ─────────────────────────────────────────────────
const ROLE_MODULES = {
  super_admin: ["admin", "hr", "sales", "marketing", "lms", "attendance"],
  hr:          ["hr"],
  sales:       ["sales"],
  marketing:   ["marketing"],
  lms:         ["lms"],
  employee:    ["attendance"]
};

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
// FIX: use window.location.origin so the redirect always goes to the site root
// regardless of how deeply nested the current page is.
// e.g. /modules/HRMS/dashboard/hr.html → https://zyntrixsoftware.com/index.html ✓
// e.g. /modules/attendance.html        → https://zyntrixsoftware.com/index.html ✓
// e.g. localhost:5500/modules/...      → http://localhost:5500/index.html       ✓
window.logout = function () {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  window.location.href = window.location.origin + "/Frontend/index.html";
};

// ── ROLE REDIRECT AFTER LOGIN ─────────────────────────────────────────────────
// FIX: use absolute paths (origin + path) so this works from any page depth
function redirectByRole(role) {
  const base = window.location.origin;
  switch (role) {
    case "super_admin":
      window.location.href = base + "/modules/admin.html";
      break;
    case "hr":
      window.location.href = base + "/modules/HRMS/dashboard/hr.html";
      break;
    case "sales":
      window.location.href = base + "/modules/sales_system/dashboard.html";
      break;
    case "marketing":
      window.location.href = base + "/modules/marketing.html";
      break;
    case "lms":
      window.location.href = base + "/modules/lms.html";
      break;
    case "employee":
    default:
      window.location.href = base + "Frontend/modules/attendance.html";
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
    const password = document.getElementById("password").value; // no trim on password

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
// FIX: redirect always uses origin — works at any directory depth
function requireAuth() {
  const token = localStorage.getItem("token");

  if (!token || isTokenExpired(token)) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = window.location.origin + "/Frontend/index.html";
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

// ── UI HELPERS ────────────────────────────────────────────────────────────────
function togglePassword() {
  const pass = document.getElementById("password");
  pass.type = pass.type === "password" ? "text" : "password";
}

function forgotPassword() {
  window.location.href = window.location.origin + "/pages/forgot-password.html";
}
