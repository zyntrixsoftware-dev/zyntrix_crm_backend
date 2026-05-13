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
window.logout = function () {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  window.location.href = window.location.origin + "/crm/index.html";
};

// ── ROLE REDIRECT AFTER LOGIN ─────────────────────────────────────────────────
function redirectByRole(role) {
  const base = window.location.origin;
  switch (role) {
    case "super_admin":
      window.location.href = base + "/crm/modules/admin.html";
      break;
    case "hr":
      window.location.href = base + "/crm/modules/HRMS/dashboard/hr.html";
      break;
    case "sales":
      window.location.href = base + "/crm/modules/sales_system/dashboard.html";
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

// ── UI HELPERS ────────────────────────────────────────────────────────────────
function togglePassword() {
  const pass = document.getElementById("password");
  pass.type = pass.type === "password" ? "text" : "password";
}

function forgotPassword() {
  window.location.href = window.location.origin + "/crm/pages/forgot-password.html";
}