const mongoose = require("mongoose");

const PAYMENT_PLANS = ["full", "emi", "scholarship", "free"];

// Sales-side enrollment statuses only:
//   active   = enrolled, payments ongoing
//   dropped  = student dropped before course start (sales-side refund concern)
//   handed_off = payment complete, record handed off to LMS (LMS takes over)
// Completion, certificates → LMS responsibility.
const ENROLLMENT_STATUSES = ["active", "dropped", "handed_off"];

const enrollmentSchema = new mongoose.Schema(
  {
    lead:   { type: mongoose.Schema.Types.ObjectId, ref: "StudentLead", required: true },
    batch:  { type: mongoose.Schema.Types.ObjectId, ref: "Batch",       required: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: "Course",      required: true },

    enrolledAt:   { type: Date, default: Date.now },
    paymentPlan:  { type: String, enum: PAYMENT_PLANS, default: "full" },
    totalFee:     { type: Number, default: 0 },
    discountedFee:{ type: Number, default: 0 },  // after coupon / scholarship
    feePaid:      { type: Number, default: 0 },
    emiMonths:    { type: Number, default: 0 },   // if plan = emi
    nextDueDate:  { type: Date,   default: null },// next EMI due date

    coupon:       { type: mongoose.Schema.Types.ObjectId, ref: "Coupon", default: null },
    couponCode:   { type: String, default: "" },   // snapshot at time of enrollment

    status:       { type: String, enum: ENROLLMENT_STATUSES, default: "active" },
    droppedAt:    { type: Date,   default: null },
    dropReason:   { type: String, default: "" },
    handedOffAt:  { type: Date,   default: null }, // when passed to LMS

    referral:     { type: mongoose.Schema.Types.ObjectId, ref: "Referral", default: null },

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

enrollmentSchema.statics.PAYMENT_PLANS      = PAYMENT_PLANS;
enrollmentSchema.statics.ENROLLMENT_STATUSES = ENROLLMENT_STATUSES;

module.exports = mongoose.model("Enrollment", enrollmentSchema);
