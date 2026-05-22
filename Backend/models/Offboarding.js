const mongoose = require("mongoose");

// ─────────────────────────────────────────────────────────────────────────────
// OFFBOARDING
//
// One case per departing employee. The `separationType` drives the rest of the
// flow (which checklist items are seeded, when access is cut, default rehire
// eligibility, visibility, and the settlement stance). The per-type templates
// live in offboardingController.js.
//
// Status workflow:  initiated → in_progress → cleared → completed
//                   (any state) → cancelled
//
// On "complete" the controller flips the linked User's `active` flag (login
// block) and `employeeStatus`.
// ─────────────────────────────────────────────────────────────────────────────

const SEPARATION_TYPES = [
  "resignation",        // voluntary
  "termination_cause",  // involuntary, misconduct
  "layoff",             // involuntary, no fault / redundancy
  "contract_end",       // fixed-term / internship completion
  "retirement",
  "absconding",         // no-show / unexplained absence
  "compassionate"       // death in service / medical
];

const checklistItemSchema = new mongoose.Schema(
  {
    key:    { type: String, default: "" },   // stable id, e.g. "it_revoke_access"
    label:  { type: String, default: "" },   // human-readable task
    dept:   { type: String, default: "" },   // IT / HR / Finance / Admin / Manager / Legal
    done:   { type: Boolean, default: false },
    doneAt: { type: Date,    default: null },
    note:   { type: String,  default: "" }
  },
  { _id: true }
);

const assetSchema = new mongoose.Schema(
  {
    name:       { type: String,  default: "" },   // "Laptop — Dell XPS 13"
    returned:   { type: Boolean, default: false },
    returnedAt: { type: Date,    default: null },
    note:       { type: String,  default: "" }
  },
  { _id: true }
);

const offboardingSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    // Denormalized snapshot so the case still reads correctly even if the
    // user record changes or is later removed.
    employeeName:  { type: String, default: "" },
    employeeEmail: { type: String, default: "" },
    department:    { type: String, default: "" },
    designation:   { type: String, default: "" },

    separationType: { type: String, enum: SEPARATION_TYPES, required: true },
    reason:         { type: String, default: "" },

    noticeDate:     { type: String, default: "" },   // "YYYY-MM-DD"
    lastWorkingDay: { type: String, default: "" },   // "YYYY-MM-DD"

    status: {
      type: String,
      enum: ["initiated", "in_progress", "cleared", "completed", "cancelled"],
      default: "initiated"
    },

    checklist: [checklistItemSchema],
    assets:    [assetSchema],

    exitInterview: {
      scheduledFor:     { type: String,  default: "" },   // "YYYY-MM-DD"
      completed:        { type: Boolean, default: false },
      reasonForLeaving: { type: String,  default: "" },
      rating:           { type: Number,  default: null },  // 1–5
      feedback:         { type: String,  default: "" }
    },

    settlement: {
      status:          { type: String, enum: ["pending", "processing", "paid", "withheld"], default: "pending" },
      leaveEncashment: { type: Boolean, default: false },
      note:            { type: String,  default: "" }
    },

    documents: {
      relievingLetter:       { type: Boolean, default: false },
      experienceCertificate: { type: Boolean, default: false },
      noDuesCertificate:     { type: Boolean, default: false }
    },

    // How and when system access is removed for this case.
    accessCutoff:   { type: String, enum: ["immediate", "last_working_day"], default: "last_working_day" },
    rehireEligible: { type: Boolean, default: true },
    visibility:     { type: String, enum: ["standard", "restricted"], default: "standard" },

    completedAt: { type: Date },
    cancelledAt: { type: Date },
    createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: "User" }
  },
  { timestamps: true }
);

offboardingSchema.index({ status: 1, createdAt: -1 });
offboardingSchema.index({ userId: 1 });

offboardingSchema.statics.SEPARATION_TYPES = SEPARATION_TYPES;

module.exports = mongoose.model("Offboarding", offboardingSchema);
