const mongoose = require("mongoose");

// Persistent record of which candidate addresses have already received the
// "Application Received" email. This collection is intentionally NOT wiped by
// the bulk-import replace step, so re-importing the same roster will never
// re-email a candidate who was already notified.
const applicationEmailLogSchema = new mongoose.Schema(
  {
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    email:     { type: String, required: true, lowercase: true, trim: true },
    sentAt:    { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// One log entry per (HR user, candidate email) pair.
applicationEmailLogSchema.index({ createdBy: 1, email: 1 }, { unique: true });

module.exports = mongoose.model("ApplicationEmailLog", applicationEmailLogSchema);
