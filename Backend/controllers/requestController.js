const EmployeeRequest = require("../models/EmployeeRequest");

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function checkHrAccess(req, res) {
  if (!["hr", "super_admin"].includes(req.user.role)) {
    res.status(403).json({ msg: "Access denied" });
    return false;
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// EMPLOYEE SIDE
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/requests   body: { type, ... }
exports.createRequest = async (req, res) => {
  try {
    const { type } = req.body || {};

    if (!["leave", "shift_swap"].includes(type)) {
      return res.status(400).json({ msg: "type must be 'leave' or 'shift_swap'" });
    }

    const doc = { userId: req.user.id, type, status: "pending" };

    if (type === "leave") {
      const { leaveType = "", fromDate, toDate, reason = "" } = req.body;
      if (!fromDate || !toDate) {
        return res.status(400).json({ msg: "fromDate and toDate are required" });
      }
      if (!DATE_RE.test(fromDate) || !DATE_RE.test(toDate)) {
        return res.status(400).json({ msg: "Dates must be in YYYY-MM-DD format" });
      }
      if (toDate < fromDate) {
        return res.status(400).json({ msg: "toDate cannot be before fromDate" });
      }
      doc.leaveType = String(leaveType).slice(0, 50);
      doc.fromDate  = fromDate;
      doc.toDate    = toDate;
      doc.reason    = String(reason).slice(0, 500);
    }

    if (type === "shift_swap") {
      const { date, fromSlot = "", toSlot = "", reason = "" } = req.body;
      if (!date) return res.status(400).json({ msg: "date is required" });
      if (!DATE_RE.test(date)) {
        return res.status(400).json({ msg: "date must be in YYYY-MM-DD format" });
      }
      if (!toSlot) return res.status(400).json({ msg: "Requested shift (toSlot) is required" });
      doc.date     = date;
      doc.fromSlot = String(fromSlot).slice(0, 50);
      doc.toSlot   = String(toSlot).slice(0, 50);
      doc.reason   = String(reason).slice(0, 500);
    }

    const created = await EmployeeRequest.create(doc);
    return res.status(201).json(created);
  } catch (err) {
    console.error("CREATE REQUEST ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// GET /api/requests/my
exports.getMyRequests = async (req, res) => {
  try {
    const filter = { userId: req.user.id };
    if (req.query.type) filter.type = req.query.type;

    const requests = await EmployeeRequest.find(filter)
      .populate("reviewedBy", "name")
      .sort({ createdAt: -1 });

    return res.json(requests);
  } catch (err) {
    console.error("GET MY REQUESTS ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// HR SIDE
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/hr/requests?status=&type=
exports.getAllRequests = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;

    const query = {};
    if (req.query.status) query.status = req.query.status;
    if (req.query.type)   query.type   = req.query.type;

    const requests = await EmployeeRequest.find(query)
      .populate("userId",     "name email department designation")
      .populate("reviewedBy", "name email")
      .sort({ createdAt: -1 });

    return res.json(requests);
  } catch (err) {
    console.error("HR GET REQUESTS ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// PATCH /api/hr/requests/:id/status   body: { status, reviewRemarks }
exports.reviewRequest = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;

    const { status, reviewRemarks = "" } = req.body || {};
    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({ msg: "status must be approved or rejected" });
    }

    const updated = await EmployeeRequest.findByIdAndUpdate(
      req.params.id,
      {
        status,
        reviewRemarks: String(reviewRemarks).slice(0, 500),
        reviewedBy:    req.user.id,
        reviewedAt:    new Date()
      },
      { new: true }
    ).populate("userId", "name email");

    if (!updated) return res.status(404).json({ msg: "Request not found" });
    return res.json(updated);
  } catch (err) {
    console.error("HR REVIEW REQUEST ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};
