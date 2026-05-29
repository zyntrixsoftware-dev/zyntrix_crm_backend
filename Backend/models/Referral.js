const mongoose = require("mongoose");

const INCENTIVE_TYPES    = ["cash", "discount", "gift", "none"];
const REFERRAL_STATUSES  = ["pending", "enrolled", "paid", "rejected"];

const referralSchema = new mongoose.Schema(
  {
    // The existing student / person who referred
    referredBy:    { type: mongoose.Schema.Types.ObjectId, ref: "StudentLead", required: true },
    referredByName:{ type: String, default: "" },   // snapshot (referrer may not be in DB as lead)

    // The new lead that came in via referral
    referredLead:  { type: mongoose.Schema.Types.ObjectId, ref: "StudentLead", required: true },

    // The enrollment that completed the referral cycle (set when referred lead enrolls)
    enrollment:    { type: mongoose.Schema.Types.ObjectId, ref: "Enrollment", default: null },

    status:        { type: String, enum: REFERRAL_STATUSES, default: "pending" },

    incentiveType: { type: String, enum: INCENTIVE_TYPES, default: "cash" },
    incentiveValue:{ type: Number, default: 0 },    // ₹ or % depending on type
    incentivePaid: { type: Boolean, default: false },
    paidAt:        { type: Date,    default: null },

    notes:         { type: String, default: "" },
    createdBy:     { type: mongoose.Schema.Types.ObjectId, ref: "User" }
  },
  { timestamps: true }
);

referralSchema.index({ referredBy: 1 });
referralSchema.index({ referredLead: 1 });
referralSchema.index({ status: 1 });

referralSchema.statics.INCENTIVE_TYPES   = INCENTIVE_TYPES;
referralSchema.statics.REFERRAL_STATUSES = REFERRAL_STATUSES;

module.exports = mongoose.model("Referral", referralSchema);
