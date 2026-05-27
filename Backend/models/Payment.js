const mongoose = require("mongoose");

const METHODS = ["upi", "card", "bank_transfer", "cash", "cheque", "other"];

const paymentSchema = new mongoose.Schema(
  {
    enrollment:      { type: mongoose.Schema.Types.ObjectId, ref: "Enrollment", required: true },
    lead:            { type: mongoose.Schema.Types.ObjectId, ref: "StudentLead", required: true },
    course:          { type: mongoose.Schema.Types.ObjectId, ref: "Course",      default: null },
    amount:          { type: Number, required: true, min: 1 },
    paidAt:          { type: Date,   default: Date.now },
    method:          { type: String, enum: METHODS, default: "upi" },
    transactionId:   { type: String, default: "" },
    instalmentNumber:{ type: Number, default: 1 },
    remarks:         { type: String, default: "" },
    isVoided:        { type: Boolean, default: false },
    voidedAt:        { type: Date,    default: null },
    voidReason:      { type: String,  default: "" },
    createdBy:       { type: mongoose.Schema.Types.ObjectId, ref: "User" }
  },
  { timestamps: true }
);

paymentSchema.index({ enrollment: 1 });
paymentSchema.index({ lead: 1 });
paymentSchema.index({ paidAt: -1 });
paymentSchema.index({ isVoided: 1 });

paymentSchema.statics.METHODS = METHODS;

module.exports = mongoose.model("Payment", paymentSchema);
