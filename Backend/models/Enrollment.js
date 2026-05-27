const mongoose = require("mongoose");

const PAYMENT_PLANS       = ["full", "emi", "scholarship", "free"];
const COMPLETION_STATUSES = ["active", "completed", "dropped"];

const enrollmentSchema = new mongoose.Schema(
  {
    lead:   { type: mongoose.Schema.Types.ObjectId, ref: "StudentLead", required: true },
    batch:  { type: mongoose.Schema.Types.ObjectId, ref: "Batch",       required: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: "Course",      required: true },

    enrolledAt:   { type: Date, default: Date.now },
    paymentPlan:  { type: String, enum: PAYMENT_PLANS, default: "full" },
    totalFee:     { type: Number, default: 0 },
    feePaid:      { type: Number, default: 0 },
    emiMonths:    { type: Number, default: 0 },      // if plan = emi
    nextDueDate:  { type: Date,   default: null },   // next EMI due

    completionStatus: { type: String, enum: COMPLETION_STATUSES, default: "active" },
    completedAt:      { type: Date, default: null },
    droppedAt:        { type: Date, default: null },
    dropReason:       { type: String, default: "" },

    certificateIssued:   { type: Boolean, default: false },
    certificateIssuedAt: { type: Date,    default: null },
    certificateUrl:      { type: String,  default: "" },

    notes:     { type: String, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
  },
  { timestamps: true }
);

enrollmentSchema.index({ lead: 1 });
enrollmentSchema.index({ batch: 1 });
enrollmentSchema.index({ course: 1 });
enrollmentSchema.index({ completionStatus: 1 });

// Virtual: outstanding balance
enrollmentSchema.virtual("balance").get(function () {
  return Math.max(0, this.totalFee - this.feePaid);
});

// Virtual: payment progress %
enrollmentSchema.virtual("paidPercent").get(function () {
  if (!this.totalFee) return 100;
  return Math.round((this.feePaid / this.totalFee) * 100);
});

enrollmentSchema.statics.PAYMENT_PLANS       = PAYMENT_PLANS;
enrollmentSchema.statics.COMPLETION_STATUSES = COMPLETION_STATUSES;

module.exports = mongoose.model("Enrollment", enrollmentSchema);
