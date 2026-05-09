const bookingDate = document.getElementById("bookingDate");
const slotStart = document.getElementById("slotStart");
const slotEnd = document.getElementById("slotEnd");
const slotNote = document.getElementById("slotNote");
const bookShiftBtn = document.getElementById("bookShiftBtn");
const bookingMsg = document.getElementById("bookingMsg");
const myShiftRequests = document.getElementById("myShiftRequests");
const upcomingSundays = document.getElementById("upcomingSundays");

function formatDate(dateString) {
  return new Date(`${dateString}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "2-digit",
    year: "numeric"
  });
}

function statusBadge(status) {
  if (status === "approved") return "Approved";
  if (status === "rejected") return "Rejected";
  return "Pending";
}

// FIX: allow both Saturday (6) and Sunday (0) — backend now accepts both
function isWeekend(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  const day = date.getDay();
  return day === 0 || day === 6;
}

// FIX: show upcoming Saturdays AND Sundays (was: Sundays only)
function renderUpcomingWeekends() {
  const result = [];
  const cursor = new Date();

  while (result.length < 6) {
    cursor.setDate(cursor.getDate() + 1);
    const day = cursor.getDay();
    if (day === 0 || day === 6) {
      result.push(new Date(cursor));
    }
  }

  upcomingSundays.innerHTML = result
    .map((date) => date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "2-digit",
      year: "numeric"
    }))
    .join(" | ");
}

async function loadMyRequests() {
  const res = await apiRequest("/shifts/my");

  myShiftRequests.innerHTML = "";

  if (!Array.isArray(res) || !res.length) {
    myShiftRequests.innerHTML = '<tr><td colspan="5">No shift booking requests yet.</td></tr>';
    return;
  }

  res.forEach((req) => {
    myShiftRequests.innerHTML += `
      <tr>
        <td>${formatDate(req.date)}</td>
        <td>${req.slotStart} - ${req.slotEnd}</td>
        <td>${req.note || "-"}</td>
        <td>${statusBadge(req.status)}</td>
        <td>${req.reviewRemarks || "-"}</td>
      </tr>
    `;
  });
}

async function bookSlot() {
  const date = bookingDate.value;
  const start = slotStart.value;
  const end = slotEnd.value;
  const note = slotNote.value.trim();

  bookingMsg.textContent = "";

  if (!date || !start || !end) {
    bookingMsg.textContent = "Please fill date and time.";
    return;
  }

  // FIX: validate weekend (Saturday or Sunday) not just Sunday
  if (!isWeekend(date)) {
    bookingMsg.textContent = "Only weekend slot booking is allowed (Saturday or Sunday).";
    return;
  }

  if (end <= start) {
    bookingMsg.textContent = "End time must be greater than start time.";
    return;
  }

  const res = await apiRequest("/shifts/request", "POST", {
    date,
    slotStart: start,
    slotEnd: end,
    note
  });

  if (res.error) {
    bookingMsg.textContent = res.msg || "Unable to submit request";
    return;
  }

  bookingMsg.textContent = "Request submitted. Waiting for HR approval.";
  slotNote.value = "";
  await loadMyRequests();
}

bookShiftBtn.addEventListener("click", bookSlot);

renderUpcomingWeekends();
loadMyRequests();
