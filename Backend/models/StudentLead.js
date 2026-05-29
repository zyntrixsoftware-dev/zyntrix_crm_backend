const mongoose = require("mongoose");

const PIPELINE_STAGES = [
  "new_lead",
  "contacted",
  "demo_scheduled",
  "demo_attended",
  "enrolled",
  "dropped",
  "completed"
];

const SOURCES = [
  "website", "social_media", "referral",
  "cold_call", "walk_in", "other"
];

const EDUCATION_LEVELS = [
  "high_school", "undergraduate", "graduate", "working_professional"
];

const stageHistorySchema = new mongoose.Schema(
  {
    from:      { type: String, default: "" },
    to:        { type: String, default: "" },
    changedAt: { type: Date,   default: Date.now },
    note:      { type: String, default: "" },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
  },
  { _id: false }
);

const studentLeadSchema = new mongoose.Schema(
  {
    fullName:       { type: String, required: true, trim: true },
    email:          { type: String, lowercase: true, trim: true, default: "" },
    phone:          { type: String, default: "" },
    city:           { type: String, default: "" },
    educationLevel: { type: String, enum: EDUCATION_LEVELS, default: "undergraduate" },
    courseInterest: { type: mongoose.Schema.Types.ObjectId, ref: "Course", default: null },
    budget:         { type: Number, default: 0 },

    pipelineStage: {
      type:    String,
      enum:    PIPELINE_STAGES,
      default: "new_lead"
    },
    stageHistory: { type: [stageHistorySchema], default: () => [] },

    source:     { type: String, enum: SOURCES, default: "other" },

    // Where the lead entered the system from.
    // "leadgen" → captured by the LeadGen panel/team
    // "sales"   → added manually inside the Sales system
    // "import"  → bulk-imported from Excel/CSV
    origin:     { type: String, enum: ["leadgen", "sales", "import", "other"], default: "sales" },

    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    lastContactedAt: { type: Date, default: null },
    followUpDate:    { type: Date, default: null },

    notes: { type: String, default: "" },
    tags:  { type: [String], default: [] },

    // Link to enrollment (set when stage → enrolled)
    enrollmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Enrollment", default: null },

    // Lead Scoring (auto-computed by leadScoring.js)
    score:          { type: Number, default: 0, min: 0, max: 100 },
    scoreBreakdown: {
      source:     { type: Number, default: 0 },
      budget:     { type: Number, default: 0 },
      stage:      { type: Number, default: 0 },
      engagement: { type: Number, default: 0 }
    },
    scoredAt:   { type: Date, default: null },

    isArchived: { type: Boolean, default: false },
    createdBy:  { type: mongoose.Schema.Types.ObjectId, ref: "User" }
  },
  { timestamps: true }
);

studentLeadSchema.index({ pipelineStage: 1, createdAt: -1 });
studentLeadSchema.index({ email: 1 });
studentLeadSchema.index({ assignedTo: 1 });
studentLeadSchema.index({ followUpDate: 1 });
studentLeadSchema.index({ isArchived: 1 });
studentLeadSchema.index({ score: -1 });  // for sorting by hottest leads
studentLeadSchema.index({ origin: 1, createdAt: -1 });  // for "recent from LeadGen" feed

studentLeadSchema.statics.PIPELINE_STAGES = PIPELINE_STAGES;
studentLeadSchema.statics.SOURCES         = SOURCES;
studentLeadSchema.statics.EDUCATION_LEVELS = EDUCATION_LEVELS;

module.exports = mongoose.model("StudentLead", studentLeadSchema);
