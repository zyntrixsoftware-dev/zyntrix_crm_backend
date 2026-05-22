// ================= ELEMENTS =================
const tableBody = document.getElementById("timecardBody");

const dateFilter = document.querySelector("input[type='date']");
const statusFilter = document.querySelector("select");

// summary cards (Overtime card was removed from the template — index shifted)
const totalHoursEl = document.querySelectorAll(".summary-box h2")[0];
const overtimeEl   = null;   // overtime is no longer tracked / displayed
const daysWorkedEl = document.querySelectorAll(".summary-box h2")[1];

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
        <td colspan="5" style="text-align:center;">No records found</td>
      </tr>
    `;
    return;
  }

  data.forEach(rec => {

    const tr = document.createElement("tr");

    const date = formatDate(rec.date);

    const inTime = rec.punchIn
      ? formatTime(rec.punchIn)
      : "-";

    const outTime = rec.punchOut
      ? formatTime(rec.punchOut)
      : "-";

    const hours = (rec.punchIn && rec.punchOut)
      ? calculateHours(rec.punchIn, rec.punchOut)
      : "-";

    const status = getStatus(rec);

    tr.innerHTML = `
      <td>${date}</td>
      <td>${inTime}</td>
      <td>${outTime}</td>
      <td class="hours">${hours}</td>
      <td>${getBadge(status)}</td>
    `;

    tableBody.appendChild(tr);
  });
}

// ================= SUMMARY =================
function updateSummary(data) {

  let totalMinutes = 0;
  let workedDays = 0;

  data.forEach(rec => {
    if (rec.punchIn && rec.punchOut) {
      // Cap each day at 8 hours — no overtime is counted toward total either.
      const minutes = Math.min(getMinutes(rec.punchIn, rec.punchOut), 480);
      totalMinutes += minutes;
      workedDays++;
    }
  });

  if (totalHoursEl) totalHoursEl.textContent = formatHours(totalMinutes);
  if (daysWorkedEl) daysWorkedEl.textContent = workedDays;
  // overtimeEl removed — overtime is no longer tracked.
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