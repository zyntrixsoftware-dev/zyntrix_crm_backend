const mongoose = require("mongoose");

const TYPES    = ["call", "whatsapp", "email", "meeting", "other"];
const OUTCOMES = [
  "no_answer", "callback", "interested",
  "not_interested", "demo_booked", "enrolled", "dropped"
];

const followUpSchema = new mongoose.Schema(
  {
    lead:          { type: mongoose.Schema.Types.ObjectId, ref: "StudentLead", required: true },
    scheduledAt:   { type: Date, required: true },
    completedAt:   { type: Date, default: null },
    type:          { type: String, enum: TYPES, default: "call" },
    outcome:       { type: String, enum: OUTCOMES, default: null },
    notes:         { type: String, default: "" },
    nextFollowUp:  { type: Date,   default: null },
    isCompleted:   { type: Boolean, default: false },
    createdBy:     { type: mongoose.Schema.Types.ObjectId, ref: "User" }
  },
  { timestamps: true }
);

followUpSchema.index({ lead: 1 });
followUpSchema.index({ scheduledAt: 1, isCompleted: 1 });
followUpSchema.index({ createdBy: 1, isCompleted: 1 });

followUpSchema.statics.TYPES    = TYPES;
followUpSchema.statics.OUTCOMES = OUTCOMES;

module.exports = mongoose.model("FollowUp", followUpSchema);
