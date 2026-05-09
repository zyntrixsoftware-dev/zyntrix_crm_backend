const ShiftRequest = require("../models/ShiftRequest");

// ── FIX: block Sunday (0) AND Saturday (6) as non-working days ──────────────
function isNonWorkingDay(dateStr) {
  const date = new Date(`${dateStr}T00:00:00`);
  const day  = date.getDay();
  return day === 0 || day === 6; // Sunday or Saturday
}

// ── VALIDATE HH:MM time string ───────────────────────────────────────────────
function isValidTime(t) {
  return /^\d{2}:\d{2}$/.test(t);
}

// ── REQUEST SHIFT ─────────────────────────────────────────────────────────────
exports.requestShift = async (req, res) => {
  try {
    const { date, slotStart, slotEnd, note = "" } = req.body;

    if (!date || !slotStart || !slotEnd) {
      return res.status(400).json({ msg: "date, slotStart, and slotEnd are required" });
    }

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ msg: "date must be in YYYY-MM-DD format" });
    }

    // Validate time formats
    if (!isValidTime(slotStart) || !isValidTime(slotEnd)) {
      return res.status(400).json({ msg: "slotStart and slotEnd must be in HH:MM format" });
    }

    // End must be after start
    if (slotEnd <= slotStart) {
      return res.status(400).json({ msg: "slotEnd must be after slotStart" });
    }

    if (!isNonWorkingDay(date)) {
      return res.status(400).json({ msg: "Shift booking is only allowed on weekends (Saturday or Sunday)." });
    }

    const request = await ShiftRequest.create({
      userId:    req.user.id,
      date,
      slotStart,
      slotEnd,
      note:      note.trim().slice(0, 500),
      status:    "pending"
    });

    return res.status(201).json(request);

  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ msg: "You already have a request for this slot." });
    }
    console.error("SHIFT REQUEST ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// ── GET MY REQUESTS ───────────────────────────────────────────────────────────
exports.getMyRequests = async (req, res) => {
  try {
    const requests = await ShiftRequest.find({ userId: req.user.id })
      .sort({ date: -1, createdAt: -1 });
    return res.json(requests);
  } catch (err) {
    console.error("GET MY SHIFT REQUESTS ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};
