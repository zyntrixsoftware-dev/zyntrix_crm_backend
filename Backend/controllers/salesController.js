const mongoose   = require("mongoose");
const StudentLead = require("../models/StudentLead");
const Course      = require("../models/Course");
const Batch       = require("../models/Batch");
const DemoSession = require("../models/DemoSession");
const Enrollment  = require("../models/Enrollment");
const { ensureStudent, emailStudentCreds } = require("../utils/provisionStudent");
const Payment     = require("../models/Payment");
const FollowUp    = require("../models/FollowUp");
const SalesTarget = require("../models/SalesTarget");

// lazy-require to avoid circular deps
function emails() { return require("../utils/studentEmails"); }

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function isSalesOrAdmin(req, res) {
  const ok = ["sales","hr","super_admin","admin","leadgen"].includes(req.user?.role);
  if (!ok) res.status(403).json({ msg: "Access denied" });
  return ok;
}

function validId(id) {
  return mongoose.isValidObjectId(id);
}

// Sales reps = dedicated sales-role logins (legacy) + employees tagged to the
// Sales department. Sales employees use normal employee attendance accounts but
// can be assigned leads by the Sales Admin and see them on their Workstation.
const SALES_REP_FILTER = {
  active: true,
  role: "employee",
  department: { $regex: /sales/i }
};

// ─────────────────────────────────────────────────────────────────────────────
// ══ STUDENT LEADS ════════════════════════════════════════════════════════════
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/sales/leads
exports.listLeads = async (req, res) => {
  try {
    const { stage, source, assignedTo, search, archived, page = 1, limit = 50 } = req.query;
    const q = {};
    if (stage)      q.pipelineStage = stage;
    if (source)     q.source        = source;
    if (assignedTo && validId(assignedTo)) q.assignedTo = assignedTo;
    // A sales employee (employee role) may only ever see leads assigned to them.
    if (req.user && req.user.role === "employee") q.assignedTo = req.user.id;
    q.isArchived = archived === "true";
    if (search) {
      q.$or = [
        { fullName: { $regex: search, $options: "i" } },
        { email:    { $regex: search, $options: "i" } },
        { phone:    { $regex: search, $options: "i" } }
      ];
    }

    const skip  = (parseInt(page) - 1) * parseInt(limit);
    const total = await StudentLead.countDocuments(q);
    const leads = await StudentLead.find(q)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate("courseInterest", "title category")
      .populate("assignedTo",    "name email");

    return res.json({ leads, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    console.error("listLeads:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// GET /api/sales/leads/stats
exports.leadsStats = async (req, res) => {
  try {
    const stages = await StudentLead.aggregate([
      { $match: { isArchived: false } },
      { $group: { _id: "$pipelineStage", count: { $sum: 1 } } }
    ]);
    const sources = await StudentLead.aggregate([
      { $match: { isArchived: false } },
      { $group: { _id: "$source", count: { $sum: 1 } } }
    ]);
    const total = await StudentLead.countDocuments({ isArchived: false });
    return res.json({ stages, sources, total });
  } catch (err) {
    console.error("leadsStats:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// POST /api/sales/leads
exports.createLead = async (req, res) => {
  try {
    if (!isSalesOrAdmin(req, res)) return;
    // Tag where the lead came from. The LeadGen panel hits this same endpoint,
    // so a request from a leadgen user is auto-marked as a LeadGen lead.
    const origin = ["leadgen", "sales", "import", "other"].includes(req.body.origin)
      ? req.body.origin
      : (req.user.role === "leadgen" ? "leadgen" : "sales");
    const lead = await StudentLead.create({ ...req.body, origin, createdBy: req.user.id });
    // send welcome email
    emails().notifyWelcome(lead).catch(e => console.warn("email:", e.message));
    return res.status(201).json({ lead });
  } catch (err) {
    console.error("createLead:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// GET /api/sales/leads/:id
exports.getLead = async (req, res) => {
  try {
    const lead = await StudentLead.findById(req.params.id)
      .populate("courseInterest", "title category price")
      .populate("assignedTo",     "name email")
      .populate("enrollmentId");
    if (!lead) return res.status(404).json({ msg: "Lead not found" });
    return res.json({ lead });
  } catch (err) {
    console.error("getLead:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// PATCH /api/sales/leads/:id
exports.updateLead = async (req, res) => {
  try {
    if (!isSalesOrAdmin(req, res)) return;
    const lead = await StudentLead.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    ).populate("courseInterest", "title").populate("assignedTo", "name email");
    if (!lead) return res.status(404).json({ msg: "Lead not found" });
    return res.json({ lead });
  } catch (err) {
    console.error("updateLead:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// PATCH /api/sales/leads/:id/stage
exports.moveStage = async (req, res) => {
  try {
    if (!isSalesOrAdmin(req, res)) return;
    const { stage, note } = req.body;
    if (!StudentLead.schema.path("pipelineStage").enumValues.includes(stage)) {
      return res.status(400).json({ msg: "Invalid stage" });
    }
    const lead = await StudentLead.findById(req.params.id);
    if (!lead) return res.status(404).json({ msg: "Lead not found" });

    const from = lead.pipelineStage;
    lead.stageHistory.push({ from, to: stage, note: note || "", changedBy: req.user.id });
    lead.pipelineStage = stage;
    await lead.save();

    // email triggers
    if (stage === "demo_scheduled") {
      const demo = await DemoSession.findOne({ lead: lead._id }).sort({ createdAt: -1 })
        .populate("course", "title");
      if (demo) emails().notifyDemoConfirmation(demo, lead).catch(e => console.warn(e.message));
    }

    return res.json({ lead });
  } catch (err) {
    console.error("moveStage:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// PATCH /api/sales/leads/:id/contact
// Records the outcome of a sales contact and routes the lead automatically:
//   in_progress    → stays new_lead
//   interested     → contacted (ready for a demo)
//   follow_up      → contacted + followUpDate set + FollowUp record created
//   not_interested → dropped
exports.setContactOutcome = async (req, res) => {
  try {
    const lead = await StudentLead.findById(req.params.id);
    if (!lead) return res.status(404).json({ msg: "Lead not found" });

    // Sales-side roles may update any lead; a sales employee may update only a
    // lead currently assigned to them (so they can mark contact status from
    // their Workstation, and it reflects straight back in the Sales system).
    const privileged = ["sales","hr","super_admin","admin","leadgen"].includes(req.user?.role);
    const ownLead = req.user?.role === "employee" && lead.assignedTo && String(lead.assignedTo) === String(req.user.id);
    if (!privileged && !ownLead) return res.status(403).json({ msg: "Access denied" });

    const { outcome, followUpDate, note, type } = req.body;
    const STAGE_MAP = {
      in_progress:    "new_lead",
      interested:     "contacted",
      follow_up:      "contacted",
      not_interested: "dropped"
    };
    if (!STAGE_MAP[outcome]) {
      return res.status(400).json({ msg: "Invalid contact outcome" });
    }
    if (outcome === "follow_up" && !followUpDate) {
      return res.status(400).json({ msg: "Follow-up date is required" });
    }

    const newStage = STAGE_MAP[outcome];

    // record stage transition history
    if (lead.pipelineStage !== newStage) {
      lead.stageHistory.push({
        from: lead.pipelineStage,
        to:   newStage,
        note: note || ("Contact outcome: " + outcome),
        changedBy: req.user.id
      });
      lead.pipelineStage = newStage;
    }

    lead.contactOutcome = outcome;
    if (outcome !== "in_progress") lead.lastContactedAt = new Date();
    if (outcome === "follow_up")  lead.followUpDate = new Date(followUpDate);
    if (outcome === "not_interested") lead.followUpDate = null;

    await lead.save();

    // Auto-log this contact in the communication journal
    CommLog.create({
      lead: lead._id, type: "call", direction: "outbound",
      callOutcome: outcome === "interested" ? "connected" : outcome === "follow_up" ? "callback_requested" : outcome === "not_interested" ? "not_answered" : "not_applicable",
      summary: "Contact outcome — " + String(outcome).replace(/_/g, " "),
      createdBy: req.user.id, loggedAt: new Date()
    }).catch(e => console.warn("commlog:", e.message));

    // create a Follow-Up record so it surfaces on the Follow-Ups page
    if (outcome === "follow_up") {
      await FollowUp.create({
        lead:        lead._id,
        scheduledAt: new Date(followUpDate),
        type:        type || "call",
        outcome:     "callback",
        notes:       note || "",
        createdBy:   req.user.id
      });
    }

    return res.json({ lead });
  } catch (err) {
    console.error("setContactOutcome:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// DELETE /api/sales/leads/:id  (soft delete)
exports.deleteLead = async (req, res) => {
  try {
    if (!isSalesOrAdmin(req, res)) return;
    await StudentLead.findByIdAndUpdate(req.params.id, { isArchived: true });
    return res.json({ msg: "Lead archived" });
  } catch (err) {
    console.error("deleteLead:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ══ COURSES ══════════════════════════════════════════════════════════════════
// ─────────────────────────────────────────────────────────────────────────────

exports.listCourses = async (req, res) => {
  try {
    const { category, track, active, search } = req.query;
    const q = {};
    if (category) q.category = category;
    if (track)    q.track    = track;
    if (active !== undefined) q.isActive = active !== "false";
    if (search) q.$or = [
      { title:       { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } }
    ];
    const courses = await Course.find(q).sort({ createdAt: -1 });
    const ids = courses.map(c => c._id);

    // Live demand + capacity per course (powers the catalogue cards)
    const [batchAgg, interestedAgg, demoAgg, enrolledAgg] = await Promise.all([
      Batch.aggregate([
        { $match: { course: { $in: ids }, status: { $in: ["upcoming", "ongoing"] } } },
        { $group: { _id: "$course", open: { $sum: 1 }, seats: { $sum: "$totalSeats" }, booked: { $sum: "$seatsBooked" } } }
      ]),
      StudentLead.aggregate([
        { $match: { courseInterest: { $in: ids }, isArchived: false, pipelineStage: "contacted", contactOutcome: { $ne: "follow_up" } } },
        { $group: { _id: "$courseInterest", count: { $sum: 1 } } }
      ]),
      DemoSession.aggregate([
        { $match: { course: { $in: ids }, cancelled: false } },
        { $group: { _id: "$course", count: { $sum: 1 } } }
      ]),
      Enrollment.aggregate([
        { $match: { course: { $in: ids }, status: "active" } },
        { $group: { _id: "$course", count: { $sum: 1 } } }
      ])
    ]);
    const mapBy = arr => Object.fromEntries(arr.map(x => [String(x._id), x]));
    const bMap = mapBy(batchAgg), iMap = mapBy(interestedAgg), dMap = mapBy(demoAgg), eMap = mapBy(enrolledAgg);

    const result = courses.map(c => {
      const k = String(c._id);
      const bd = bMap[k];
      return {
        ...c.toObject(),
        batchCount:      bd ? bd.open : 0,
        openBatches:     bd ? bd.open : 0,
        seatsLeft:       bd ? Math.max(0, bd.seats - bd.booked) : 0,
        interestedCount: iMap[k] ? iMap[k].count : 0,
        demoCount:       dMap[k] ? dMap[k].count : 0,
        enrolledCount:   eMap[k] ? eMap[k].count : 0
      };
    });
    return res.json({ courses: result });
  } catch (err) {
    console.error("listCourses:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

exports.createCourse = async (req, res) => {
  try {
    if (!isSalesOrAdmin(req, res)) return;
    const body = { ...req.body };
    delete body._id;
    const title = String(body.title || "").trim();
    if (!title) return res.status(400).json({ msg: "Course title is required" });
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

    if (await Course.findOne({ slug })) {
      return res.status(400).json({ msg: "A course with this name already exists" });
    }

    // Insert via upsert — this skips Mongoose 'save' hooks (the same path the
    // Import button uses, which works), so a broken pre-save hook can't break Add.
    const course = await Course.findOneAndUpdate(
      { slug },
      { $set: { ...body, title, slug }, $setOnInsert: { createdBy: req.user.id } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return res.status(201).json({ course });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ msg: "A course with this name already exists" });
    if (err.name === "ValidationError") return res.status(400).json({ msg: Object.values(err.errors).map(e => e.message).join("; ") });
    console.error("createCourse:", err);
    return res.status(500).json({ msg: err.message || "Server error" });
  }
};

exports.getCourse = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ msg: "Course not found" });
    return res.json({ course });
  } catch (err) {
    return res.status(500).json({ msg: "Server error" });
  }
};

exports.updateCourse = async (req, res) => {
  try {
    if (!isSalesOrAdmin(req, res)) return;
    const course = await Course.findByIdAndUpdate(
      req.params.id, { $set: req.body }, { new: true, runValidators: true }
    );
    if (!course) return res.status(404).json({ msg: "Course not found" });
    return res.json({ course });
  } catch (err) {
    console.error("updateCourse:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

exports.deleteCourse = async (req, res) => {
  try {
    if (!isSalesOrAdmin(req, res)) return;
    await Course.findByIdAndUpdate(req.params.id, { isActive: false });
    return res.json({ msg: "Course deactivated" });
  } catch (err) {
    return res.status(500).json({ msg: "Server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ══ BATCHES ══════════════════════════════════════════════════════════════════
// ─────────────────────────────────────────────────────────────────────────────

exports.listBatches = async (req, res) => {
  try {
    const { course, status } = req.query;
    const q = {};
    if (course && validId(course)) q.course = course;
    if (status) q.status = status;
    const batches = await Batch.find(q)
      .sort({ startDate: -1 })
      .populate("course", "title category");
    return res.json({ batches });
  } catch (err) {
    return res.status(500).json({ msg: "Server error" });
  }
};

exports.createBatch = async (req, res) => {
  try {
    if (!isSalesOrAdmin(req, res)) return;
    const batch = await Batch.create({ ...req.body, createdBy: req.user.id });
    return res.status(201).json({ batch: await batch.populate("course", "title") });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ msg: "Batch code already exists" });
    console.error("createBatch:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

exports.getBatch = async (req, res) => {
  try {
    const batch = await Batch.findById(req.params.id).populate("course", "title category price");
    if (!batch) return res.status(404).json({ msg: "Batch not found" });
    return res.json({ batch });
  } catch (err) {
    return res.status(500).json({ msg: "Server error" });
  }
};

exports.updateBatch = async (req, res) => {
  try {
    if (!isSalesOrAdmin(req, res)) return;
    const batch = await Batch.findByIdAndUpdate(
      req.params.id, { $set: req.body }, { new: true, runValidators: true }
    ).populate("course", "title");
    if (!batch) return res.status(404).json({ msg: "Batch not found" });
    return res.json({ batch });
  } catch (err) {
    console.error("updateBatch:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

exports.deleteBatch = async (req, res) => {
  try {
    if (!isSalesOrAdmin(req, res)) return;
    await Batch.findByIdAndUpdate(req.params.id, { status: "cancelled" });
    return res.json({ msg: "Batch cancelled" });
  } catch (err) {
    return res.status(500).json({ msg: "Server error" });
  }
};

exports.getBatchEnrollments = async (req, res) => {
  try {
    const enrollments = await Enrollment.find({ batch: req.params.id })
      .populate("lead", "fullName email phone")
      .populate("course", "title")
      .sort({ enrolledAt: -1 });
    return res.json({ enrollments });
  } catch (err) {
    return res.status(500).json({ msg: "Server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ══ DEMO SESSIONS ════════════════════════════════════════════════════════════
// ─────────────────────────────────────────────────────────────────────────────

exports.listDemos = async (req, res) => {
  try {
    const { lead, attended, from, to } = req.query;
    const q = { cancelled: false };
    if (lead && validId(lead)) q.lead = lead;
    if (attended !== undefined) q.attended = attended === "true";
    if (from || to) {
      q.scheduledAt = {};
      if (from) q.scheduledAt.$gte = new Date(from);
      if (to)   q.scheduledAt.$lte = new Date(to);
    }
    const demos = await DemoSession.find(q)
      .sort({ scheduledAt: 1 })
      .populate("lead",   "fullName email phone")
      .populate("course", "title");
    return res.json({ demos });
  } catch (err) {
    return res.status(500).json({ msg: "Server error" });
  }
};

exports.createDemo = async (req, res) => {
  try {
    if (!isSalesOrAdmin(req, res)) return;
    const demo = await DemoSession.create({ ...req.body, createdBy: req.user.id });

    // Move lead to demo_scheduled
    const lead = await StudentLead.findById(demo.lead);
    if (lead && lead.pipelineStage === "contacted") {
      lead.stageHistory.push({ from: lead.pipelineStage, to: "demo_scheduled", changedBy: req.user.id });
      lead.pipelineStage = "demo_scheduled";
      await lead.save();
    }

    const populated = await demo.populate([
      { path: "lead",   select: "fullName email phone" },
      { path: "course", select: "title" }
    ]);

    // send confirmation email
    if (lead) emails().notifyDemoConfirmation(populated, lead).catch(e => console.warn(e.message));

    CommLog.create({
      lead: demo.lead, type: "meeting", direction: "outbound",
      summary: "Demo scheduled for " + new Date(demo.scheduledAt).toLocaleString("en-IN"),
      createdBy: req.user.id, loggedAt: new Date()
    }).catch(e => console.warn("commlog:", e.message));

    return res.status(201).json({ demo: populated });
  } catch (err) {
    console.error("createDemo:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// POST /api/sales/demos/bulk
// Schedule ONE demo class for a batch of leads (e.g. everyone who picked the same
// course). Creates a DemoSession per lead and moves them all to demo_scheduled.
exports.bulkCreateDemos = async (req, res) => {
  try {
    if (!isSalesOrAdmin(req, res)) return;
    const { leadIds, course, scheduledAt, mode, meetingLink, venue, conductedBy } = req.body;
    if (!Array.isArray(leadIds) || !leadIds.length)
      return res.status(400).json({ msg: "No leads selected" });
    if (!scheduledAt)
      return res.status(400).json({ msg: "Scheduled date/time is required" });

    const ids = leadIds.filter(id => validId(id));
    if (!ids.length) return res.status(400).json({ msg: "No valid leads" });

    const docs = ids.map(lead => ({
      lead,
      course:      course && validId(course) ? course : null,
      scheduledAt,
      mode:        mode === "offline" ? "offline" : "online",
      meetingLink: meetingLink || "",
      venue:       venue || "",
      conductedBy: conductedBy || "",
      createdBy:   req.user.id
    }));
    const created = await DemoSession.insertMany(docs);

    // Move each lead into demo_scheduled (with stage history) — only if still earlier in the pipeline.
    for (const id of ids) {
      const lead = await StudentLead.findById(id);
      if (lead && ["new_lead", "contacted"].includes(lead.pipelineStage)) {
        lead.stageHistory.push({ from: lead.pipelineStage, to: "demo_scheduled", note: "Batch demo scheduled", changedBy: req.user.id });
        lead.pipelineStage = "demo_scheduled";
        await lead.save();
      }
      CommLog.create({
        lead: id, type: "meeting", direction: "outbound",
        summary: "Demo class scheduled for " + new Date(scheduledAt).toLocaleString("en-IN"),
        createdBy: req.user.id, loggedAt: new Date()
      }).catch(e => console.warn("commlog:", e.message));
    }

    return res.status(201).json({ created: created.length });
  } catch (err) {
    console.error("bulkCreateDemos:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

exports.getDemo = async (req, res) => {
  try {
    const demo = await DemoSession.findById(req.params.id)
      .populate("lead",   "fullName email phone city")
      .populate("course", "title category");
    if (!demo) return res.status(404).json({ msg: "Demo not found" });
    return res.json({ demo });
  } catch (err) {
    return res.status(500).json({ msg: "Server error" });
  }
};

exports.updateDemo = async (req, res) => {
  try {
    if (!isSalesOrAdmin(req, res)) return;
    const demo = await DemoSession.findById(req.params.id);
    if (!demo) return res.status(404).json({ msg: "Demo not found" });

    const wasAttended = demo.attended;
    Object.assign(demo, req.body);
    if (req.body.attended && !wasAttended) {
      demo.attendedAt = new Date();
      // Move lead to demo_attended
      const lead = await StudentLead.findById(demo.lead);
      if (lead && ["demo_scheduled", "contacted"].includes(lead.pipelineStage)) {
        lead.stageHistory.push({ from: lead.pipelineStage, to: "demo_attended", changedBy: req.user.id });
        lead.pipelineStage = "demo_attended";
        await lead.save();
      }
    }
    await demo.save();
    return res.json({ demo: await demo.populate([
      { path: "lead",   select: "fullName email phone" },
      { path: "course", select: "title" }
    ])});
  } catch (err) {
    console.error("updateDemo:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

exports.deleteDemo = async (req, res) => {
  try {
    if (!isSalesOrAdmin(req, res)) return;
    await DemoSession.findByIdAndUpdate(req.params.id, { cancelled: true, cancelReason: req.body.reason || "" });
    return res.json({ msg: "Demo cancelled" });
  } catch (err) {
    return res.status(500).json({ msg: "Server error" });
  }
};

exports.sendDemoReminder = async (req, res) => {
  try {
    if (!isSalesOrAdmin(req, res)) return;
    const demo = await DemoSession.findById(req.params.id)
      .populate("lead", "fullName email phone")
      .populate("course", "title");
    if (!demo) return res.status(404).json({ msg: "Demo not found" });
    await emails().notifyDemoReminder(demo, demo.lead);
    await DemoSession.findByIdAndUpdate(req.params.id, { reminderSent: true });
    return res.json({ msg: "Reminder sent" });
  } catch (err) {
    console.error("sendDemoReminder:", err);
    return res.status(500).json({ msg: err.message || "Server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ══ ENROLLMENTS ══════════════════════════════════════════════════════════════
// ─────────────────────────────────────────────────────────────────────────────

exports.listEnrollments = async (req, res) => {
  try {
    const { batch, course, status, lead } = req.query;
    const q = {};
    if (batch  && validId(batch))  q.batch  = batch;
    if (course && validId(course)) q.course = course;
    if (status) q.completionStatus = status;
    if (lead   && validId(lead))   q.lead   = lead;

    const enrollments = await Enrollment.find(q)
      .sort({ enrolledAt: -1 })
      .populate({
        path: "lead",
        select: "fullName email phone assignedTo",
        populate: { path: "assignedTo", select: "name email" }
      })
      .populate("batch",        "batchCode startDate")
      .populate("course",       "title")
      .populate("createdBy",    "name email")
      .populate("postSalesRep", "name email");
    return res.json({ enrollments });
  } catch (err) {
    return res.status(500).json({ msg: "Server error" });
  }
};

// GET /api/sales/enrollments/my-fee-collection
// Pre-fee-paid students assigned to the logged-in sales employee, with a full-
// fee balance still pending. (Privileged roles may pass ?rep=<userId>.)
exports.myFeeCollection = async (req, res) => {
  try {
    const privileged = ["sales","hr","super_admin","admin"].includes(req.user?.role);
    const repId = (privileged && req.query.rep && validId(req.query.rep)) ? req.query.rep : req.user.id;
    const all = await Enrollment.find({ postLeadRep: repId })
      .sort({ enrolledAt: -1 })
      .populate({ path: "lead", select: "fullName email phone assignedTo" })
      .populate("batch",  "batchCode startDate")
      .populate("course", "title");
    const payable = e => Number(e.discountedFee > 0 ? e.discountedFee : (e.totalFee || 0));
    const enrollments = all.filter(e => {
      const paid = Number(e.feePaid || 0);
      return paid > 0 && paid < payable(e);
    });
    return res.json({ enrollments });
  } catch (err) {
    console.error("myFeeCollection:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// POST /api/sales/enrollments/:id/collect  { amount, method?, transactionId?, remarks? }
// The assigned sales employee records full-fee payments. When the balance hits
// zero the student automatically surfaces in Post-Sales (fully-paid).
exports.collectFee = async (req, res) => {
  try {
    const enr = await Enrollment.findById(req.params.id).populate("lead", "assignedTo fullName email");
    if (!enr) return res.status(404).json({ msg: "Enrollment not found" });
    const privileged = ["sales","hr","super_admin","admin"].includes(req.user?.role);
    const ownsIt = req.user?.role === "employee" && enr.postLeadRep && String(enr.postLeadRep) === String(req.user.id);
    if (!privileged && !ownsIt) return res.status(403).json({ msg: "Access denied" });

    const payable = Number(enr.discountedFee > 0 ? enr.discountedFee : (enr.totalFee || 0));
    const balance = Math.max(0, payable - Number(enr.feePaid || 0));
    if (balance <= 0) return res.status(400).json({ msg: "Already fully paid" });

    let amount = Math.round(Number(req.body.amount));
    if (!amount || amount <= 0) return res.status(400).json({ msg: "Enter a valid amount" });
    if (amount > balance) amount = balance;

    await Payment.create({
      enrollment: enr._id, lead: enr.lead._id, course: enr.course,
      amount, method: req.body.method || "upi",
      transactionId: req.body.transactionId || "", remarks: req.body.remarks || "Full-fee collection",
      createdBy: req.user.id
    });
    enr.feePaid = Number(enr.feePaid || 0) + amount;
    await enr.save();

    const newBal = Math.max(0, payable - enr.feePaid);
    return res.json({
      msg: newBal <= 0 ? "Fully paid — student moved to Post-Sales" : ("Recorded ₹" + amount),
      feePaid: enr.feePaid, balance: newBal, fullyPaid: newBal <= 0
    });
  } catch (err) {
    console.error("collectFee:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

const _payable = e => Number(e.discountedFee > 0 ? e.discountedFee : (e.totalFee || 0));
const _isPartial = e => { const paid = Number(e.feePaid || 0); return paid > 0 && paid < _payable(e); };

// GET /api/sales/post-leads
// Students who paid a pre-fee but still owe a balance — the Sales Admin assigns
// each to a salesperson here, who then collects the full fee.
exports.listPostLeads = async (req, res) => {
  try {
    if (!isSalesOrAdmin(req, res)) return;
    const all = await Enrollment.find({})
      .sort({ enrolledAt: -1 })
      .populate({ path: "lead", select: "fullName email phone assignedTo", populate: { path: "assignedTo", select: "name email" } })
      .populate("batch",  "batchCode startDate")
      .populate("course", "title")
      .populate("postLeadRep", "name email");
    return res.json({ postLeads: all.filter(_isPartial) });
  } catch (err) {
    console.error("listPostLeads:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// POST /api/sales/post-leads/bulk-assign  { ids:[], rep }
exports.bulkAssignPostLeads = async (req, res) => {
  try {
    if (!isSalesOrAdmin(req, res)) return;
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(validId) : [];
    if (!ids.length) return res.status(400).json({ msg: "No post-leads selected" });
    const rep = req.body.rep && validId(req.body.rep) ? req.body.rep : null;
    const r = await Enrollment.updateMany(
      { _id: { $in: ids } },
      { $set: { postLeadRep: rep, postLeadAssignedAt: rep ? new Date() : null } }
    );
    return res.json({ msg: `Assigned ${r.modifiedCount} post-lead(s)`, modified: r.modifiedCount });
  } catch (err) {
    console.error("bulkAssignPostLeads:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// POST /api/sales/post-leads/auto-distribute
exports.autoDistributePostLeads = async (req, res) => {
  try {
    if (!isSalesOrAdmin(req, res)) return;
    const reps = await User.find(SALES_REP_FILTER).select("_id name").lean();
    if (!reps.length) return res.status(400).json({ msg: "No sales employees found. Create logins with role 'employee' + department 'Sales' first." });
    const all = await Enrollment.find({ $or: [{ postLeadRep: null }, { postLeadRep: { $exists: false } }] })
      .select("_id feePaid discountedFee totalFee");
    const pending = all.filter(_isPartial);
    if (!pending.length) return res.json({ msg: "No unassigned post-leads to distribute.", distributed: 0, reps: reps.length });
    const ops = pending.map((e, i) => ({
      updateOne: { filter: { _id: e._id }, update: { $set: { postLeadRep: reps[i % reps.length]._id, postLeadAssignedAt: new Date() } } }
    }));
    await Enrollment.bulkWrite(ops);
    return res.json({ msg: `Distributed ${pending.length} post-lead(s) across ${reps.length} salesperson(s)`, distributed: pending.length, reps: reps.length });
  } catch (err) {
    console.error("autoDistributePostLeads:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// PATCH /api/sales/post-leads/:id  { rep }  — assign a single post-lead
exports.assignPostLead = async (req, res) => {
  try {
    if (!isSalesOrAdmin(req, res)) return;
    const rep = req.body.rep && validId(req.body.rep) ? req.body.rep : null;
    const enr = await Enrollment.findByIdAndUpdate(
      req.params.id,
      { $set: { postLeadRep: rep, postLeadAssignedAt: rep ? new Date() : null } },
      { new: true }
    ).populate("postLeadRep", "name email");
    if (!enr) return res.status(404).json({ msg: "Not found" });
    return res.json({ enrollment: enr });
  } catch (err) {
    console.error("assignPostLead:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// POST /api/sales/enrollments/:id/payment-link
// Generates a Razorpay payment link for the outstanding balance, emails it
// (Graph) and returns WhatsApp/SMS share links. Webhook auto-confirms payment.
exports.sendPaymentLink = async (req, res) => {
  try {
    const rzp = require("../utils/razorpay");
    const enr = await Enrollment.findById(req.params.id)
      .populate("lead", "fullName email phone assignedTo")
      .populate("course", "title");
    if (!enr) return res.status(404).json({ msg: "Enrollment not found" });
    const privileged = ["sales","hr","super_admin","admin"].includes(req.user?.role);
    const ownsIt = req.user?.role === "employee" && enr.postLeadRep && String(enr.postLeadRep) === String(req.user.id);
    if (!privileged && !ownsIt) return res.status(403).json({ msg: "Access denied" });

    const payable = Number(enr.discountedFee > 0 ? enr.discountedFee : (enr.totalFee || 0));
    const balance = Math.max(0, payable - Number(enr.feePaid || 0));
    if (balance <= 0) return res.status(400).json({ msg: "Already fully paid" });

    const lead = enr.lead || {};
    const courseTitle = (enr.course && enr.course.title) || "your course";

    // Prefer Razorpay (auto-confirm) when configured; otherwise fall back to a
    // direct UPI link to the company UPI ID (no gateway account / PAN needed —
    // payment is then confirmed manually with the Record button).
    const useRzp  = rzp.configured();
    const upiId   = (process.env.COMPANY_UPI_ID   || "").trim();
    const upiName = (process.env.COMPANY_UPI_NAME || process.env.COMPANY_NAME || "Zyntrix Software Solutions").trim();
    if (!useRzp && !upiId) {
      return res.status(400).json({ msg: "No payment method configured. Set COMPANY_UPI_ID (UPI) or RAZORPAY_KEY_ID/SECRET in the server .env." });
    }

    let payUrl = "", linkId = "";
    if (useRzp) {
      let link;
      try {
        link = await rzp.createPaymentLink({
          amount: balance, name: lead.fullName || "", email: lead.email || "", contact: lead.phone || "",
          description: "Fee for " + courseTitle,
          referenceId: "enr_" + enr._id + "_" + Date.now(),
          notifyEmail: false, notifySms: false,
          notes: { enrollmentId: String(enr._id) }
        });
      } catch (e) {
        return res.status(502).json({ msg: e.message || "Could not create payment link" });
      }
      payUrl = link.short_url || ""; linkId = link.id || "";
    } else {
      const params = new URLSearchParams({
        pa: upiId, pn: upiName, am: String(balance), cu: "INR",
        tn: ("Fee " + courseTitle).slice(0, 60), tr: "enr" + String(enr._id)
      });
      payUrl = "upi://pay?" + params.toString().replace(/\+/g, "%20");
    }

    enr.lastPaymentLinkId  = linkId;
    enr.lastPaymentLinkUrl = payUrl;
    await enr.save();

    let emailed = false;
    const wantEmail = req.body && (req.body.email === true || req.body.channel === "email" || req.body.sendEmail === true);
    if (wantEmail && lead.email) {
      try { await emails().notifyPaymentLink(lead, { courseTitle, amount: balance, url: payUrl, upiId: useRzp ? "" : upiId }); emailed = true; }
      catch (e) { console.warn("paylink email:", e.message); }
    }
    const digits  = String(lead.phone || "").replace(/\D/g, "");
    const waNum   = digits ? (digits.length === 10 ? "91" + digits : digits) : "";
    const msg = "Hi " + (lead.fullName || "") + ", please pay your course fee of \u20b9" +
      balance.toLocaleString("en-IN") + " for " + courseTitle +
      (useRzp ? (": " + payUrl) : (" to UPI ID " + upiId + " (or tap on phone: " + payUrl + ")"));
    return res.json({
      url: payUrl, amount: balance, emailed, hasEmail: !!lead.email, email: lead.email || "", upiId: useRzp ? "" : upiId,
      whatsapp: waNum ? ("https://wa.me/" + waNum + "?text=" + encodeURIComponent(msg)) : "",
      sms: digits ? ("sms:" + lead.phone + "?body=" + encodeURIComponent(msg)) : "",
      message: msg
    });
  } catch (err) {
    console.error("sendPaymentLink:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// POST /api/sales/razorpay/webhook  (PUBLIC — mounted before the auth guard)
exports.razorpayWebhook = async (req, res) => {
  try {
    const rzp = require("../utils/razorpay");
    const signature = req.headers["x-razorpay-signature"];
    const raw = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
    if (!rzp.verifyWebhook(raw, signature)) return res.status(400).json({ msg: "Invalid signature" });
    if (req.body && req.body.event === "payment_link.paid") {
      const pl  = (req.body.payload && req.body.payload.payment_link && req.body.payload.payment_link.entity) || {};
      const pay = (req.body.payload && req.body.payload.payment && req.body.payload.payment.entity) || {};
      const enrId = pl.notes && pl.notes.enrollmentId;
      const amountPaise = pay.amount || pl.amount_paid || pl.amount || 0;
      const amount = Math.round(Number(amountPaise) / 100);
      const txnId = pl.id || pay.id || "";
      if (enrId && amount > 0) {
        const enr = await Enrollment.findById(enrId);
        if (enr) {
          const dup = txnId ? await Payment.findOne({ transactionId: txnId }) : null;
          if (!dup) {
            await Payment.create({
              enrollment: enr._id, lead: enr.lead, course: enr.course,
              amount, method: "upi", transactionId: txnId,
              remarks: "Razorpay payment link", createdBy: enr.postLeadRep || enr.createdBy || undefined
            });
            enr.feePaid = Number(enr.feePaid || 0) + amount;
            await enr.save();
            console.log("\u2705 Razorpay payment_link.paid \u2014 enrollment", String(enr._id), "+\u20b9" + amount);
          }
        }
      }
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error("razorpayWebhook:", err);
    return res.status(500).json({ msg: "error" });
  }
};

// Roles allowed to view / use the pre- & post-sales panels
function canPanel(req, res) {
  const ok = req.user && ["sales","presales","postsales","super_admin","admin"].includes(req.user.role);
  if (!ok) res.status(403).json({ msg: "Access denied" });
  return ok;
}

// GET /sales/postsales-reps - active users who can be allocated post-sales work
exports.listPostSalesReps = async (req, res) => {
  if (!canPanel(req, res)) return;
  try {
    const reps = await User.find({ role: "postsales", active: true })
      .select("name email").sort({ name: 1 }).lean();
    return res.json({ reps });
  } catch (e) {
    console.error("listPostSalesReps:", e);
    return res.status(500).json({ msg: "Server error" });
  }
};

// PATCH /sales/enrollments/:id/postsales-rep - allocate (or clear) a post-sales rep
exports.assignPostSalesRep = async (req, res) => {
  if (!canPanel(req, res)) return;
  try {
    const repId = req.body.repId;
    const upd = (repId && validId(repId))
      ? { postSalesRep: repId, postSalesAssignedAt: new Date() }
      : { postSalesRep: null, postSalesAssignedAt: null };
    const enrollment = await Enrollment.findByIdAndUpdate(req.params.id, upd, { new: true })
      .populate("postSalesRep", "name email");
    if (!enrollment) return res.status(404).json({ msg: "Enrollment not found" });
    return res.json({ enrollment });
  } catch (err) {
    console.error("assignPostSalesRep:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

exports.createEnrollment = async (req, res) => {
  try {
    if (!isSalesOrAdmin(req, res)) return;

    const batch = await Batch.findById(req.body.batch);
    if (!batch) return res.status(404).json({ msg: "Batch not found" });
    if (batch.seatsAvailable <= 0) return res.status(400).json({ msg: "Batch is full" });

    const plan          = req.body.paymentPlan || "full";
    const totalFee      = Number(req.body.totalFee) || 0;
    const discountedFee = Number(req.body.discountedFee) || totalFee;
    const emiMonths     = Number(req.body.emiMonths) || 0;
    const pay           = req.body.initialPayment || {};
    const payAmt        = Math.max(0, Number(pay.amount) || 0);

    // Payment-to-enrol gate. Amount due now depends on the plan:
    //   full → whole (discounted) fee · emi → first instalment · scholarship/free → 0
    // Currently NOT enforced (set ENFORCE_ENROLL_PAYMENT = true to require it).
    const ENFORCE_ENROLL_PAYMENT = false;
    const dueNow =
      plan === "full" ? discountedFee :
      plan === "emi"  ? (emiMonths > 0 ? Math.ceil(discountedFee / emiMonths) : discountedFee) :
      0;
    if (ENFORCE_ENROLL_PAYMENT && payAmt < dueNow) {
      return res.status(400).json({ msg: `Collect at least ₹${dueNow.toLocaleString("en-IN")} before enrolling this student` });
    }

    const enrollment = await Enrollment.create({
      ...req.body,
      discountedFee,
      feePaid: payAmt,
      createdBy: req.user.id
    });

    // record the money collected at enrolment so it shows up in Payments
    if (payAmt >= 1) {
      await Payment.create({
        enrollment:       enrollment._id,
        lead:             req.body.lead,
        course:           req.body.course || null,
        amount:           payAmt,
        method:           pay.method || "upi",
        transactionId:    pay.transactionId || "",
        instalmentNumber: 1,
        remarks:          "Enrolment payment",
        createdBy:        req.user.id
      });
    }

    // book the seat
    batch.seatsBooked += 1;
    await batch.save();

    // move lead to enrolled
    const lead = await StudentLead.findById(req.body.lead);
    if (lead) {
      lead.stageHistory.push({ from: lead.pipelineStage, to: "enrolled", changedBy: req.user.id });
      lead.pipelineStage = "enrolled";
      lead.enrollmentId  = enrollment._id;
      await lead.save();

      const course = await Course.findById(req.body.course);
      emails().notifyEnrollmentConfirmation(enrollment, lead, course, batch)
        .catch(e => console.warn(e.message));

      // Data-flow link: an enrolled student automatically gets an LMS login
      ensureStudent(lead.email, lead.fullName).then(r => {
        if (r && r.created && r.tempPassword) emailStudentCreds(r.email, r.name, r.tempPassword);
      }).catch(e => console.warn("auto-provision:", e.message));
    }

    CommLog.create({
      lead: req.body.lead, type: "other", direction: "outbound",
      summary: "Enrolled — " + plan + " plan" + (payAmt ? ", paid ₹" + payAmt.toLocaleString("en-IN") : ""),
      createdBy: req.user.id, loggedAt: new Date()
    }).catch(e => console.warn("commlog:", e.message));

    return res.status(201).json({ enrollment: await enrollment.populate([
      { path: "lead",   select: "fullName email phone" },
      { path: "batch",  select: "batchCode startDate" },
      { path: "course", select: "title" }
    ])});
  } catch (err) {
    console.error("createEnrollment:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

exports.getEnrollment = async (req, res) => {
  try {
    const enrollment = await Enrollment.findById(req.params.id)
      .populate("lead",   "fullName email phone city")
      .populate("batch",  "batchCode startDate endDate schedule meetingLink")
      .populate("course", "title category");
    if (!enrollment) return res.status(404).json({ msg: "Enrollment not found" });

    const payments = await Payment.find({ enrollment: enrollment._id, isVoided: false })
      .sort({ paidAt: -1 });
    return res.json({ enrollment, payments });
  } catch (err) {
    return res.status(500).json({ msg: "Server error" });
  }
};

exports.updateEnrollment = async (req, res) => {
  try {
    if (!isSalesOrAdmin(req, res)) return;
    const enrollment = await Enrollment.findByIdAndUpdate(
      req.params.id, { $set: req.body }, { new: true, runValidators: true }
    ).populate("lead", "fullName email").populate("batch", "batchCode").populate("course", "title");
    if (!enrollment) return res.status(404).json({ msg: "Enrollment not found" });

    // certificate email
    if (req.body.certificateIssued && req.body.certificateUrl) {
      const lead = enrollment.lead;
      emails().notifyCertificate(enrollment, lead).catch(e => console.warn(e.message));
    }
    return res.json({ enrollment });
  } catch (err) {
    console.error("updateEnrollment:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

exports.deleteEnrollment = async (req, res) => {
  try {
    if (!isSalesOrAdmin(req, res)) return;
    const enrollment = await Enrollment.findById(req.params.id);
    if (!enrollment) return res.status(404).json({ msg: "Enrollment not found" });
    // decrement seats
    await Batch.findByIdAndUpdate(enrollment.batch, { $inc: { seatsBooked: -1 } });
    await Enrollment.findByIdAndDelete(req.params.id);
    return res.json({ msg: "Enrollment deleted" });
  } catch (err) {
    return res.status(500).json({ msg: "Server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ══ PAYMENTS ═════════════════════════════════════════════════════════════════
// ─────────────────────────────────────────────────────────────────────────────

exports.listPayments = async (req, res) => {
  try {
    const { enrollment, lead, from, to, method } = req.query;
    const q = { isVoided: false };
    if (enrollment && validId(enrollment)) q.enrollment = enrollment;
    if (lead       && validId(lead))       q.lead       = lead;
    if (method) q.method = method;
    if (from || to) {
      q.paidAt = {};
      if (from) q.paidAt.$gte = new Date(from);
      if (to)   q.paidAt.$lte = new Date(to);
    }
    const payments = await Payment.find(q)
      .sort({ paidAt: -1 })
      .populate("lead",       "fullName email")
      .populate("enrollment", "paymentPlan totalFee feePaid")
      .populate("course",     "title");
    return res.json({ payments });
  } catch (err) {
    return res.status(500).json({ msg: "Server error" });
  }
};

exports.paymentSummary = async (req, res) => {
  try {
    const today = new Date();
    const startOfDay = new Date(today.setHours(0,0,0,0));
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const [todayTotal, monthTotal, totalCollected] = await Promise.all([
      Payment.aggregate([
        { $match: { isVoided: false, paidAt: { $gte: startOfDay } } },
        { $group: { _id: null, total: { $sum: "$amount" } } }
      ]),
      Payment.aggregate([
        { $match: { isVoided: false, paidAt: { $gte: startOfMonth } } },
        { $group: { _id: null, total: { $sum: "$amount" } } }
      ]),
      Payment.aggregate([
        { $match: { isVoided: false } },
        { $group: { _id: null, total: { $sum: "$amount" } } }
      ])
    ]);

    const overdue = await Enrollment.countDocuments({
      completionStatus: "active",
      nextDueDate: { $lt: new Date() },
      $expr: { $gt: ["$totalFee", "$feePaid"] }
    });

    return res.json({
      todayTotal:     todayTotal[0]?.total     || 0,
      monthTotal:     monthTotal[0]?.total     || 0,
      totalCollected: totalCollected[0]?.total || 0,
      overdueCount:   overdue
    });
  } catch (err) {
    return res.status(500).json({ msg: "Server error" });
  }
};

exports.createPayment = async (req, res) => {
  try {
    if (!isSalesOrAdmin(req, res)) return;
    const payment = await Payment.create({ ...req.body, createdBy: req.user.id });

    // update enrollment feePaid
    await Enrollment.findByIdAndUpdate(req.body.enrollment, {
      $inc: { feePaid: req.body.amount }
    });

    return res.status(201).json({ payment: await payment.populate([
      { path: "lead",   select: "fullName email" },
      { path: "course", select: "title" }
    ])});
  } catch (err) {
    console.error("createPayment:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

exports.updatePayment = async (req, res) => {
  try {
    if (!isSalesOrAdmin(req, res)) return;
    const payment = await Payment.findByIdAndUpdate(
      req.params.id, { $set: req.body }, { new: true }
    );
    if (!payment) return res.status(404).json({ msg: "Payment not found" });
    return res.json({ payment });
  } catch (err) {
    return res.status(500).json({ msg: "Server error" });
  }
};

exports.voidPayment = async (req, res) => {
  try {
    if (!isSalesOrAdmin(req, res)) return;
    const payment = await Payment.findById(req.params.id);
    if (!payment) return res.status(404).json({ msg: "Payment not found" });
    if (payment.isVoided) return res.status(400).json({ msg: "Already voided" });

    payment.isVoided  = true;
    payment.voidedAt  = new Date();
    payment.voidReason = req.body.reason || "";
    await payment.save();

    // reduce feePaid on enrollment
    await Enrollment.findByIdAndUpdate(payment.enrollment, {
      $inc: { feePaid: -payment.amount }
    });

    return res.json({ msg: "Payment voided" });
  } catch (err) {
    return res.status(500).json({ msg: "Server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ══ FOLLOW-UPS ═══════════════════════════════════════════════════════════════
// ─────────────────────────────────────────────────────────────────────────────

exports.listFollowUps = async (req, res) => {
  try {
    const { lead, completed, rep, overdue } = req.query;
    const q = {};
    if (lead && validId(lead)) q.lead = lead;
    if (completed !== undefined) q.isCompleted = completed === "true";
    if (rep  && validId(rep))   q.createdBy   = rep;
    if (overdue === "true") {
      q.isCompleted = false;
      q.scheduledAt = { $lt: new Date() };
    }
    const followups = await FollowUp.find(q)
      .sort({ scheduledAt: 1 })
      .populate("lead", "fullName email phone pipelineStage");
    return res.json({ followups });
  } catch (err) {
    return res.status(500).json({ msg: "Server error" });
  }
};

exports.todayFollowUps = async (req, res) => {
  try {
    const today = new Date();
    const start = new Date(today.setHours(0,0,0,0));
    const end   = new Date(today.setHours(23,59,59,999));
    const followups = await FollowUp.find({
      isCompleted: false,
      scheduledAt: { $gte: start, $lte: end },
      createdBy: req.user.id
    }).populate("lead", "fullName email phone pipelineStage");
    return res.json({ followups });
  } catch (err) {
    return res.status(500).json({ msg: "Server error" });
  }
};

exports.createFollowUp = async (req, res) => {
  try {
    if (!isSalesOrAdmin(req, res)) return;
    const followup = await FollowUp.create({ ...req.body, createdBy: req.user.id });
    return res.status(201).json({ followup: await followup.populate("lead", "fullName email") });
  } catch (err) {
    console.error("createFollowUp:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

exports.updateFollowUp = async (req, res) => {
  try {
    if (!isSalesOrAdmin(req, res)) return;
    const fu = await FollowUp.findById(req.params.id);
    if (!fu) return res.status(404).json({ msg: "Follow-up not found" });

    const wasCompleted = fu.isCompleted;
    Object.assign(fu, req.body);
    if (req.body.isCompleted && !wasCompleted) fu.completedAt = new Date();
    await fu.save();

    // Sync the parent lead so the Leads/pipeline pages stay consistent.
    const lead = await StudentLead.findById(fu.lead);
    if (lead) {
      lead.lastContactedAt = new Date();

      // On completion, route the lead based on the recorded outcome.
      if (req.body.isCompleted && !wasCompleted) {
        const OUTCOME_STAGE = {
          interested:     "contacted",
          demo_booked:    "demo_scheduled",
          enrolled:       "enrolled",
          not_interested: "dropped",
          dropped:        "dropped"
        };
        const target = OUTCOME_STAGE[req.body.outcome];
        if (target && lead.pipelineStage !== target) {
          lead.stageHistory.push({
            from: lead.pipelineStage, to: target,
            note: "Follow-up outcome: " + req.body.outcome, changedBy: req.user.id
          });
          lead.pipelineStage = target;
        }
        if (req.body.outcome === "interested")     lead.contactOutcome = "interested";
        if (req.body.outcome === "not_interested" ||
            req.body.outcome === "dropped")        lead.contactOutcome = "not_interested";
      }

      // A rescheduled (next) follow-up keeps the lead in the follow-up workflow.
      if (req.body.nextFollowUp) {
        lead.followUpDate   = new Date(req.body.nextFollowUp);
        lead.contactOutcome = "follow_up";
        if (lead.pipelineStage === "new_lead") {
          lead.stageHistory.push({
            from: "new_lead", to: "contacted",
            note: "Rescheduled follow-up", changedBy: req.user.id
          });
          lead.pipelineStage = "contacted";
        }
      }
      await lead.save();
    }

    // Create the next follow-up record so it surfaces on the Follow-Ups page.
    if (req.body.nextFollowUp) {
      await FollowUp.create({
        lead:        fu.lead,
        scheduledAt: new Date(req.body.nextFollowUp),
        type:        fu.type || "call",
        notes:       "",
        createdBy:   req.user.id
      });
    }

    return res.json({ followup: await fu.populate("lead", "fullName email phone") });
  } catch (err) {
    console.error("updateFollowUp:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

exports.deleteFollowUp = async (req, res) => {
  try {
    if (!isSalesOrAdmin(req, res)) return;
    await FollowUp.findByIdAndDelete(req.params.id);
    return res.json({ msg: "Follow-up deleted" });
  } catch (err) {
    return res.status(500).json({ msg: "Server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ══ SALES TARGETS ════════════════════════════════════════════════════════════
// ─────────────────────────────────────────────────────────────────────────────

exports.listTargets = async (req, res) => {
  try {
    const now   = new Date();
    const month = parseInt(req.query.month) || (now.getMonth() + 1);
    const year  = parseInt(req.query.year)  || now.getFullYear();
    const q = { month, year };
    if (req.user.role === "sales") q.user = req.user.id;
    const targets = await SalesTarget.find(q).populate("user", "name email");
    return res.json({ targets });
  } catch (err) {
    return res.status(500).json({ msg: "Server error" });
  }
};

exports.upsertTarget = async (req, res) => {
  try {
    if (!isSalesOrAdmin(req, res)) return;
    const { user, month, year, ...rest } = req.body;
    const target = await SalesTarget.findOneAndUpdate(
      { user: user || req.user.id, month, year },
      { $set: { ...rest, createdBy: req.user.id } },
      { upsert: true, new: true, runValidators: true }
    ).populate("user", "name email");
    return res.json({ target });
  } catch (err) {
    console.error("upsertTarget:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

exports.targetsDashboard = async (req, res) => {
  try {
    const now   = new Date();
    const month = parseInt(req.query.month) || (now.getMonth() + 1);
    const year  = parseInt(req.query.year)  || now.getFullYear();

    const targets = await SalesTarget.find({ month, year })
      .populate("user", "name email");

    // recompute achieved values from actual data
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth   = new Date(year, month, 0, 23, 59, 59);

    const enriched = await Promise.all(targets.map(async t => {
      const uid = t.user._id;
      const [leads, demos, enrollments, revenue] = await Promise.all([
        StudentLead.countDocuments({ assignedTo: uid, createdAt: { $gte: startOfMonth, $lte: endOfMonth } }),
        DemoSession.countDocuments({ createdBy: uid, scheduledAt: { $gte: startOfMonth, $lte: endOfMonth } }),
        Enrollment.countDocuments({ createdBy: uid, enrolledAt: { $gte: startOfMonth, $lte: endOfMonth } }),
        Payment.aggregate([
          { $match: { createdBy: uid, paidAt: { $gte: startOfMonth, $lte: endOfMonth }, isVoided: false } },
          { $group: { _id: null, total: { $sum: "$amount" } } }
        ])
      ]);
      return {
        ...t.toObject(),
        achievedLeads:       leads,
        achievedDemos:       demos,
        achievedEnrollments: enrollments,
        achievedRevenue:     revenue[0]?.total || 0
      };
    }));

    return res.json({ targets: enriched, month, year });
  } catch (err) {
    console.error("targetsDashboard:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ══ REPORTS ══════════════════════════════════════════════════════════════════
// ─────────────────────────────────────────────────────────────────────────────

exports.reportPipeline = async (req, res) => {
  try {
    const stages = await StudentLead.aggregate([
      { $match: { isArchived: false } },
      { $group: { _id: "$pipelineStage", count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);
    return res.json({ stages });
  } catch (err) {
    return res.status(500).json({ msg: "Server error" });
  }
};

exports.reportRevenue = async (req, res) => {
  try {
    const { months = 6 } = req.query;
    const since = new Date();
    since.setMonth(since.getMonth() - parseInt(months));

    const revenue = await Payment.aggregate([
      { $match: { isVoided: false, paidAt: { $gte: since } } },
      {
        $group: {
          _id: {
            year:  { $year:  "$paidAt" },
            month: { $month: "$paidAt" }
          },
          total: { $sum: "$amount" },
          count: { $sum: 1 }
        }
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } }
    ]);
    return res.json({ revenue });
  } catch (err) {
    return res.status(500).json({ msg: "Server error" });
  }
};

exports.reportConversion = async (req, res) => {
  try {
    const [totalLeads, contacted, demos, demoAttended, enrolled] = await Promise.all([
      StudentLead.countDocuments({ isArchived: false }),
      StudentLead.countDocuments({ pipelineStage: { $in: ["contacted","demo_scheduled","demo_attended","enrolled","completed"] } }),
      DemoSession.countDocuments({ cancelled: false }),
      DemoSession.countDocuments({ attended: true }),
      Enrollment.countDocuments()
    ]);
    return res.json({ totalLeads, contacted, demos, demoAttended, enrolled });
  } catch (err) {
    return res.status(500).json({ msg: "Server error" });
  }
};

exports.reportRepPerformance = async (req, res) => {
  try {
    const now   = new Date();
    const month = parseInt(req.query.month) || (now.getMonth() + 1);
    const year  = parseInt(req.query.year)  || now.getFullYear();
    const start = new Date(year, month - 1, 1);
    const end   = new Date(year, month, 0, 23, 59, 59);

    const [leadsByRep, enrollsByRep, revByRep] = await Promise.all([
      StudentLead.aggregate([
        { $match: { createdAt: { $gte: start, $lte: end }, isArchived: false } },
        { $group: { _id: "$assignedTo", leads: { $sum: 1 } } }
      ]),
      Enrollment.aggregate([
        { $match: { enrolledAt: { $gte: start, $lte: end } } },
        { $group: { _id: "$createdBy", enrollments: { $sum: 1 } } }
      ]),
      Payment.aggregate([
        { $match: { paidAt: { $gte: start, $lte: end }, isVoided: false } },
        { $group: { _id: "$createdBy", revenue: { $sum: "$amount" } } }
      ])
    ]);

    // merge by rep id
    const map = {};
    leadsByRep.forEach(r  => { if(r._id) { map[r._id] = { ...(map[r._id]||{}), leads: r.leads }; } });
    enrollsByRep.forEach(r => { if(r._id) { map[r._id] = { ...(map[r._id]||{}), enrollments: r.enrollments }; } });
    revByRep.forEach(r    => { if(r._id) { map[r._id] = { ...(map[r._id]||{}), revenue: r.revenue }; } });

    const User = require("../models/user");
    const userIds = Object.keys(map).filter(validId);
    const users   = await User.find({ _id: { $in: userIds } }, "name email");
    const userMap = Object.fromEntries(users.map(u => [u._id.toString(), u]));

    const result = Object.entries(map).map(([id, data]) => ({
      user: userMap[id] || { _id: id, name: "Unknown" },
      leads: data.leads || 0,
      enrollments: data.enrollments || 0,
      revenue: data.revenue || 0
    })).sort((a, b) => b.revenue - a.revenue);

    return res.json({ reps: result, month, year });
  } catch (err) {
    console.error("reportRepPerformance:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ══ COUPONS ══════════════════════════════════════════════════════════════════
// ─────────────────────────────────────────────────────────────────────────────
const Coupon = require("../models/Coupon");

// GET /api/sales/coupons
exports.listCoupons = async (req, res) => {
  try {
    const { type, active, search, page = 1, limit = 50 } = req.query;
    const q = {};
    if (type)   q.couponType = type;
    if (active !== undefined) q.isActive = active === "true";
    if (search) q.code = { $regex: search, $options: "i" };
    const skip  = (parseInt(page) - 1) * parseInt(limit);
    const total = await Coupon.countDocuments(q);
    const coupons = await Coupon.find(q)
      .sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit))
      .populate("applicableCourses", "title")
      .populate("createdBy", "name");
    return res.json({ coupons, total });
  } catch (err) { console.error("listCoupons:", err); return res.status(500).json({ msg: "Server error" }); }
};

// POST /api/sales/coupons
exports.createCoupon = async (req, res) => {
  try {
    if (!isSalesOrAdmin(req, res)) return;
    const coupon = await Coupon.create({ ...req.body, createdBy: req.user._id });
    return res.status(201).json(coupon);
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ msg: "Coupon code already exists" });
    console.error("createCoupon:", err); return res.status(500).json({ msg: "Server error" });
  }
};

// GET /api/sales/coupons/:id
exports.getCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id)
      .populate("applicableCourses", "title").populate("createdBy", "name");
    if (!coupon) return res.status(404).json({ msg: "Coupon not found" });
    return res.json(coupon);
  } catch (err) { console.error("getCoupon:", err); return res.status(500).json({ msg: "Server error" }); }
};

// PATCH /api/sales/coupons/:id
exports.updateCoupon = async (req, res) => {
  try {
    if (!isSalesOrAdmin(req, res)) return;
    const coupon = await Coupon.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!coupon) return res.status(404).json({ msg: "Coupon not found" });
    return res.json(coupon);
  } catch (err) { console.error("updateCoupon:", err); return res.status(500).json({ msg: "Server error" }); }
};

// DELETE /api/sales/coupons/:id  (soft: deactivate)
exports.deleteCoupon = async (req, res) => {
  try {
    if (!isSalesOrAdmin(req, res)) return;
    await Coupon.findByIdAndUpdate(req.params.id, { isActive: false });
    return res.json({ msg: "Coupon deactivated" });
  } catch (err) { console.error("deleteCoupon:", err); return res.status(500).json({ msg: "Server error" }); }
};

// POST /api/sales/coupons/validate  { code, courseId, fee }
exports.validateCoupon = async (req, res) => {
  try {
    const { code, courseId, fee } = req.body;
    if (!code || !fee) return res.status(400).json({ msg: "code and fee are required" });
    const coupon = await Coupon.findOne({ code: code.toUpperCase().trim() });
    if (!coupon) return res.status(404).json({ valid: false, msg: "Invalid coupon code" });

    const now = new Date();
    if (!coupon.isActive) return res.status(400).json({ valid: false, msg: "Coupon is inactive" });
    if (coupon.validTill && now > coupon.validTill) return res.status(400).json({ valid: false, msg: "Coupon has expired" });
    if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses)
      return res.status(400).json({ valid: false, msg: "Coupon usage limit reached" });
    if (fee < coupon.minOrderValue)
      return res.status(400).json({ valid: false, msg: `Minimum order value ₹${coupon.minOrderValue} required` });
    if (coupon.applicableCourses.length > 0 && courseId) {
      const ok = coupon.applicableCourses.map(c => c.toString()).includes(courseId.toString());
      if (!ok) return res.status(400).json({ valid: false, msg: "Coupon not valid for this course" });
    }

    const discount = coupon.calcDiscount(fee);
    const finalFee = Math.max(0, fee - discount);
    return res.json({ valid: true, coupon, discount, finalFee });
  } catch (err) { console.error("validateCoupon:", err); return res.status(500).json({ msg: "Server error" }); }
};

// ─────────────────────────────────────────────────────────────────────────────
// ══ COMMUNICATION LOGS ═══════════════════════════════════════════════════════
// ─────────────────────────────────────────────────────────────────────────────
const CommLog = require("../models/CommLog");

// GET /api/sales/commlogs?lead=id
exports.listCommLogs = async (req, res) => {
  try {
    const { lead, type, page = 1, limit = 100 } = req.query;
    const q = {};
    if (lead && validId(lead)) q.lead = lead;
    if (type) q.type = type;
    const skip  = (parseInt(page) - 1) * parseInt(limit);
    const total = await CommLog.countDocuments(q);
    const logs  = await CommLog.find(q)
      .sort({ loggedAt: -1 }).skip(skip).limit(parseInt(limit))
      .populate("createdBy", "name");
    return res.json({ logs, total });
  } catch (err) { console.error("listCommLogs:", err); return res.status(500).json({ msg: "Server error" }); }
};

// POST /api/sales/commlogs
exports.createCommLog = async (req, res) => {
  try {
    const log = await CommLog.create({ ...req.body, createdBy: req.user._id });
    // Update lead's lastContactedAt
    if (log.lead) {
      await StudentLead.findByIdAndUpdate(log.lead, { lastContactedAt: log.loggedAt });
    }
    return res.status(201).json(log);
  } catch (err) { console.error("createCommLog:", err); return res.status(500).json({ msg: "Server error" }); }
};

// PATCH /api/sales/commlogs/:id
exports.updateCommLog = async (req, res) => {
  try {
    const log = await CommLog.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!log) return res.status(404).json({ msg: "Log not found" });
    return res.json(log);
  } catch (err) { console.error("updateCommLog:", err); return res.status(500).json({ msg: "Server error" }); }
};

// DELETE /api/sales/commlogs/:id
exports.deleteCommLog = async (req, res) => {
  try {
    await CommLog.findByIdAndDelete(req.params.id);
    return res.json({ msg: "Deleted" });
  } catch (err) { console.error("deleteCommLog:", err); return res.status(500).json({ msg: "Server error" }); }
};

// ─────────────────────────────────────────────────────────────────────────────
// ══ REFERRALS ════════════════════════════════════════════════════════════════
// ─────────────────────────────────────────────────────────────────────────────
const Referral = require("../models/Referral");

// GET /api/sales/referrals
exports.listReferrals = async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const q = {};
    if (status) q.status = status;
    const skip  = (parseInt(page) - 1) * parseInt(limit);
    const total = await Referral.countDocuments(q);
    const referrals = await Referral.find(q)
      .sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit))
      .populate("referredBy",   "fullName phone")
      .populate("referredLead", "fullName phone pipelineStage")
      .populate("enrollment",   "enrolledAt totalFee feePaid")
      .populate("createdBy",    "name");
    return res.json({ referrals, total });
  } catch (err) { console.error("listReferrals:", err); return res.status(500).json({ msg: "Server error" }); }
};

// POST /api/sales/referrals
exports.createReferral = async (req, res) => {
  try {
    const referral = await Referral.create({ ...req.body, createdBy: req.user._id });
    return res.status(201).json(referral);
  } catch (err) { console.error("createReferral:", err); return res.status(500).json({ msg: "Server error" }); }
};

// GET /api/sales/referrals/:id
exports.getReferral = async (req, res) => {
  try {
    const ref = await Referral.findById(req.params.id)
      .populate("referredBy", "fullName phone")
      .populate("referredLead", "fullName phone pipelineStage")
      .populate("enrollment", "enrolledAt totalFee feePaid");
    if (!ref) return res.status(404).json({ msg: "Referral not found" });
    return res.json(ref);
  } catch (err) { console.error("getReferral:", err); return res.status(500).json({ msg: "Server error" }); }
};

// PATCH /api/sales/referrals/:id
exports.updateReferral = async (req, res) => {
  try {
    const ref = await Referral.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!ref) return res.status(404).json({ msg: "Referral not found" });
    return res.json(ref);
  } catch (err) { console.error("updateReferral:", err); return res.status(500).json({ msg: "Server error" }); }
};

// DELETE /api/sales/referrals/:id
exports.deleteReferral = async (req, res) => {
  try {
    await Referral.findByIdAndDelete(req.params.id);
    return res.json({ msg: "Deleted" });
  } catch (err) { console.error("deleteReferral:", err); return res.status(500).json({ msg: "Server error" }); }
};

// PATCH /api/sales/referrals/:id/pay  — mark incentive as paid
exports.markIncentivePaid = async (req, res) => {
  try {
    if (!isSalesOrAdmin(req, res)) return;
    const ref = await Referral.findByIdAndUpdate(
      req.params.id,
      { incentivePaid: true, paidAt: new Date(), status: "paid" },
      { new: true }
    );
    if (!ref) return res.status(404).json({ msg: "Referral not found" });
    return res.json(ref);
  } catch (err) { console.error("markIncentivePaid:", err); return res.status(500).json({ msg: "Server error" }); }
};

// ─────────────────────────────────────────────────────────────────────────────
// ══ SALES REP STATS ══════════════════════════════════════════════════════════
// ─────────────────────────────────────────────────────────────────────────────
const User = require("../models/user");

// GET /api/sales/reps/stats?month=&year=
// GET /api/sales/reps — sales reps for assignment dropdowns
exports.listReps = async (req, res) => {
  try {
    const reps = await User.find(SALES_REP_FILTER, "name email role department").sort({ name: 1 });
    return res.json({ reps });
  } catch (err) {
    console.error("listReps:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

exports.repStats = async (req, res) => {
  try {
    const month = parseInt(req.query.month) || new Date().getMonth() + 1;
    const year  = parseInt(req.query.year)  || new Date().getFullYear();
    const start = new Date(year, month - 1, 1);
    const end   = new Date(year, month, 1);

    // All sales users
    const reps = await User.find(SALES_REP_FILTER, "name email role department");

    // Aggregate leads per rep this month
    const leadAgg = await StudentLead.aggregate([
      { $match: { createdAt: { $gte: start, $lt: end }, isArchived: false } },
      { $group: { _id: "$assignedTo", leads: { $sum: 1 } } }
    ]);

    // Aggregate enrollments + revenue per rep this month
    const enrollAgg = await Enrollment.aggregate([
      { $match: { enrolledAt: { $gte: start, $lt: end } } },
      { $lookup: { from: "studentleads", localField: "lead", foreignField: "_id", as: "ld" } },
      { $unwind: { path: "$ld", preserveNullAndEmptyArrays: true } },
      { $group: { _id: "$ld.assignedTo", enrollments: { $sum: 1 }, revenue: { $sum: "$feePaid" } } }
    ]);

    // Demo stats per rep
    const DemoSession = require("../models/DemoSession");
    const demoAgg = await DemoSession.aggregate([
      { $match: { scheduledAt: { $gte: start, $lt: end }, cancelled: false } },
      { $group: { _id: "$createdBy", demos: { $sum: 1 },
        attended: { $sum: { $cond: ["$attended", 1, 0] } } } }
    ]);

    // Merge into a map
    const map = {};
    for (const rep of reps) {
      map[rep._id.toString()] = { rep, leads: 0, demos: 0, attended: 0, enrollments: 0, revenue: 0, target: null };
    }
    for (const r of leadAgg)   if (r._id && map[r._id.toString()]) map[r._id.toString()].leads = r.leads;
    for (const r of enrollAgg) if (r._id && map[r._id.toString()]) { map[r._id.toString()].enrollments = r.enrollments; map[r._id.toString()].revenue = r.revenue; }
    for (const r of demoAgg)   if (r._id && map[r._id.toString()]) { map[r._id.toString()].demos = r.demos; map[r._id.toString()].attended = r.attended; }

    // Pull targets
    const targets = await SalesTarget.find({ month, year, user: { $in: reps.map(r => r._id) } });
    for (const t of targets) if (map[t.user.toString()]) map[t.user.toString()].target = t;

    const result = Object.values(map).sort((a, b) => b.revenue - a.revenue);
    return res.json({ reps: result, month, year });
  } catch (err) { console.error("repStats:", err); return res.status(500).json({ msg: "Server error" }); }
};

// ─────────────────────────────────────────────────────────────────────────────
// ══ LEAD SCORING ═════════════════════════════════════════════════════════════
// ─────────────────────────────────────────────────────────────────────────────
const { scoreLeadAndSave, scoreAllLeads: batchScore } = require("../utils/leadScoring");

// POST /api/sales/leads/:id/score
exports.scoreLead = async (req, res) => {
  try {
    const result = await scoreLeadAndSave(req.params.id);
    if (!result) return res.status(404).json({ msg: "Lead not found" });
    return res.json({ score: result.score, breakdown: result.breakdown });
  } catch (err) {
    console.error("scoreLead:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// POST /api/sales/leads/score-all  (admin / super_admin only)
exports.scoreAllLeads = async (req, res) => {
  try {
    if (!["admin","super_admin"].includes(req.user?.role))
      return res.status(403).json({ msg: "Admin only" });
    const result = await batchScore();
    return res.json(result);
  } catch (err) {
    console.error("scoreAllLeads:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ══ LEADGEN ══════════════════════════════════════════════════════════════════
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/sales/leadgen/my-leads — leads created by this leadgen user
exports.leadgenMyLeads = async (req, res) => {
  try {
    if (req.user?.role !== "leadgen" && !["super_admin","admin","sales","hr"].includes(req.user?.role))
      return res.status(403).json({ msg: "Access denied" });

    const { search, page = 1, limit = 100 } = req.query;
    const q = { createdBy: req.user.id, isArchived: false };
    if (search) q.$or = [
      { fullName: { $regex: search, $options: "i" } },
      { phone:    { $regex: search, $options: "i" } },
      { email:    { $regex: search, $options: "i" } }
    ];
    const skip  = (parseInt(page) - 1) * parseInt(limit);
    const total = await StudentLead.countDocuments(q);
    const leads = await StudentLead.find(q).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit));
    return res.json({ leads, total });
  } catch (err) {
    console.error("leadgenMyLeads:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// GET /api/sales/leads/recent-leadgen — recent leads captured by the LeadGen team,
// surfaced inside the Sales pipeline. Supports ?days=7 (window) and ?limit=50.
exports.recentLeadgenLeads = async (req, res) => {
  try {
    if (!isSalesOrAdmin(req, res)) return;

    const days  = Math.min(90, Math.max(1, parseInt(req.query.days)  || 7));
    const limit  = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
    const since  = new Date(); since.setDate(since.getDate() - days); since.setHours(0, 0, 0, 0);

    // Match anything explicitly tagged "leadgen" OR created by a leadgen-role user
    const leadgenUsers = await User.find({ role: "leadgen" }, "_id").lean();
    const leadgenIds   = leadgenUsers.map(u => u._id);

    const q = {
      isArchived: false,
      createdAt:  { $gte: since },
      $or: [
        { origin: "leadgen" },
        { createdBy: { $in: leadgenIds } }
      ]
    };

    const [leads, total, totalAllTime] = await Promise.all([
      StudentLead.find(q)
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate("courseInterest", "title")
        .lean(),
      StudentLead.countDocuments(q),
      StudentLead.countDocuments({
        isArchived: false,
        $or: [{ origin: "leadgen" }, { createdBy: { $in: leadgenIds } }]
      })
    ]);

    return res.json({ leads, total, totalAllTime, days });
  } catch (err) {
    console.error("recentLeadgenLeads:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// GET /api/sales/leadgen/stats
exports.leadgenStats = async (req, res) => {
  try {
    if (req.user?.role !== "leadgen" && !["super_admin","admin","sales","hr"].includes(req.user?.role))
      return res.status(403).json({ msg: "Access denied" });

    const userId = req.user.id;
    const today  = new Date(); today.setHours(0,0,0,0);
    const week   = new Date(); week.setDate(week.getDate() - 7); week.setHours(0,0,0,0);

    const [total, todayCount, weekCount] = await Promise.all([
      StudentLead.countDocuments({ createdBy: userId, isArchived: false }),
      StudentLead.countDocuments({ createdBy: userId, isArchived: false, createdAt: { $gte: today } }),
      StudentLead.countDocuments({ createdBy: userId, isArchived: false, createdAt: { $gte: week } })
    ]);

    return res.json({ total, today: todayCount, thisWeek: weekCount });
  } catch (err) {
    console.error("leadgenStats:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// ── BULK LEAD ALLOCATION ─────────────────────────────────────────────────────
// Assign a set of selected leads to one rep (or unassign with rep=null).
exports.bulkAssign = async (req, res) => {
  try {
    if (!isSalesOrAdmin(req, res)) return;
    const ids = Array.isArray(req.body.leadIds) ? req.body.leadIds.filter(validId) : [];
    if (!ids.length) return res.status(400).json({ msg: "No leads selected" });
    const rep = req.body.rep && validId(req.body.rep) ? req.body.rep : null;
    const r = await StudentLead.updateMany({ _id: { $in: ids } }, { $set: { assignedTo: rep } });
    return res.json({ msg: `Assigned ${r.modifiedCount} lead(s)`, modified: r.modifiedCount });
  } catch (e) { console.error("bulkAssign:", e); return res.status(500).json({ msg: "Server error" }); }
};

// Evenly distribute UNASSIGNED, non-archived leads across all sales employees (round-robin).
exports.autoDistribute = async (req, res) => {
  try {
    if (!isSalesOrAdmin(req, res)) return;
    const User = require("../models/user");
    const reps = await User.find(SALES_REP_FILTER).select("_id name").lean();
    if (!reps.length) return res.status(400).json({ msg: "No sales employees found. Create sales logins first." });
    const leads = await StudentLead.find({ isArchived: false, $or: [{ assignedTo: null }, { assignedTo: { $exists: false } }] }).select("_id").lean();
    if (!leads.length) return res.json({ msg: "No unassigned leads to distribute.", distributed: 0, reps: reps.length });
    const ops = leads.map((l, i) => ({ updateOne: { filter: { _id: l._id }, update: { $set: { assignedTo: reps[i % reps.length]._id } } } }));
    await StudentLead.bulkWrite(ops);
    return res.json({ msg: `Distributed ${leads.length} leads across ${reps.length} reps`, distributed: leads.length, reps: reps.length });
  } catch (e) { console.error("autoDistribute:", e); return res.status(500).json({ msg: "Server error" }); }
};
