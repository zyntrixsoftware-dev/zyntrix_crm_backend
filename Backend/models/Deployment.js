const mongoose = require("mongoose");

// ─────────────────────────────────────────────────────────────────────────────
// DEPLOYMENT
//
// One record per new joinee who has been assigned to a team after completing
// their orientation. Links Orientation → DeploymentTeam.
//
// Status flow:
//   pending → deployed → (optionally) transferred / exited
// ─────────────────────────────────────────────────────────────────────────────

const deploymentSchema = new mongoose.Schema(
  {
    // ── Upstream links ─────────────────────────────────────────────────────
    orientationId: { type: mongoose.Schema.Types.ObjectId, ref: "Orientation", default: null },

    // ── Candidate identity (denormalised for quick reads) ──────────────────
    candidateEmail: { type: String, required: true, lowercase: true, trim: true },
    candidateName:  { type: String, default: "" },
    employeeId:     { type: String, default: "" },   // assigned at deployment
    position:       { type: String, default: "" },   // original position applied for
    department:     { type: String, default: "" },
    joiningDate:    { type: String, default: "" },   // YYYY-MM-DD

    // ── Team assignment ────────────────────────────────────────────────────
    teamId:   { type: mongoose.Schema.Types.ObjectId, ref: "DeploymentTeam", default: null },
    teamName: { type: String, default: "" },

    // ── Role & manager ─────────────────────────────────────────────────────
    roleInTeam:       { type: String, default: "" }, // e.g. "Backend Developer"
    reportingManager: { type: String, default: "" },

    // ── Work setup ─────────────────────────────────────────────────────────
    workLocation: {
      type:    String,
      enum:    ["office", "remote", "hybrid"],
      default: "office"
    },
    officeLocation: { type: String, default: "" }, // e.g. "Hyderabad Office"
    shift: {
      type:    String,
      enum:    ["morning", "afternoon", "night", "flexible"],
      default: "morning"
    },

    // ── System setup ───────────────────────────────────────────────────────
    domainEmail:  { type: String, default: "" },      // company email assigned
    systemAccess: { type: [String], default: [] },    // ["Slack","Jira","GitHub",…]
    deviceIssued: { type: String, default: "" },      // "MacBook Pro", "Pending", etc.

    // ── Deployment lifecycle ───────────────────────────────────────────────
    deployedDate: { type: String, default: "" },      // YYYY-MM-DD
    status: {
      type:    String,
      enum:    ["pending", "deployed", "on_hold", "transferred", "exited"],
      default: "pending"
    },

    notes:     { type: String, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
  },
  { timestamps: true }
);

deploymentSchema.index({ candidateEmail: 1 });
deploymentSchema.index({ teamId: 1 });
deploymentSchema.index({ status: 1, createdAt: -1 });
deploymentSchema.index({ orientationId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("Deployment", deploymentSchema);
