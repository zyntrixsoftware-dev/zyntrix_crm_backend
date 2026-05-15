const mongoose = require("mongoose");

const roundSchema = new mongoose.Schema({
  roundName:   { type: String, required: true },   // e.g. "HR Round", "Technical Round"
  status:      { type: String, enum: ["pending", "passed", "failed"], default: "pending" },
  remarks:     { type: String, default: "" },
  conductedBy: { type: String, default: "" },      // interviewer name
  conductedAt: { type: Date }
}, { _id: false });

const interviewSchema = new mongoose.Schema({
  // Candidate info
  candidateName:  { type: String, required: true },
  candidateEmail: { type: String, required: true },
  candidatePhone: { type: String, default: "" },
  appliedFor:     { type: String, required: true },   // Job role / position
  department:     { type: String, default: "" },

  // Interview rounds
  rounds: { type: [roundSchema], default: [] },

  // Overall result — auto-derived or manually set
  overallStatus: {
    type: String,
    enum: ["in_progress", "passed", "failed", "on_hold"],
    default: "in_progress"
  },

  // Offer letter link (set once offer is created)
  offerId: { type: mongoose.Schema.Types.ObjectId, ref: "OfferLetter", default: null },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  notes:     { type: String, default: "" }

}, { timestamps: true });

module.exports = mongoose.model("Interview", interviewSchema);
