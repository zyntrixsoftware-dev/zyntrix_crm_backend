const mongoose = require("mongoose");

// ─────────────────────────────────────────────────────────────────────────────
// ORIENTATION SESSION
//
// Reusable session definitions that make up the orientation schedule.
// HR creates these once and enrols new-joinees into them.
// The full session list is included in the orientation invite email.
// ─────────────────────────────────────────────────────────────────────────────

const SESSION_TYPES = [
  "company_culture",
  "it_security",
  "hr_policies",
  "posh",
  "product_walkthrough",
  "department_specific",
  "custom"
];

const SESSION_TYPE_LABELS = {
  company_culture    : "Company Culture & Values",
  it_security        : "IT & Security",
  hr_policies        : "HR Policies & Benefits",
  posh               : "POSH & Compliance",
  product_walkthrough: "Product Walkthrough",
  department_specific: "Department Specific",
  custom             : "Custom"
};

const orientationSessionSchema = new mongoose.Schema(
  {
    title:         { type: String, required: true, trim: true },
    description:   { type: String, default: "" },
    sessionType:   { type: String, enum: SESSION_TYPES, default: "custom" },

    // Schedule
    scheduledDate: { type: String, default: "" },  // YYYY-MM-DD
    startTime:     { type: String, default: "" },  // "10:00"
    endTime:       { type: String, default: "" },  // "12:00"
    durationMin:   { type: Number, default: 60 },

    // Delivery
    mode: {
      type:    String,
      enum:    ["in_person", "online_zoom", "online_meet", "hybrid"],
      default: "in_person"
    },
    venue:       { type: String, default: "" }, // Hall name or meeting link
    facilitator: { type: String, default: "" },

    // Rules
    isMandatory: { type: Boolean, default: true },
    targetDept:  { type: String,  default: "" }, // blank = applies to all departments

    // Lifecycle
    status: {
      type:    String,
      enum:    ["upcoming", "completed", "cancelled"],
      default: "upcoming"
    },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
  },
  { timestamps: true }
);

orientationSessionSchema.statics.SESSION_TYPES       = SESSION_TYPES;
orientationSessionSchema.statics.SESSION_TYPE_LABELS = SESSION_TYPE_LABELS;

module.exports = mongoose.model("OrientationSession", orientationSessionSchema);
