const mongoose = require("mongoose");

/**
 * Each round is a fixed 50-minute interview slot with a qualified / not-qualified outcome.
 * status:
 *   - pending        : not yet conducted (default)
 *   - qualified      : candidate passed this round
 *   - not_qualified  : candidate failed this round
 */
const roundSchema = new mongoose.Schema({
  status:       { type: String, enum: ["pending", "qualified", "not_qualified"], default: "pending" },
  scheduledAt:  { type: Date },                          // when this round is scheduled
  durationMin:  { type: Number, default: 50 },           // fixed 50 min per spec
  interviewer:  { type: String, default: "" },
  remarks:      { type: String, default: "" },
  conductedAt:  { type: Date }
}, { _id: false });

const interviewSchema = new mongoose.Schema({
  // Link back to the imported candidate record (so we can un-shortlist later)
  candidateId: { type: mongoose.Schema.Types.ObjectId, ref: "Candidate", default: null },

  // Candidate info (copied from candidate doc for history)
  candidateName:  { type: String, required: true },
  candidateEmail: { type: String, required: true },
  candidatePhone: { type: String, default: "" },
  appliedFor:     { type: String, required: true },   // Job role / position
  department:     { type: String, default: "" },

  // ── Fixed 3 rounds (each 50 min, qualified / not_qualified) ──────────────
  round1: { type: roundSchema, default: () => ({}) },
  round2: { type: roundSchema, default: () => ({}) },
  round3: { type: roundSchema, default: () => ({}) },

  // HR notes on the candidate (shown in the shortlisted table)
  note:  { type: String, default: "" },

  // ── Offered flag — flips to true when HR decides to extend an offer ───────
  // Once true, the candidate appears on the Offer Letter page.
  offered:   { type: Boolean, default: false },
  offeredAt: { type: Date },
  offeredBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

  // ── Lifecycle email tracking (per-round + key milestones) ──
  shortlistEmailSentAt:    { type: Date, default: null },
  offerNotificationSentAt: { type: Date, default: null },
  round1NotifiedAt:        { type: Date, default: null },
  round2NotifiedAt:        { type: Date, default: null },
  round3NotifiedAt:        { type: Date, default: null },

  // Auto-derived from the 3 rounds (see deriveOverallStatus below)
  //   - in_progress : at least one round still pending and none failed
  //   - passed      : all 3 qualified
  //   - failed      : any round not_qualified
  //   - on_hold     : HR manual override
  overallStatus: {
    type: String,
    enum: ["in_progress", "passed", "failed", "on_hold"],
    default: "in_progress"
  },

  // Offer letter link (set once offer is created)
  offerId: { type: mongoose.Schema.Types.ObjectId, ref: "OfferLetter", default: null },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  notes:     { type: String, default: "" }   // legacy free-form notes (kept for back-compat)

}, { timestamps: true });

// ── Helper: derive overallStatus from the 3 rounds ────────────────────────────
interviewSchema.methods.deriveOverallStatus = function () {
  const rounds = [this.round1, this.round2, this.round3];

  if (rounds.some(r => r && r.status === "not_qualified")) {
    return "failed";
  }
  if (rounds.every(r => r && r.status === "qualified")) {
    return "passed";
  }
  return "in_progress";
};

module.exports = mongoose.model("Interview", interviewSchema);
