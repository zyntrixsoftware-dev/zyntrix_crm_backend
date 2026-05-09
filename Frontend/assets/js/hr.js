const totalEmp = document.getElementById("totalEmp");
const presentToday = document.getElementById("presentToday");
const absentToday = document.getElementById("absentToday");
const leaveToday = document.getElementById("leaveToday");
const employeeTable = document.getElementById("employeeTable");
const shiftRequestTable = document.getElementById("shiftRequestTable");

function fmtDate(date) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "2-digit",
    year: "numeric"
  });
}

async function loadDashboard() {
  const res = await apiRequest("/hr/dashboard");

  if (res.error) {
    alert(res.msg || "Unable to load HR dashboard");
    return;
  }

  const stats = res.stats || {};

  totalEmp.textContent = stats.totalEmployees || 0;
  presentToday.textContent = stats.presentToday || 0;
  absentToday.textContent = stats.absentToday || 0;
  leaveToday.textContent = stats.pendingShiftRequests || 0;

  employeeTable.innerHTML = "";

  (res.employees || []).forEach((emp) => {
    employeeTable.innerHTML += `
      <tr>
        <td>${emp.name}</td>
        <td>${emp.email}</td>
        <td>${emp.role}</td>
        <td>${emp.status}</td>
        <td>
          <button type="button" onclick="viewEmployee('${emp.id}')">View Attendance</button>
        </td>
      </tr>
    `;
  });
}

async function loadShiftRequests() {
  const res = await apiRequest("/hr/shift-requests");

  shiftRequestTable.innerHTML = "";

  if (res.error) {
    shiftRequestTable.innerHTML = `<tr><td colspan="6">${res.msg || "Unable to load requests"}</td></tr>`;
    return;
  }

  if (!res.length) {
    shiftRequestTable.innerHTML = '<tr><td colspan="6">No shift requests found.</td></tr>';
    return;
  }

  res.forEach((req) => {
    const actionCell = req.status === "pending"
      ? `
        <button type="button" onclick="updateShiftRequest('${req._id}', 'approved')">Approve</button>
        <button type="button" class="secondary" onclick="updateShiftRequest('${req._id}', 'rejected')">Reject</button>
      `
      : "Reviewed";

    shiftRequestTable.innerHTML += `
      <tr>
        <td>${req.userId?.name || "Unknown"}<br><small>${req.userId?.email || ""}</small></td>
        <td>${fmtDate(req.date)}</td>
        <td>${req.slotStart} - ${req.slotEnd}</td>
        <td>${req.note || "-"}</td>
        <td>${req.status}</td>
        <td>${actionCell}</td>
      </tr>
    `;
  });
}

async function updateShiftRequest(id, status) {
  const reviewRemarks = prompt(`Optional remarks for ${status}:`) || "";

  const res = await apiRequest(`/hr/shift-requests/${id}/status`, "PATCH", {
    status,
    reviewRemarks
  });

  if (res.error) {
    alert(res.msg || "Failed to update request");
    return;
  }

  await loadShiftRequests();
  await loadDashboard();
}

window.viewEmployee = function(userId) {
  window.location.href = `employee-attendance.html?userId=${userId}`;
};

window.updateShiftRequest = updateShiftRequest;

loadDashboard();
loadShiftRequests();
