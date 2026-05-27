// modules list
const MODULES = {
  admin:      { name: "Admin",      file: "modules/admin.html" },
  hr:         { name: "HR",         file: "modules/HRMS/dashboard/hr.html" },
  sales:      { name: "Sales",      file: "modules/sales_system/leads.html" },
  marketing:  { name: "Marketing",  file: "modules/marketing.html" },
  lms:        { name: "LMS",        file: "modules/lms.html" },
  attendance: { name: "Attendance", file: "modules/attendance.html" },
  payroll:    { name: "Payroll",    file: "modules/payroll_system/payroll.html" }
};

// FIX: was calling getSession() which doesn't exist — now uses getUser() from auth.js
function loadModules() {
  const session = getUser();
  if (!session) return;

  const welcomeEl = document.getElementById("welcome");
  if (welcomeEl) welcomeEl.innerText = "Welcome " + session.name;

  const container = document.getElementById("modules");
  if (!container) return;

  container.innerHTML = "";

  const allowed = ROLE_MODULES[session.role] || [];

  allowed.forEach(key => {
    const mod = MODULES[key];
    if (!mod) return;

    container.innerHTML += `
      <div class="card" onclick="openModule('${mod.file}')">
        ${mod.name}
      </div>
    `;
  });
}

function openModule(file) {
  window.location.href = file;
}
