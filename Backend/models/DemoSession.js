const mongoose = require("mongoose");

const demoSessionSchema = new mongoose.Schema(
  {
    lead:         { type: mongoose.Schema.Types.ObjectId, ref: "StudentLead", required: true },
    course:       { type: mongoose.Schema.Types.ObjectId, ref: "Course",      default: null },
    scheduledAt:  { type: Date, required: true },
    mode:         { type: String, enum: ["online", "offline"], default: "online" },
    meetingLink:  { type: String, default: "" },
    venue:        { type: String, default: "" },
    conductedBy:  { type: String, default: "" },
    attended:     { type: Boolean, default: false },
    attendedAt:   { type: Date,    default: null },
    feedback:     { type: String,  default: "" },
    rating:       { type: Number,  min: 1, max: 5, default: null },
    followUpDone: { type: Boolean, default: false },
    reminderSent: { type: Boolean, default: false },
    cancelled:    { type: Boolean, default: false },
    cancelReason: { type: String,  default: "" },
    createdBy:    { type: mongoose.Schema.Types.ObjectId, ref: "User" }
  },
  { timestamps: true }
);

demoSessionSchema.index({ lead: 1 });
demoSessionSchema.index({ scheduledAt: 1 });
demoSessionSchema.index({ attended: 1 });

module.exports = mongoose.model("DemoSession", demoSessionSchema);
