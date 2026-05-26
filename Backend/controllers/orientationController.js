const Orientation        = require("../models/Orientation");
const OrientationSession = require("../models/OrientationSession");
const Onboarding         = require("../models/Onboarding");
const User               = require("../models/user");
const { notifyOrientationInvite } = require("../utils/candidateEmails");

function checkHrAccess(req, res) {
  if (!["hr", "super_admin"].includes(req.user.role)) {
    res.status(403).json({ msg: "Access denied" });
    return false;
  }
  return true;
}

// ═══════════════════════════════════════════════════════════════════
//  ORIENTATION RECORDS (per candidate)
// ═══════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────
// LIST — GET /api/hr/orientation
//   ?status=pending|invited|in_progress|completed
//   ?search=<text>
// ─────────────────────────────────────────────────────────────────
exports.list = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;

    const { status, search } = req.query;
    const query = {};
    if (status) query.orientationStatus = status;
    if (search) {
      query.$or = [
        { candidateName:  { $regex: search, $options: "i" } },
        { candidateEmail: { $regex: search, $options: "i" } },
        { position:       { $regex: search, $options: "i" } }
      ];
    }

    let records = await Orientation.find(query)
      .populate("mentorId", "name email designation department")
      .populate("sessionIds", "title scheduledDate startTime endTime mode venue facilitator isMandatory status")
      .sort({ createdAt: -1 });

    // ── Auto-sync: create orientation records for any onboarded candidates
    //    that don't have one yet (covers candidates onboarded before this
    //    feature was introduced, or cases where autoCreate failed silently).
    try {
      const onboardedList = await Onboarding.find({ onboardingStatus: "onboarded" })
        .select("_id candidateEmail candidateName position department joiningDate");

      const existingEmails = new Set(records.map(r => r.candidateEmail.toLowerCase()));
      const missing = onboardedList.filter(ob =>
        ob.candidateEmail && !existingEmails.has(ob.candidateEmail.toLowerCase())
      );

      if (missing.length) {
        const mandatory = await OrientationSession.find({ isMandatory: true, status: "upcoming" }).select("_id");
        for (const ob of missing) {
          try {
            const newOr = await Orientation.create({
              onboardingId:   ob._id,
              candidateEmail: ob.candidateEmail.toLowerCase().trim(),
              candidateName:  ob.candidateName  || "",
              position:       ob.position       || "",
              department:     ob.department     || "",
              joiningDate:    ob.joiningDate    || "",
            });
            if (mandatory.length) {
              newOr.sessionIds = mandatory.map(s => s._id);
              await newOr.save();
            }
            console.log("[Orientation list] auto-synced:", ob.candidateEmail);
          } catch (e) {
            // Duplicate key or other — skip silently
          }
        }
        // Re-fetch so the new records appear in the response
        records = await Orientation.find(query)
          .populate("mentorId", "name email designation department")
          .populate("sessionIds", "title scheduledDate startTime endTime mode venue facilitator isMandatory status")
          .sort({ createdAt: -1 });
      }
    } catch (syncErr) {
      console.warn("[Orientation list] auto-sync failed:", syncErr.message);
    }

    // Compute stats
    const all = await Orientation.find({});
    const stats = {
      total:      all.length,
      pending:    all.filter(o => o.orientationStatus === "pending").length,
      invited:    all.filter(o => o.orientationStatus === "invited").length,
      in_progress:all.filter(o => o.orientationStatus === "in_progress").length,
      completed:  all.filter(o => o.orientationStatus === "completed").length,
    };

    return res.json({ orientations: records, total: records.length, stats });
  } catch (err) {
    console.error("ORIENTATION LIST ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// ─────────────────────────────────────────────────────────────────
// GET ONE — GET /api/hr/orientation/:id
// ─────────────────────────────────────────────────────────────────
exports.getOne = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;

    const ob = await Orientation.findById(req.params.id)
      .populate("mentorId", "name email designation department")
      .populate("sessionIds", "title description scheduledDate startTime endTime durationMin mode venue facilitator isMandatory sessionType status")
      .populate("onboardingId", "onboardingStatus joiningDate documents")
      .populate("createdBy", "name");

    if (!ob) return res.status(404).json({ msg: "Orientation record not found" });
    return res.json({ orientation: ob });
  } catch (err) {
    return res.status(500).json({ msg: "Server error" });
  }
};

// ─────────────────────────────────────────────────────────────────
// CREATE (internal — called by onboarding when status → onboarded)
// Can also be called by HR: POST /api/hr/orientation
// ─────────────────────────────────────────────────────────────────
exports.create = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;
    const { onboardingId, candidateEmail, candidateName, position, department, joiningDate } = req.body;
    if (!candidateEmail) return res.status(400).json({ msg: "candidateEmail is required" });

    // Idempotent
    const existing = await Orientation.findOne({
      $or: [
        { candidateEmail: candidateEmail.toLowerCase().trim() },
        ...(onboardingId ? [{ onboardingId }] : [])
      ]
    });
    if (existing) return res.json({ msg: "Orientation record already exists", orientation: existing });

    const or = await Orientation.create({
      onboardingId,
      candidateEmail: candidateEmail.toLowerCase().trim(),
      candidateName:  candidateName || "",
      position:       position      || "",
      department:     department    || "",
      joiningDate:    joiningDate   || "",
      createdBy:      req.user.id
    });

    // Auto-enrol in all mandatory sessions
    const mandatorySessions = await OrientationSession.find({ isMandatory: true, status: "upcoming" });
    if (mandatorySessions.length) {
      or.sessionIds = mandatorySessions.map(s => s._id);
      await or.save();
    }

    return res.status(201).json({ msg: "Orientation record created", orientation: or });
  } catch (err) {
    console.error("ORIENTATION CREATE ERROR:", err);
    return res.status(500).json({ msg: "Server error: " + err.message });
  }
};

// ─────────────────────────────────────────────────────────────────
// UPDATE — PATCH /api/hr/orientation/:id
// body: { mentorId?, mentorName?, mentorEmail?, notes?, joiningDate?,
//         orientationStatus?, sessionIds? }
// ─────────────────────────────────────────────────────────────────
exports.update = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;

    const or = await Orientation.findById(req.params.id);
    if (!or) return res.status(404).json({ msg: "Orientation record not found" });

    // Assign mentor by ID (lookup name/email from User)
    if (req.body.mentorId !== undefined) {
      if (req.body.mentorId) {
        const mentor = await User.findById(req.body.mentorId).select("name email");
        if (!mentor) return res.status(404).json({ msg: "Mentor not found" });
        or.mentorId    = mentor._id;
        or.mentorName  = mentor.name;
        or.mentorEmail = mentor.email;
      } else {
        // Clear mentor
        or.mentorId    = null;
        or.mentorName  = "";
        or.mentorEmail = "";
      }
    }

    // Allow direct mentor name / email update when no mentorId is provided
    // (HR types the name manually or picks from a non-User list)
    if (req.body.mentorId === undefined) {
      if (req.body.mentorName  !== undefined) or.mentorName  = req.body.mentorName;
      if (req.body.mentorEmail !== undefined) or.mentorEmail = req.body.mentorEmail;
    }

    const simple = ["notes", "joiningDate", "orientationStatus"];
    simple.forEach(f => { if (req.body[f] !== undefined) or[f] = req.body[f]; });

    // Update session enrolment if provided
    if (Array.isArray(req.body.sessionIds)) {
      or.sessionIds = req.body.sessionIds;
    }

    // Set completedAt if status flipped to completed
    if (req.body.orientationStatus === "completed" && !or.completedAt) {
      or.completedAt = new Date();
    }

    await or.save();
    const populated = await Orientation.findById(or._id)
      .populate("mentorId", "name email designation")
      .populate("sessionIds", "title scheduledDate startTime endTime mode venue facilitator isMandatory status");

    return res.json({ msg: "Updated", orientation: populated });
  } catch (err) {
    console.error("ORIENTATION UPDATE ERROR:", err);
    return res.status(500).json({ msg: "Server error: " + err.message });
  }
};

// ─────────────────────────────────────────────────────────────────
// SEND INVITE EMAIL — POST /api/hr/orientation/:id/send-invite
// Sends the orientation invite email to the candidate with the
// full session-by-session schedule via GAS/Gmail.
// ─────────────────────────────────────────────────────────────────
exports.sendInvite = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;

    const or = await Orientation.findById(req.params.id)
      .populate("sessionIds", "title description scheduledDate startTime endTime durationMin mode venue facilitator isMandatory sessionType");

    if (!or) return res.status(404).json({ msg: "Orientation record not found" });
    if (!or.candidateEmail) return res.status(400).json({ msg: "Candidate has no email" });

    // Build sessions array for the email
    const sessions = (or.sessionIds || [])
      .filter(s => s && s.status !== "cancelled")
      .sort((a, b) => {
        // Sort by scheduledDate then startTime
        const da = (a.scheduledDate || "") + (a.startTime || "");
        const db = (b.scheduledDate || "") + (b.startTime || "");
        return da.localeCompare(db);
      })
      .map(s => ({
        title       : s.title,
        description : s.description,
        date        : s.scheduledDate,
        startTime   : s.startTime,
        endTime     : s.endTime,
        durationMin : s.durationMin,
        mode        : s.mode,
        venue       : s.venue,
        facilitator : s.facilitator,
        isMandatory : s.isMandatory,
      }));

    const result = await notifyOrientationInvite(or, sessions);

    if (!result.sent) {
      return res.status(502).json({
        msg: "Orientation invite could not be sent — email delivery failed. Check SMTP credentials (EMAIL_USER / EMAIL_PASS) in server environment.",
        reason: result.reason
      });
    }

    or.inviteSentAt     = new Date();
    or.orientationStatus = or.orientationStatus === "pending" ? "invited" : or.orientationStatus;
    await or.save();

    return res.json({ msg: `Orientation invite sent to ${or.candidateEmail}`, orientation: or });
  } catch (err) {
    console.error("SEND ORIENTATION INVITE ERROR:", err);
    return res.status(500).json({ msg: "Server error: " + err.message });
  }
};

// ─────────────────────────────────────────────────────────────────
// UPDATE CHECKLIST ITEM — PATCH /api/hr/orientation/:id/checklist/:itemId
// body: { done: true|false, note?: "..." }
// ─────────────────────────────────────────────────────────────────
exports.updateChecklist = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;

    const or = await Orientation.findById(req.params.id);
    if (!or) return res.status(404).json({ msg: "Orientation record not found" });

    const item = or.taskChecklist.id(req.params.itemId);
    if (!item) return res.status(404).json({ msg: "Checklist item not found" });

    const { note } = req.body;
    // If `done` is explicitly sent use it; otherwise toggle current state
    const done = req.body.done !== undefined ? !!req.body.done : !item.done;
    item.done   = done;
    item.doneAt = done ? new Date() : null;
    if (note !== undefined) item.note = String(note).slice(0, 300);

    // Auto-advance to in_progress when first item ticked
    if (done && or.orientationStatus === "invited") {
      or.orientationStatus = "in_progress";
    }
    // Auto-complete when all items done
    const allDone = or.taskChecklist.every(t => t.done);
    if (allDone && or.orientationStatus !== "completed") {
      or.orientationStatus = "completed";
      or.completedAt       = new Date();
    }

    await or.save();
    return res.json({ msg: "Checklist updated", orientation: or });
  } catch (err) {
    console.error("UPDATE CHECKLIST ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// ═══════════════════════════════════════════════════════════════════
//  ORIENTATION SESSIONS (the schedule / agenda)
// ═══════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────
// LIST SESSIONS — GET /api/hr/orientation/sessions
//   ?status=upcoming|completed|cancelled
// ─────────────────────────────────────────────────────────────────
exports.listSessions = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;

    const query = {};
    if (req.query.status) query.status = req.query.status;

    const sessions = await OrientationSession.find(query)
      .populate("createdBy", "name")
      .sort({ scheduledDate: 1, startTime: 1, createdAt: -1 });

    // Count enrolments per session
    const allOrientations = await Orientation.find({}, "sessionIds");
    const enrollmentMap = {};
    allOrientations.forEach(o => {
      (o.sessionIds || []).forEach(sid => {
        const key = String(sid);
        enrollmentMap[key] = (enrollmentMap[key] || 0) + 1;
      });
    });

    const enriched = sessions.map(s => ({
      ...s.toObject(),
      enrolledCount: enrollmentMap[String(s._id)] || 0
    }));

    return res.json({ sessions: enriched, total: enriched.length });
  } catch (err) {
    console.error("LIST SESSIONS ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// ─────────────────────────────────────────────────────────────────
// CREATE SESSION — POST /api/hr/orientation/sessions
// ─────────────────────────────────────────────────────────────────
exports.createSession = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;

    const { title, description, sessionType, scheduledDate, startTime, endTime,
            durationMin, mode, venue, facilitator, isMandatory, targetDept } = req.body;

    if (!title) return res.status(400).json({ msg: "title is required" });

    const session = await OrientationSession.create({
      title, description, sessionType, scheduledDate, startTime, endTime,
      durationMin: durationMin || 60,
      mode: mode || "in_person",
      venue, facilitator,
      isMandatory: isMandatory !== false,
      targetDept: targetDept || "",
      createdBy: req.user.id
    });

    // If mandatory, auto-enrol all pending/invited orientation records
    if (session.isMandatory) {
      const toEnrol = await Orientation.find({
        orientationStatus: { $in: ["pending", "invited"] },
        sessionIds: { $ne: session._id }
      });
      if (toEnrol.length) {
        await Orientation.updateMany(
          { _id: { $in: toEnrol.map(o => o._id) } },
          { $addToSet: { sessionIds: session._id } }
        );
        console.log(`[createSession] auto-enrolled ${toEnrol.length} candidates in mandatory session: ${title}`);
      }
    }

    return res.status(201).json({ msg: "Session created", session });
  } catch (err) {
    console.error("CREATE SESSION ERROR:", err);
    return res.status(500).json({ msg: "Server error: " + err.message });
  }
};

// ─────────────────────────────────────────────────────────────────
// UPDATE SESSION — PATCH /api/hr/orientation/sessions/:id
// ─────────────────────────────────────────────────────────────────
exports.updateSession = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;

    const allowed = [
      "title", "description", "sessionType", "scheduledDate", "startTime", "endTime",
      "durationMin", "mode", "venue", "facilitator", "isMandatory", "targetDept", "status"
    ];
    const update = {};
    allowed.forEach(f => { if (req.body[f] !== undefined) update[f] = req.body[f]; });

    const session = await OrientationSession.findByIdAndUpdate(
      req.params.sid || req.params.id, update, { new: true, runValidators: true }
    );
    if (!session) return res.status(404).json({ msg: "Session not found" });
    return res.json({ msg: "Session updated", session });
  } catch (err) {
    console.error("UPDATE SESSION ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// ─────────────────────────────────────────────────────────────────
// DELETE SESSION — DELETE /api/hr/orientation/sessions/:id
// Also removes this session from all orientation records.
// ─────────────────────────────────────────────────────────────────
exports.deleteSession = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;

    const session = await OrientationSession.findByIdAndDelete(req.params.sid || req.params.id);
    if (!session) return res.status(404).json({ msg: "Session not found" });

    // Remove from all enrolments
    await Orientation.updateMany(
      { sessionIds: session._id },
      { $pull: { sessionIds: session._id } }
    );

    return res.json({ msg: "Session deleted" });
  } catch (err) {
    console.error("DELETE SESSION ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// ─────────────────────────────────────────────────────────────────
// INTERNAL HELPER — auto-create orientation when candidate is onboarded
// Called from onboardingController.updateStatus
// ─────────────────────────────────────────────────────────────────
exports.autoCreate = async (onboarding, userId) => {
  try {
    const exists = await Orientation.findOne({
      $or: [
        { candidateEmail: onboarding.candidateEmail },
        { onboardingId:   onboarding._id }
      ]
    });
    if (exists) return exists;

    const or = await Orientation.create({
      onboardingId:   onboarding._id,
      candidateEmail: onboarding.candidateEmail,
      candidateName:  onboarding.candidateName  || "",
      position:       onboarding.position       || "",
      department:     onboarding.department     || "",
      joiningDate:    onboarding.joiningDate    || "",
      createdBy:      userId
    });

    // Auto-enrol in all mandatory upcoming sessions
    const mandatory = await OrientationSession.find({ isMandatory: true, status: "upcoming" });
    if (mandatory.length) {
      or.sessionIds = mandatory.map(s => s._id);
      await or.save();
    }

    console.log("[Orientation] auto-created for:", onboarding.candidateEmail);
    return or;
  } catch (err) {
    console.error("[Orientation] autoCreate failed:", err.message);
    return null;
  }
};
