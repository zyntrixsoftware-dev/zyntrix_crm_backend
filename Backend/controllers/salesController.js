const mongoose   = require("mongoose");
const StudentLead = require("../models/StudentLead");
const Course      = require("../models/Course");
const Batch       = require("../models/Batch");
const DemoSession = require("../models/DemoSession");
const Enrollment  = require("../models/Enrollment");
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
    if (!isSalesOrAdmin(req, res)) return;

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

    const lead = await StudentLead.findById(req.params.id);
    if (!lead) return res.status(404).json({ msg: "Lead not found" });

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
    const { category, active, search } = req.query;
    const q = {};
    if (category) q.category = category;
    if (active !== undefined) q.isActive = active !== "false";
    if (search) q.$or = [
      { title:       { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } }
    ];
    const courses = await Course.find(q).sort({ createdAt: -1 });
    // attach batch counts
    const ids = courses.map(c => c._id);
    const batchCounts = await Batch.aggregate([
      { $match: { course: { $in: ids }, status: { $ne: "cancelled" } } },
      { $group: { _id: "$course", count: { $sum: 1 } } }
    ]);
    const countMap = Object.fromEntries(batchCounts.map(b => [b._id.toString(), b.count]));
    const result = courses.map(c => ({ ...c.toObject(), batchCount: countMap[c._id.toString()] || 0 }));
    return res.json({ courses: result });
  } catch (err) {
    console.error("listCourses:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

exports.createCourse = async (req, res) => {
  try {
    if (!isSalesOrAdmin(req, res)) return;
    const course = await Course.create({ ...req.body, createdBy: req.user.id });
    return res.status(201).json({ course });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ msg: "Course slug already exists" });
    console.error("createCourse:", err);
    return res.status(500).json({ msg: "Server error" });
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

    return res.status(201).json({ demo: populated });
  } catch (err) {
    console.error("createDemo:", err);
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
      .populate("lead",   "fullName email phone")
      .populate("batch",  "batchCode startDate")
      .populate("course", "title");
    return res.json({ enrollments });
  } catch (err) {
    return res.status(500).json({ msg: "Server error" });
  }
};

exports.createEnrollment = async (req, res) => {
  try {
    if (!isSalesOrAdmin(req, res)) return;

    const batch = await Batch.findById(req.body.batch);
    if (!batch) return res.status(404).json({ msg: "Batch not found" });
    if (batch.seatsAvailable <= 0) return res.status(400).json({ msg: "Batch is full" });

    const enrollment = await Enrollment.create({ ...req.body, createdBy: req.user.id });

    // increment seats
    batch.seatsBooked += 1;
    await batch.save();

    // move lead to enrolled
    const lead = await StudentLead.findById(req.body.lead);
    if (lead) {
      lead.stageHistory.push({ from: lead.pipelineStage, to: "enrolled", changedBy: req.user.id });
      lead.pipelineStage = "enrolled";
      lead.enrollmentId  = enrollment._id;
      await lead.save();

      // enrollment confirmation email
      const course = await Course.findById(req.body.course);
      emails().notifyEnrollmentConfirmation(enrollment, lead, course, batch)
        .catch(e => console.warn(e.message));
    }

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
        StudentLead.countDocuments({ createdBy: uid, createdAt: { $gte: startOfMonth, $lte: endOfMonth } }),
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
exports.repStats = async (req, res) => {
  try {
    const month = parseInt(req.query.month) || new Date().getMonth() + 1;
    const year  = parseInt(req.query.year)  || new Date().getFullYear();
    const start = new Date(year, month - 1, 1);
    const end   = new Date(year, month, 1);

    // All sales users
    const reps = await User.find({ role: { $in: ["sales", "admin", "super_admin"] } }, "name email role");

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
      { $match: { scheduledAt: { $gte: start, $lt: end } } },
      { $group: { _id: "$conductor", demos: { $sum: 1 },
        attended: { $sum: { $cond: [{ $ne: ["$outcome", "no_show"] }, 1, 0] } } } }
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
