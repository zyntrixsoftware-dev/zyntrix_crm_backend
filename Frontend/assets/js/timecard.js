// ================= ELEMENTS =================
const tableBody = document.getElementById("timecardBody");

const dateFilter = document.querySelector("input[type='date']");
const statusFilter = document.querySelector("select");

// summary cards: [0] = Punctuality, [1] = Days Worked (hours card removed by policy)
const punctualityEl = document.querySelectorAll(".summary-box h2")[0];
const daysWorkedEl  = document.querySelectorAll(".summary-box h2")[1];

// ================= STATE =================
let records = [];

// ================= LOAD DATA =================
async function loadTimecard() {
  try {
    const res = await apiRequest("/attendance/my");


    if (!Array.isArray(res)) {
      console.error("Invalid response:", res);
      return;
    }

    records = res;

    renderTable(records);
    updateSummary(records);

  } catch (err) {
    console.error("Timecard load error:", err);
  }
}

// ================= RENDER TABLE =================
function renderTable(data) {

  tableBody.innerHTML = "";

  if (!data.length) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="2" style="text-align:center;">No records found</td>
      </tr>
    `;
    return;
  }

  data.forEach(rec => {

    const tr = document.createElement("tr");

    const date   = formatDate(rec.date);
    const status = getStatus(rec);

    // Punch in/out times and worked-hours are intentionally not displayed
    // (company policy). Only the date and attendance status are shown.
    tr.innerHTML = `
      <td>${date}</td>
      <td>${getBadge(status)}</td>
    `;

    tableBody.appendChild(tr);
  });
}

// ================= SUMMARY =================
function updateSummary(data) {

  let present    = 0;   // days the employee punched in
  let onTime     = 0;   // of those, days with "present" (on-time) status
  let workedDays = 0;   // days with a full punch in + out

  data.forEach(rec => {
    if (rec.punchIn) {
      present++;
      if (getStatus(rec) === "present") onTime++;
    }
    if (rec.punchIn && rec.punchOut) workedDays++;
  });

  // Punctuality % — derived from status, not from any worked-hours value.
  const punctuality = present > 0 ? Math.round((onTime / present) * 100) + "%" : "—";

  if (punctualityEl) punctualityEl.textContent = punctuality;
  if (daysWorkedEl)  daysWorkedEl.textContent  = workedDays;
}

// ================= FILTER =================
function applyFilters() {

  let filtered = [...records];

  // DATE FILTER
  if (dateFilter.value) {
    filtered = filtered.filter(r =>
      r.date.startsWith(dateFilter.value)
    );
  }

  // STATUS FILTER
  if (statusFilter.value !== "All") {
    filtered = filtered.filter(r =>
      getStatus(r) === statusFilter.value.toLowerCase()
    );
  }

  renderTable(filtered);
  updateSummary(filtered);
}

// ================= HELPERS =================

// Format date nicely
function formatDate(date) {
  return new Date(date).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

// Format time
function formatTime(time) {
  return new Date(time).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

// Calculate minutes
function getMinutes(start, end) {
  return Math.floor((new Date(end) - new Date(start)) / 60000);
}

// Convert minutes to HH:MM
function formatHours(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Calculate hours between two times
function calculateHours(start, end) {
  return formatHours(getMinutes(start, end));
}

// ================= STATUS =================
function getStatus(rec) {

  if (!rec.punchIn) return "absent";

  if (rec.punchIn && !rec.punchOut) return "late";

  const hour = new Date(rec.punchIn).getHours();

  return hour > 9 ? "late" : "present";
}

// Badge UI
function getBadge(status) {
  return `
    <span class="badge ${status}">
      ${status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  `;
}

// ================= EVENTS =================
dateFilter.addEventListener("change", applyFilters);
statusFilter.addEventListener("change", applyFilters);

// ================= INIT =================
loadTimecard();