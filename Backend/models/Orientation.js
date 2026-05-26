const mongoose = require("mongoose");

// ─────────────────────────────────────────────────────────────────────────────
// ORIENTATION
//
// One record per onboarded candidate. Auto-created when HR marks a candidate's
// onboarding status as "onboarded". Tracks mentor assignment, session enrolment,
// new-joinee task checklist, and invite email status.
//
// Status flow:
//   pending → invited → in_progress → completed
// ─────────────────────────────────────────────────────────────────────────────

const taskItemSchema = new mongoose.Schema(
  {
    key:      { type: String, default: "" },
    label:    { type: String, default: "" },
    category: { type: String, default: "General" }, // HR / IT / Compliance / Culture
    done:     { type: Boolean, default: false },
    doneAt:   { type: Date,    default: null },
    note:     { type: String,  default: "" }
  },
  { _id: true }
);

const orientationSchema = new mongoose.Schema(
  {
    // ── Upstream link ──────────────────────────────────────────────────────
    onboardingId:   { type: mongoose.Schema.Types.ObjectId, ref: "Onboarding", default: null },

    // ── Candidate identity ─────────────────────────────────────────────────
    candidateEmail: { type: String, required: true, lowercase: true, trim: true },
    candidateName:  { type: String, default: "" },
    position:       { type: String, default: "" },
    department:     { type: String, default: "" },
    joiningDate:    { type: String, default: "" }, // YYYY-MM-DD

    // ── Mentor / buddy ─────────────────────────────────────────────────────
    mentorId:    { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    mentorName:  { type: String, default: "" },
    mentorEmail: { type: String, default: "" },

    // ── Session enrolment ──────────────────────────────────────────────────
    sessionIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "OrientationSession" }],

    // ── Status ─────────────────────────────────────────────────────────────
    orientationStatus: {
      type:    String,
      enum:    ["pending", "invited", "in_progress", "completed"],
      default: "pending"
    },
    inviteSentAt: { type: Date, default: null },
    completedAt:  { type: Date, default: null },

    // ── New-joinee task checklist ──────────────────────────────────────────
    // Standard edtech company orientation checklist. HR ticks items off as the
    // new joinee completes each step during their first week.
    taskChecklist: {
      type: [taskItemSchema],
      default: () => [
        { key: "read_handbook",    label: "Read the Company Handbook",                category: "HR" },
        { key: "sign_nda",         label: "Sign NDA & Employment Agreement",          category: "HR" },
        { key: "posh_training",    label: "Complete POSH & Anti-Harassment Module",   category: "Compliance" },
        { key: "it_security",      label: "Complete IT Security Training",            category: "Compliance" },
        { key: "email_setup",      label: "Set up company email & signature",         category: "IT" },
        { key: "slack_channels",   label: "Join Slack & communication channels",      category: "IT" },
        { key: "lms_access",       label: "Get LMS / internal portal access",         category: "IT" },
        { key: "meet_mentor",      label: "Meet your assigned mentor/buddy",          category: "Culture" },
        { key: "attend_sessions",  label: "Attend all mandatory orientation sessions",category: "Culture" },
        { key: "hr_checkin",       label: "Complete first-week HR check-in",          category: "HR" },
      ]
    },

    // ── Notes ──────────────────────────────────────────────────────────────
    notes:     { type: String, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
  },
  { timestamps: true }
);

orientationSchema.index({ candidateEmail: 1 });
orientationSchema.index({ orientationStatus: 1, createdAt: -1 });
orientationSchema.index({ onboardingId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("Orientation", orientationSchema);
