const mongoose = require("mongoose");

// ─────────────────────────────────────────────────────────────────────────────
// DEPLOYMENT TEAM
//
// HR creates teams here. New joinees who complete orientation are then
// "deployed" (assigned) into one of these teams.
// ─────────────────────────────────────────────────────────────────────────────

const deploymentTeamSchema = new mongoose.Schema(
  {
    name:        { type: String, required: true, trim: true },
    department:  { type: String, required: true, trim: true },
    description: { type: String, default: "" },

    // Team lead
    teamLead:      { type: String, default: "" },
    teamLeadEmail: { type: String, default: "" },

    // Location / setup
    location: {
      type:    String,
      enum:    ["office", "remote", "hybrid"],
      default: "office"
    },
    officeLocation: { type: String, default: "" }, // e.g. "Hyderabad Office"

    // Status
    status: {
      type:    String,
      enum:    ["active", "inactive"],
      default: "active"
    },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
  },
  { timestamps: true }
);

deploymentTeamSchema.index({ name: 1 });
deploymentTeamSchema.index({ department: 1 });

module.exports = mongoose.model("DeploymentTeam", deploymentTeamSchema);
