const attendanceTable = document.getElementById("attendanceTable");
const monthFilter = document.getElementById("monthFilter");
const loadAttendanceBtn = document.getElementById("loadAttendanceBtn");
const employeeMeta = document.getElementById("employeeMeta");

const params = new URLSearchParams(window.location.search);
const userId = params.get("userId");

function fmtDate(dateStr) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "2-digit",
    year: "numeric"
  });
}

function fmtTime(value) {
  if (!value) return "--";
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function calcHours(start, end) {
  if (!start || !end) return "--";
  const minutes = Math.max(0, Math.floor((new Date(end) - new Date(start)) / 60000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

function setMonthDefault() {
  monthFilter.value = new Date().toISOString().slice(0, 7);
}

async function loadAttendance() {
  if (!userId) {
    employeeMeta.textContent = "Employee ID is missing.";
    attendanceTable.innerHTML = '<tr><td colspan="4">Select employee from HR dashboard.</td></tr>';
    return;
  }

  const month = monthFilter.value;
  const res = await apiRequest(`/hr/employee/${userId}/attendance?month=${month}`);

  if (res.error) {
    employeeMeta.textContent = res.msg || "Unable to load attendance";
    attendanceTable.innerHTML = '<tr><td colspan="4">Unable to load data.</td></tr>';
    return;
  }

  employeeMeta.textContent = `${res.user.name} (${res.user.email}) - ${res.user.role}`;
  attendanceTable.innerHTML = "";

  if (!res.records.length) {
    attendanceTable.innerHTML = '<tr><td colspan="4">No records found for selected month.</td></tr>';
    return;
  }

  res.records.forEach((record) => {
    attendanceTable.innerHTML += `
      <tr>
        <td>${fmtDate(record.date)}</td>
        <td>${fmtTime(record.punchIn)}</td>
        <td>${fmtTime(record.punchOut)}</td>
        <td>${calcHours(record.punchIn, record.punchOut)}</td>
      </tr>
    `;
  });
}

loadAttendanceBtn.addEventListener("click", loadAttendance);

setMonthDefault();
loadAttendance();
