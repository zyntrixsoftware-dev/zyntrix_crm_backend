requireAuth();

const grid = document.getElementById("grid");
const monthYear = document.getElementById("monthYear");
const punchInfo = document.getElementById("punchInfo");
const punchCount = document.getElementById("punchCount");
const summary = document.getElementById("summary");
const todayHours = document.getElementById("todayHours");
const statusEl = document.getElementById("status");
const todayStatus = document.getElementById("todayStatus");
const punchBtn = document.getElementById("punchBtn");
const shiftDate = document.getElementById("shiftDate");
const todayDate = document.getElementById("todayDate");
const startTime = document.getElementById("startTime");
const endTime = document.getElementById("endTime");
const expectedTime = document.getElementById("expectedTime");
const searchInput = document.getElementById("searchInput");
const topClock = document.getElementById("topClock");
const notificationButton = document.getElementById("notificationButton");
const notificationCount = document.getElementById("notificationCount");
const notificationBadge = document.getElementById("notificationBadge");
const notificationsList = document.getElementById("notificationsList");
const viewAllNotifications = document.getElementById("viewAllNotifications");
const missedPunchLink = document.getElementById("missedPunchLink");
const requestLeaveBtn = document.getElementById("requestLeaveBtn");
const swapShiftBtn = document.getElementById("swapShiftBtn");

const SHIFT_START = { hour: 9, minute: 0 };
const SHIFT_END = { hour: 18, minute: 0 };
const BREAK_MINUTES = 60;

let attendance = [];
let currentDate = startOfMonth(new Date());
let selectedDate = stripTime(new Date());
let showAllNotifications = false;

function stripTime(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

// FIX: use UTC date to match backend — prevents date mismatch in IST and other timezones
function getLocalDate() {
  return new Date().toISOString().slice(0, 10);
}

function key(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getDateFromKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function isSameDay(a, b) {
  return key(a) === key(b);
}

function isPastDay(date) {
  return stripTime(date) < stripTime(new Date());
}

function isFutureDay(date) {
  return stripTime(date) > stripTime(new Date());
}

function displayDate(date) {
  return new Date(date).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "2-digit",
    year: "numeric"
  });
}

function shortDate(date) {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function formatTime(time) {
  return new Date(time).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function getShift(date) {
  const workingDay = date.getDay() !== 0;

  return {
    workingDay,
    startLabel: "09:00 AM",
    endLabel: "06:00 PM",
    totalLabel: workingDay ? "8 hours" : "Off day",
    breakLabel: workingDay ? "1 hour" : "-"
  };
}

function getShiftDateTime(date, shiftTime) {
  const d = stripTime(date);
  d.setHours(shiftTime.hour, shiftTime.minute, 0, 0);
  return d;
}

function getMinutes(start, end) {
  return Math.max(0, Math.floor((new Date(end) - new Date(start)) / 60000));
}

function formatDuration(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function calc(start, end) {
  return formatDuration(getMinutes(start, end));
}

function getRecord(dateKey) {
  return attendance.find((record) => record.date === dateKey);
}

function getStatusForDate(date, record) {
  const shift = getShift(date);
  const now = new Date();
  const shiftEnd = getShiftDateTime(date, SHIFT_END);

  if (!shift.workingDay) return "Off";
  if (record?.punchIn && record?.punchOut) return "Completed";
  if (record?.punchIn) return "Working";
  if (isPastDay(date) || (isSameDay(date, now) && now > shiftEnd)) return "Absent";
  return "Scheduled";
}

function isPayday(date) {
  const day = date.getDate();
  const nextDay = new Date(date);
  nextDay.setDate(day + 1);

  return day === 15 || nextDay.getMonth() !== date.getMonth();
}

async function loadAttendance() {
  const res = await apiRequest("/attendance/my");
  attendance = Array.isArray(res) ? res : [];
}

function render(date) {
  grid.innerHTML = "";

  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1);
  const start = new Date(firstDay);
  const query = searchInput.value.trim().toLowerCase();

  start.setDate(firstDay.getDate() - firstDay.getDay());

  monthYear.textContent = date.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric"
  });

  for (let i = 0; i < 42; i++) {
    const dayDate = new Date(start);
    dayDate.setDate(start.getDate() + i);

    const dayKey = key(dayDate);
    const rec = getRecord(dayKey);
    const status = getStatusForDate(dayDate, rec);
    const shift = getShift(dayDate);
    const div = document.createElement("button");
    const searchable = `${dayKey} ${displayDate(dayDate)} ${status}`.toLowerCase();

    div.type = "button";
    div.className = "day";
    div.textContent = dayDate.getDate();
    div.title = `${displayDate(dayDate)} - ${status}`;

    if (dayDate.getMonth() !== month) div.classList.add("outside");
    if (!shift.workingDay) div.classList.add("non-working");
    if (shift.workingDay && !rec?.punchIn) div.classList.add("scheduled");
    if (rec?.punchIn) div.classList.add("punched");
    if (status === "Absent") div.classList.add("attention");
    if (isSameDay(dayDate, new Date())) div.classList.add("today");
    if (isPayday(dayDate)) div.classList.add("payday");
    if (isSameDay(selectedDate, dayDate)) div.classList.add("selected");
    if (query && !searchable.includes(query)) div.classList.add("is-hidden");

    div.onclick = () => {
      selectedDate = stripTime(dayDate);
      render(currentDate);
      updateUI();
    };

    grid.appendChild(div);
  }
}

function updateSelectedShift() {
  const dateKey = key(selectedDate);
  const rec = getRecord(dateKey);
  const shift = getShift(selectedDate);
  const status = getStatusForDate(selectedDate, rec);
  const isTodaySelected = isSameDay(selectedDate, new Date());

  shiftDate.textContent = displayDate(selectedDate);
  startTime.textContent = shift.startLabel;
  endTime.textContent = shift.endLabel;
  statusEl.textContent = status;

  if (!shift.workingDay) {
    punchCount.textContent = "0";
    punchInfo.textContent = "No shift scheduled for this day.";
    summary.textContent = shift.totalLabel;
    punchBtn.innerText = "Off Day";
    punchBtn.disabled = true;
    return;
  }

  punchBtn.disabled = false;

  if (!rec) {
    punchCount.textContent = "0";
    punchInfo.textContent = "No punch recorded for this day.";
    summary.textContent = shift.totalLabel;
    punchBtn.innerText = isTodaySelected ? "+ Add Punch" : "Go To Today";
    return;
  }

  punchCount.textContent = rec.punchOut ? "2" : "1";
  punchInfo.innerHTML = `
    Punch In: ${formatTime(rec.punchIn)}${rec.punchOut ? `<br>Punch Out: ${formatTime(rec.punchOut)}` : ""}
  `;

  if (rec.punchIn && rec.punchOut) {
    summary.textContent = calc(rec.punchIn, rec.punchOut);
    punchBtn.innerText = isTodaySelected ? "Completed" : "View Today";
  } else {
    summary.textContent = calc(rec.punchIn, new Date());
    punchBtn.innerText = isTodaySelected ? "Punch Out" : "View Today";
  }
}

function updateTodaySummary() {
  const today = new Date();
  const todayKey = getLocalDate();
  const rec = getRecord(todayKey);
  const status = getStatusForDate(today, rec);

  todayDate.textContent = shortDate(today);
  todayStatus.textContent = status;
  expectedTime.textContent = "Expected in 09:00 AM";

  if (rec?.punchIn && rec?.punchOut) {
    todayHours.textContent = calc(rec.punchIn, rec.punchOut);
  } else if (rec?.punchIn) {
    todayHours.textContent = calc(rec.punchIn, new Date());
  } else {
    todayHours.textContent = "00:00";
  }
}

function updateUI() {
  updateSelectedShift();
  updateTodaySummary();
  renderNotifications();
}

function getNotifications() {
  const now = new Date();
  const today = stripTime(now);
  const todayRecord = getRecord(getLocalDate());
  const todayShift = getShift(today);
  const yesterday = new Date(today);
  const notices = [];

  yesterday.setDate(today.getDate() - 1);

  if (todayShift.workingDay && !todayRecord?.punchIn && now < getShiftDateTime(today, SHIFT_START)) {
    notices.push({
      type: "info",
      title: "Shift reminder",
      text: "Your shift starts at 09:00 AM today",
      time: formatTime(now)
    });
  }

  if (todayShift.workingDay && !todayRecord?.punchIn && now >= getShiftDateTime(today, SHIFT_START)) {
    notices.push({
      type: "red",
      title: "Punch pending",
      text: "You have not punched in for today's shift yet",
      time: formatTime(now)
    });
  }

  if (todayRecord?.punchIn && !todayRecord?.punchOut) {
    notices.push({
      type: "info",
      title: "Punch out reminder",
      text: "Remember to punch out when your shift ends",
      time: formatTime(now)
    });
  }

  if (getShift(yesterday).workingDay && !getRecord(key(yesterday))?.punchOut) {
    notices.push({
      type: "red",
      title: "Missed punch",
      text: `Check your punch record for ${shortDate(yesterday)}`,
      time: formatTime(now)
    });
  }

  if (!notices.length) {
    notices.push({
      type: "info",
      title: "All caught up",
      text: "No attendance action is pending right now",
      time: formatTime(now)
    });
  }

  return notices;
}

function renderNotifications() {
  const notices = getNotifications();
  const visible = showAllNotifications ? notices : notices.slice(0, 2);

  notificationCount.textContent = notices.length;
  notificationBadge.textContent = notices.length;
  notificationsList.innerHTML = "";
  viewAllNotifications.textContent = showAllNotifications ? "Show less" : "View all";

  visible.forEach((notice) => {
    const item = document.createElement("div");
    item.className = "notification-item";
    item.innerHTML = `
      <div class="notification-icon ${notice.type === "red" ? "red" : "blue"}">${notice.type === "red" ? "△" : "i"}</div>
      <div>
        <strong>${notice.title}</strong>
        <p>${notice.text}</p>
      </div>
      <time>${notice.time}</time>
    `;
    notificationsList.appendChild(item);
  });
}

function updateClock() {
  const now = new Date();
  topClock.textContent = now.toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });

  if (isSameDay(selectedDate, now)) updateUI();
}

async function punchIn() {
  const res = await apiRequest("/attendance/punch-in", "POST");

  if (res.msg) {
    alert(res.msg);
    return;
  }

  await refreshToday();
}

async function punchOut() {
  const res = await apiRequest("/attendance/punch-out", "POST");

  if (res.msg) {
    alert(res.msg);
    return;
  }

  await refreshToday();
}

async function refreshToday() {
  await loadAttendance();
  goToday();
}

// ── Punch windows (IST) ───────────────────────────────────────────
// Mirrors the strict server-side check in Backend/controllers/attendanceController.js.
// We compute current time in IST (regardless of the user's actual browser
// timezone) so an employee on a laptop set to the wrong zone still sees the
// correct window. The server is the source of truth — this is for UX.
const PUNCH_IN_WINDOW  = { start:  9 * 60 + 50, end: 10 * 60 +  5, label: "9:50 AM – 10:05 AM" };
const PUNCH_OUT_WINDOW = { start: 17 * 60,      end: 17 * 60 + 10, label: "5:00 PM – 5:10 PM"  };

function _nowMinutesIST() {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.getUTCHours() * 60 + ist.getUTCMinutes();
}

function handlePunch() {
  if (!isSameDay(selectedDate, new Date())) {
    goToday();
    alert("Punch actions are available for today's shift.");
    return;
  }

  const todayRecord = getRecord(getLocalDate());

  if (!getShift(new Date()).workingDay) {
    alert("There is no scheduled shift today.");
    return;
  }

  const mins = _nowMinutesIST();

  if (!todayRecord || !todayRecord.punchIn) {
    if (mins < PUNCH_IN_WINDOW.start || mins > PUNCH_IN_WINDOW.end) {
      alert(`Punch-in is only allowed between ${PUNCH_IN_WINDOW.label} IST.`);
      return;
    }
    punchIn();
  } else if (!todayRecord.punchOut) {
    if (mins < PUNCH_OUT_WINDOW.start || mins > PUNCH_OUT_WINDOW.end) {
      alert(`Punch-out is only allowed between ${PUNCH_OUT_WINDOW.label} IST.`);
      return;
    }
    punchOut();
  } else {
    alert("Already completed for today");
  }
}

function goToday() {
  selectedDate = stripTime(new Date());
  currentDate = startOfMonth(new Date());
  render(currentDate);
  updateUI();
}

// ── REQUEST MODALS (Leave + Shift Swap) ───────────────────────────
function openReqModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.add("open");
}
function closeReqModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.remove("open");
}

function openLeaveModal() {
  const today = getLocalDate();
  document.getElementById("leaveFrom").value = today;
  document.getElementById("leaveTo").value   = today;
  document.getElementById("leaveHalfDate").value = today;
  document.getElementById("leaveHalfSlot").value = "10:00-13:00";
  document.getElementById("leaveDayType").value  = "full";
  document.getElementById("leaveReason").value = "";
  document.getElementById("leaveErr").textContent = "";
  onLeaveDayTypeChange();
  openReqModal("leaveModal");
}

// Toggle between full-day (date range) and half-day (single date + slot) fields.
function onLeaveDayTypeChange() {
  const isHalf = document.getElementById("leaveDayType").value === "half";
  document.getElementById("leaveFullDayFields").style.display = isHalf ? "none" : "";
  document.getElementById("leaveHalfDayFields").style.display = isHalf ? "" : "none";
}

function openSwapModal() {
  document.getElementById("swapDate").value = key(selectedDate) || getLocalDate();
  document.getElementById("swapReason").value = "";
  document.getElementById("swapErr").textContent = "";
  openReqModal("swapModal");
}

async function submitLeave() {
  const leaveType = document.getElementById("leaveType").value;
  const dayType   = document.getElementById("leaveDayType").value;
  const reason    = document.getElementById("leaveReason").value.trim();
  const err       = document.getElementById("leaveErr");
  const btn       = document.getElementById("leaveSubmitBtn");

  err.textContent = "";

  let payload;
  if (dayType === "half") {
    const halfDate = document.getElementById("leaveHalfDate").value;
    const slot     = document.getElementById("leaveHalfSlot").value;
    if (!halfDate) { err.textContent = "Please choose a date for your half-day leave."; return; }
    if (!["10:00-13:00", "14:00-17:00"].includes(slot)) {
      err.textContent = "Please choose a half-day slot.";
      return;
    }
    payload = {
      type: "leave", leaveType, dayType: "half",
      fromDate: halfDate, toDate: halfDate, halfDaySlot: slot, reason
    };
  } else {
    const fromDate = document.getElementById("leaveFrom").value;
    const toDate   = document.getElementById("leaveTo").value;
    if (!fromDate || !toDate) { err.textContent = "Please choose both dates."; return; }
    if (toDate < fromDate)    { err.textContent = "End date can't be before the start date."; return; }
    payload = { type: "leave", leaveType, dayType: "full", fromDate, toDate, reason };
  }

  btn.disabled = true; btn.textContent = "Submitting…";
  const res = await apiRequest("/requests", "POST", payload);
  btn.disabled = false; btn.textContent = "Submit for Approval";

  if (res.error) { err.textContent = res.msg || "Could not submit request."; return; }

  closeReqModal("leaveModal");
  alert("Leave request submitted — pending HR approval.");
  await loadMyRequests();
}

async function submitSwap() {
  const date     = document.getElementById("swapDate").value;
  const fromSlot = document.getElementById("swapFrom").value;
  const toSlot   = document.getElementById("swapTo").value;
  const reason   = document.getElementById("swapReason").value.trim();
  const err      = document.getElementById("swapErr");
  const btn      = document.getElementById("swapSubmitBtn");

  err.textContent = "";
  if (!date)               { err.textContent = "Please choose the shift date."; return; }
  if (!toSlot)             { err.textContent = "Please choose the requested shift."; return; }
  if (fromSlot && fromSlot === toSlot) { err.textContent = "Requested shift is the same as the current one."; return; }

  btn.disabled = true; btn.textContent = "Submitting…";
  const res = await apiRequest("/requests", "POST", {
    type: "shift_swap", date, fromSlot, toSlot, reason
  });
  btn.disabled = false; btn.textContent = "Submit for Approval";

  if (res.error) { err.textContent = res.msg || "Could not submit request."; return; }

  closeReqModal("swapModal");
  alert("Shift change request submitted — pending HR approval.");
  await loadMyRequests();
}

// ── MY REQUESTS LIST ──────────────────────────────────────────────
async function loadMyRequests() {
  const list = document.getElementById("myRequestsList");
  if (!list) return;
  const res = await apiRequest("/requests/my");
  if (res.error || !Array.isArray(res)) {
    list.innerHTML = '<div class="req-empty">Could not load your requests.</div>';
    return;
  }
  renderMyRequests(res.slice(0, 6));
}

// Human-readable label for a half-day leave slot value.
function halfSlotLabel(slot) {
  if (slot === "10:00-13:00") return "10:00 AM – 1:00 PM";
  if (slot === "14:00-17:00") return "2:00 PM – 5:00 PM";
  return slot || "Half day";
}

function renderMyRequests(requests) {
  const list = document.getElementById("myRequestsList");
  if (!list) return;
  if (!requests.length) {
    list.innerHTML = '<div class="req-empty">No requests yet. Use Quick Actions above.</div>';
    return;
  }
  list.innerHTML = requests.map(r => {
    const isLeave = r.type === "leave";
    const icon    = isLeave ? "▣" : "↔";
    const iconBg  = isLeave ? "background:rgba(167,139,250,.18);color:#a78bfa"
                            : "background:rgba(234,116,12,.18);color:#ea740c";
    const isHalf  = isLeave && r.dayType === "half";
    const title   = isLeave
      ? `${r.leaveType || "Leave"}${isHalf ? " · Half day" : ""}`
      : "Shift change";
    let sub;
    if (isLeave) {
      if (isHalf) {
        sub = `${shortDate(r.fromDate + "T00:00:00")} · ${halfSlotLabel(r.halfDaySlot)}`;
      } else {
        sub = r.fromDate === r.toDate
          ? shortDate(r.fromDate + "T00:00:00")
          : `${shortDate(r.fromDate + "T00:00:00")} → ${shortDate(r.toDate + "T00:00:00")}`;
      }
    } else {
      sub = `${shortDate(r.date + "T00:00:00")} · ${r.toSlot || ""}`;
    }
    const badgeCls = r.status === "approved" ? "req-approved"
                   : r.status === "rejected" ? "req-rejected" : "req-pending";
    return `<div class="req-item">
      <div class="req-ico" style="${iconBg}">${icon}</div>
      <div class="req-main"><strong>${title}</strong><span>${sub}</span></div>
      <span class="req-badge ${badgeCls}">${r.status}</span>
    </div>`;
  }).join("");
}

document.getElementById("prev").onclick = () => {
  currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
  render(currentDate);
};

document.getElementById("next").onclick = () => {
  currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
  render(currentDate);
};

searchInput.addEventListener("input", () => render(currentDate));

document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    searchInput.focus();
  }
});

notificationButton.addEventListener("click", () => {
  document.querySelector(".notifications-panel").scrollIntoView({ behavior: "smooth", block: "center" });
});

viewAllNotifications.addEventListener("click", (event) => {
  event.preventDefault();
  showAllNotifications = !showAllNotifications;
  renderNotifications();
});

missedPunchLink.addEventListener("click", (event) => {
  event.preventDefault();
  alert("Missed punch requests are not connected to the backend yet. Please contact HR for correction.");
});

requestLeaveBtn.addEventListener("click", openLeaveModal);
swapShiftBtn.addEventListener("click", openSwapModal);

const refreshRequestsLink = document.getElementById("refreshRequests");
if (refreshRequestsLink) {
  refreshRequestsLink.addEventListener("click", (e) => { e.preventDefault(); loadMyRequests(); });
}

// Close request modals on overlay click or Escape
document.querySelectorAll(".zx-overlay").forEach(ov => {
  ov.addEventListener("click", (e) => { if (e.target === ov) ov.classList.remove("open"); });
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") document.querySelectorAll(".zx-overlay.open").forEach(ov => ov.classList.remove("open"));
});

document.querySelectorAll("[data-action]").forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    const action = link.dataset.action;

    if (action === "profile") {
      window.location.href = "profile.html";
    } else if (action === "settings") {
      window.location.href = "settings.html";
    } else {
      alert("This module is coming soon.");
    }
  });
});

async function init() {
  await loadAttendance();
  render(currentDate);
  updateUI();
  updateClock();
  loadMyRequests();
}

setInterval(updateClock, 1000);
init();
