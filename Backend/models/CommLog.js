const mongoose = require("mongoose");

const COMM_TYPES      = ["call", "whatsapp", "email", "sms", "meeting", "other"];
const COMM_DIRECTIONS = ["outbound", "inbound"];
const CALL_OUTCOMES   = ["connected", "not_answered", "busy", "wrong_number", "callback_requested", "not_applicable"];

const commLogSchema = new mongoose.Schema(
  {
    lead:      { type: mongoose.Schema.Types.ObjectId, ref: "StudentLead", required: true },
    type:      { type: String, enum: COMM_TYPES,      default: "call" },
    direction: { type: String, enum: COMM_DIRECTIONS, default: "outbound" },

    // For calls
    duration:    { type: Number, default: 0 },   // seconds
    callOutcome: { type: String, enum: CALL_OUTCOMES, default: "not_applicable" },

    summary:   { type: String, default: "" },     // what was discussed / message content
    nextAction:{ type: String, default: "" },     // follow-up note from this interaction
    loggedAt:  { type: Date,   default: Date.now },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
  },
  { timestamps: true }
);

commLogSchema.index({ lead: 1, loggedAt: -1 });
commLogSchema.index({ createdBy: 1, loggedAt: -1 });

commLogSchema.statics.COMM_TYPES      = COMM_TYPES;
commLogSchema.statics.COMM_DIRECTIONS = COMM_DIRECTIONS;
commLogSchema.statics.CALL_OUTCOMES   = CALL_OUTCOMES;

module.exports = mongoose.model("CommLog", commLogSchema);
