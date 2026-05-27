const mongoose = require("mongoose");

const salesTargetSchema = new mongoose.Schema(
  {
    user:  { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    month: { type: Number, required: true, min: 1, max: 12 },
    year:  { type: Number, required: true },

    targetLeads:       { type: Number, default: 0 },
    targetDemos:       { type: Number, default: 0 },
    targetEnrollments: { type: Number, default: 0 },
    targetRevenue:     { type: Number, default: 0 },

    achievedLeads:       { type: Number, default: 0 },
    achievedDemos:       { type: Number, default: 0 },
    achievedEnrollments: { type: Number, default: 0 },
    achievedRevenue:     { type: Number, default: 0 },

    notes:     { type: String, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
  },
  { timestamps: true }
);

// One target record per user per month+year
salesTargetSchema.index({ user: 1, month: 1, year: 1 }, { unique: true });
salesTargetSchema.index({ month: 1, year: 1 });

module.exports = mongoose.model("SalesTarget", salesTargetSchema);
