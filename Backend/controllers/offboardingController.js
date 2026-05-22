const Offboarding = require("../models/Offboarding");
const User        = require("../models/user");
const mongoose    = require("mongoose");

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function checkHrAccess(req, res) {
  if (!["hr", "super_admin"].includes(req.user.role)) {
    res.status(403).json({ msg: "Access denied" });
    return false;
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// PER-TYPE TEMPLATES
// Each separation type seeds a different clearance checklist and sets sensible
// defaults for access cutoff, rehire eligibility, settlement stance and the
// resulting employee status when the case is completed.
// ─────────────────────────────────────────────────────────────────────────────
const BASE_CHECKLIST = [
  { key: "hr_exit_interview",   label: "Conduct exit interview",            dept: "HR" },
  { key: "hr_collect_id",       label: "Collect ID card & access card",     dept: "HR" },
  { key: "it_revoke_access",    label: "Revoke system & email access",      dept: "IT" },
  { key: "it_recover_devices",  label: "Recover laptop & devices",          dept: "IT" },
  { key: "mgr_handover",        label: "Knowledge transfer & handover",     dept: "Manager" },
  { key: "fin_clear_dues",      label: "Clear dues & recover advances",     dept: "Finance" },
  { key: "fin_fnf",             label: "Full & final settlement",           dept: "Finance" },
  { key: "admin_reclaim",       label: "Reclaim access card / keys / parking", dept: "Admin" }
];

const TEMPLATES = {
  resignation: {
    accessCutoff: "last_working_day",
    rehireEligible: true,
    visibility: "standard",
    settlementStatus: "pending",
    completedStatus: "Resigned",
    documents: { relievingLetter: false, experienceCertificate: false, noDuesCertificate: false },
    extra: [
      { key: "hr_accept_resignation", label: "Accept resignation & confirm last working day", dept: "HR" },
      { key: "doc_relieving",         label: "Generate relieving letter",                     dept: "HR" },
      { key: "doc_experience",        label: "Generate experience certificate",               dept: "HR" }
    ]
  },
  termination_cause: {
    accessCutoff: "immediate",
    rehireEligible: false,
    visibility: "restricted",
    settlementStatus: "processing",
    completedStatus: "Terminated",
    extra: [
      { key: "doc_misconduct", label: "Document misconduct & evidence", dept: "HR" },
      { key: "legal_signoff",  label: "Legal / HR sign-off",            dept: "Legal" }
    ]
  },
  layoff: {
    accessCutoff: "last_working_day",
    rehireEligible: true,
    visibility: "standard",
    settlementStatus: "processing",
    completedStatus: "Terminated",
    extra: [
      { key: "fin_severance",    label: "Process severance pay",        dept: "Finance" },
      { key: "hr_outplacement",  label: "Provide outplacement support", dept: "HR" },
      { key: "doc_relieving",    label: "Generate relieving letter",    dept: "HR" },
      { key: "doc_experience",   label: "Generate experience certificate", dept: "HR" }
    ]
  },
  contract_end: {
    accessCutoff: "last_working_day",
    rehireEligible: true,
    visibility: "standard",
    settlementStatus: "pending",
    completedStatus: "Resigned",
    extra: [
      { key: "hr_confirm_nonrenewal", label: "Confirm contract end / non-renewal", dept: "HR" },
      { key: "doc_experience",        label: "Generate experience certificate",    dept: "HR" }
    ]
  },
  retirement: {
    accessCutoff: "last_working_day",
    rehireEligible: false,
    visibility: "standard",
    settlementStatus: "processing",
    completedStatus: "Resigned",
    extra: [
      { key: "fin_gratuity",  label: "Process gratuity & retirement benefits", dept: "Finance" },
      { key: "doc_service",   label: "Issue service certificate",              dept: "HR" },
      { key: "hr_alumni",     label: "Add to alumni network",                  dept: "HR" }
    ]
  },
  absconding: {
    accessCutoff: "immediate",
    rehireEligible: false,
    visibility: "restricted",
    settlementStatus: "withheld",
    completedStatus: "Terminated",
    extra: [
      { key: "hr_abscond_notice", label: "Send formal absconding notice",          dept: "HR" },
      { key: "fin_withhold",      label: "Withhold settlement pending response",   dept: "Finance" }
    ]
  },
  compassionate: {
    accessCutoff: "immediate",
    rehireEligible: false,
    visibility: "restricted",
    settlementStatus: "processing",
    completedStatus: "Terminated",
    extra: [
      { key: "fin_nominee", label: "Coordinate settlement with nominee / family", dept: "Finance" }
    ]
  }
};

function templateFor(type) {
  return TEMPLATES[type] || TEMPLATES.resignation;
}

function buildChecklist(type) {
  const tpl = templateFor(type);
  const items = [...BASE_CHECKLIST, ...(tpl.extra || [])];
  return items.map(i => ({ ...i, done: false, doneAt: null, note: "" }));
}

// Recompute status from checklist progress (never auto-advances to completed —
// that is an explicit, access-cutting action).
function deriveStatus(doc) {
  if (["completed", "cancelled"].includes(doc.status)) return doc.status;
  const total = doc.checklist.length;
  const done  = doc.checklist.filter(c => c.done).length;
  if (total > 0 && done === total) return "cleared";
  if (done > 0)                    return "in_progress";
  return "initiated";
}

// ─────────────────────────────────────────────────────────────────────────────
// LIST  — GET /api/hr/offboardings?status=&type=&search=
// ─────────────────────────────────────────────────────────────────────────────
exports.listOffboardings = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;

    const { status, type, search } = req.query;
    const query = {};
    if (status) query.status         = status;
    if (type)   query.separationType = type;
    if (search) {
      query.$or = [
        { employeeName:  { $regex: search, $options: "i" } },
        { employeeEmail: { $regex: search, $options: "i" } },
        { department:    { $regex: search, $options: "i" } }
      ];
    }

    const offboardings = await Offboarding.find(query)
      .populate("userId", "name email department designation employeeStatus")
      .sort({ createdAt: -1 });

    // KPIs computed across the full collection (not just the filtered view)
    const all = await Offboarding.find({}, "status lastWorkingDay checklist");
    const now = new Date();
    const in14 = new Date(now.getTime() + 14 * 864e5);
    const kpis = {
      inProgress:       all.filter(o => ["initiated", "in_progress"].includes(o.status)).length,
      pendingClearance: all.filter(o => ["initiated", "in_progress", "cleared"].includes(o.status)).length,
      upcomingLwd:      all.filter(o => {
        if (!o.lastWorkingDay || ["completed", "cancelled"].includes(o.status)) return false;
        const d = new Date(o.lastWorkingDay + "T00:00:00");
        return d >= now && d <= in14;
      }).length,
      completed:        all.filter(o => o.status === "completed").length
    };

    return res.json({ offboardings, total: offboardings.length, kpis });
  } catch (err) {
    console.error("LIST OFFBOARDINGS ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// CREATE  — POST /api/hr/offboardings
// body: { userId, separationType, reason, noticeDate, lastWorkingDay }
// ─────────────────────────────────────────────────────────────────────────────
exports.createOffboarding = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;

    const { userId, separationType, reason = "", noticeDate = "", lastWorkingDay = "" } = req.body || {};

    if (!userId || !mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ msg: "A valid employee (userId) is required" });
    }
    if (!Offboarding.SEPARATION_TYPES.includes(separationType)) {
      return res.status(400).json({ msg: "Invalid separationType" });
    }
    if (noticeDate && !DATE_RE.test(noticeDate)) {
      return res.status(400).json({ msg: "noticeDate must be YYYY-MM-DD" });
    }
    if (lastWorkingDay && !DATE_RE.test(lastWorkingDay)) {
      return res.status(400).json({ msg: "lastWorkingDay must be YYYY-MM-DD" });
    }

    const emp = await User.findById(userId).select("name email department designation");
    if (!emp) return res.status(404).json({ msg: "Employee not found" });

    const existing = await Offboarding.findOne({
      userId,
      status: { $in: ["initiated", "in_progress", "cleared"] }
    });
    if (existing) {
      return res.status(409).json({ msg: "An active offboarding case already exists for this employee" });
    }

    const tpl = templateFor(separationType);

    const created = await Offboarding.create({
      userId,
      employeeName:  emp.name,
      employeeEmail: emp.email,
      department:    emp.department,
      designation:   emp.designation,
      separationType,
      reason:        String(reason).slice(0, 1000),
      noticeDate,
      lastWorkingDay,
      status:        "initiated",
      checklist:     buildChecklist(separationType),
      settlement:    { status: tpl.settlementStatus || "pending", leaveEncashment: false, note: "" },
      documents:     tpl.documents || {},
      accessCutoff:   tpl.accessCutoff,
      rehireEligible: tpl.rehireEligible,
      visibility:     tpl.visibility,
      createdBy:      req.user.id
    });

    return res.status(201).json({ msg: "Offboarding case created", offboarding: created });
  } catch (err) {
    console.error("CREATE OFFBOARDING ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET ONE  — GET /api/hr/offboardings/:id
// ─────────────────────────────────────────────────────────────────────────────
exports.getOffboarding = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;
    const doc = await Offboarding.findById(req.params.id)
      .populate("userId", "name email department designation employeeStatus active")
      .populate("createdBy", "name");
    if (!doc) return res.status(404).json({ msg: "Offboarding case not found" });
    return res.json({ offboarding: doc });
  } catch (err) {
    console.error("GET OFFBOARDING ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE FIELDS  — PATCH /api/hr/offboardings/:id
// Accepts a subset of editable fields.
// ─────────────────────────────────────────────────────────────────────────────
exports.updateOffboarding = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;
    const doc = await Offboarding.findById(req.params.id);
    if (!doc) return res.status(404).json({ msg: "Offboarding case not found" });

    const b = req.body || {};

    if (b.reason !== undefined)         doc.reason = String(b.reason).slice(0, 1000);
    if (b.noticeDate !== undefined) {
      if (b.noticeDate && !DATE_RE.test(b.noticeDate)) return res.status(400).json({ msg: "noticeDate must be YYYY-MM-DD" });
      doc.noticeDate = b.noticeDate;
    }
    if (b.lastWorkingDay !== undefined) {
      if (b.lastWorkingDay && !DATE_RE.test(b.lastWorkingDay)) return res.status(400).json({ msg: "lastWorkingDay must be YYYY-MM-DD" });
      doc.lastWorkingDay = b.lastWorkingDay;
    }
    if (b.accessCutoff && ["immediate", "last_working_day"].includes(b.accessCutoff)) doc.accessCutoff = b.accessCutoff;
    if (typeof b.rehireEligible === "boolean") doc.rehireEligible = b.rehireEligible;
    if (b.visibility && ["standard", "restricted"].includes(b.visibility)) doc.visibility = b.visibility;

    if (b.exitInterview && typeof b.exitInterview === "object") {
      const e = b.exitInterview;
      if (e.scheduledFor !== undefined)     doc.exitInterview.scheduledFor = e.scheduledFor;
      if (typeof e.completed === "boolean")  doc.exitInterview.completed = e.completed;
      if (e.reasonForLeaving !== undefined)  doc.exitInterview.reasonForLeaving = String(e.reasonForLeaving).slice(0, 1000);
      if (e.rating !== undefined)            doc.exitInterview.rating = e.rating === null ? null : Number(e.rating);
      if (e.feedback !== undefined)          doc.exitInterview.feedback = String(e.feedback).slice(0, 2000);
    }

    if (b.settlement && typeof b.settlement === "object") {
      const s = b.settlement;
      if (s.status && ["pending", "processing", "paid", "withheld"].includes(s.status)) doc.settlement.status = s.status;
      if (typeof s.leaveEncashment === "boolean") doc.settlement.leaveEncashment = s.leaveEncashment;
      if (s.note !== undefined) doc.settlement.note = String(s.note).slice(0, 1000);
    }

    if (b.documents && typeof b.documents === "object") {
      ["relievingLetter", "experienceCertificate", "noDuesCertificate"].forEach(k => {
        if (typeof b.documents[k] === "boolean") doc.documents[k] = b.documents[k];
      });
    }

    if (Array.isArray(b.assets)) {
      doc.assets = b.assets.slice(0, 100).map(a => ({
        name:       String(a.name || "").slice(0, 200),
        returned:   !!a.returned,
        returnedAt: a.returned ? (a.returnedAt ? new Date(a.returnedAt) : new Date()) : null,
        note:       String(a.note || "").slice(0, 500)
      }));
    }

    doc.status = deriveStatus(doc);
    await doc.save();
    return res.json({ msg: "Saved", offboarding: doc });
  } catch (err) {
    console.error("UPDATE OFFBOARDING ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// TOGGLE A CHECKLIST ITEM  — PATCH /api/hr/offboardings/:id/checklist/:itemId
// body: { done, note }
// ─────────────────────────────────────────────────────────────────────────────
exports.updateChecklistItem = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;
    const doc = await Offboarding.findById(req.params.id);
    if (!doc) return res.status(404).json({ msg: "Offboarding case not found" });

    const item = doc.checklist.id(req.params.itemId);
    if (!item) return res.status(404).json({ msg: "Checklist item not found" });

    const { done, note } = req.body || {};
    if (typeof done === "boolean") {
      item.done   = done;
      item.doneAt = done ? new Date() : null;
    }
    if (note !== undefined) item.note = String(note).slice(0, 500);

    doc.status = deriveStatus(doc);
    await doc.save();
    return res.json({ msg: "Updated", offboarding: doc });
  } catch (err) {
    console.error("UPDATE CHECKLIST ITEM ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// COMPLETE  — POST /api/hr/offboardings/:id/complete
// Marks the case completed and applies the access cutoff: deactivates the
// account and sets the resulting employeeStatus from the type template.
// ─────────────────────────────────────────────────────────────────────────────
exports.completeOffboarding = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;
    const doc = await Offboarding.findById(req.params.id);
    if (!doc) return res.status(404).json({ msg: "Offboarding case not found" });
    if (doc.status === "completed") return res.status(400).json({ msg: "Case is already completed" });
    if (doc.status === "cancelled") return res.status(400).json({ msg: "Cancelled case cannot be completed" });

    doc.status      = "completed";
    doc.completedAt = new Date();
    await doc.save();

    const tpl = templateFor(doc.separationType);
    const user = await User.findById(doc.userId);
    if (user) {
      user.active         = false;                         // login blocked
      user.employeeStatus = tpl.completedStatus || "Resigned";
      await user.save();
    }

    return res.json({
      msg: `Offboarding completed — ${doc.employeeName}'s access has been revoked.`,
      offboarding: doc
    });
  } catch (err) {
    console.error("COMPLETE OFFBOARDING ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// CANCEL  — POST /api/hr/offboardings/:id/cancel
// ─────────────────────────────────────────────────────────────────────────────
exports.cancelOffboarding = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;
    const doc = await Offboarding.findById(req.params.id);
    if (!doc) return res.status(404).json({ msg: "Offboarding case not found" });
    if (doc.status === "completed") return res.status(400).json({ msg: "Completed case cannot be cancelled" });

    doc.status      = "cancelled";
    doc.cancelledAt = new Date();
    await doc.save();
    return res.json({ msg: "Offboarding cancelled", offboarding: doc });
  } catch (err) {
    console.error("CANCEL OFFBOARDING ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE  — DELETE /api/hr/offboardings/:id  (super_admin only)
// ─────────────────────────────────────────────────────────────────────────────
exports.deleteOffboarding = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;
    if (req.user.role !== "super_admin") {
      return res.status(403).json({ msg: "Only super_admin can delete offboarding cases" });
    }
    const doc = await Offboarding.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ msg: "Offboarding case not found" });
    return res.json({ msg: "Offboarding case deleted" });
  } catch (err) {
    console.error("DELETE OFFBOARDING ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};
