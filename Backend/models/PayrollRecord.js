const mongoose = require("mongoose");

const payrollRecordSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    month: {
      type: String,
      required: true
    },
    totalWorkedMinutes: {
      type: Number,
      default: 0
    },
    overtimeMinutes: {
      type: Number,
      default: 0
    },
    basicPay: {
      type: Number,
      default: 0
    },
    hra: {
      type: Number,
      default: 0
    },
    bonus: {
      type: Number,
      default: 0
    },
    overtimePay: {
      type: Number,
      default: 0
    },
    grossPay: {
      type: Number,
      default: 0
    },
    tax: {
      type: Number,
      default: 0
    },
    penalties: {
      type: Number,
      default: 0
    },
    deductions: {
      type: Number,
      default: 0
    },
    netPay: {
      type: Number,
      default: 0
    },
    paymentStatus: {
      type: String,
      enum: ["paid", "pending", "failed"],
      default: "pending"
    }
  },
  { timestamps: true }
);

payrollRecordSchema.index({ userId: 1, month: 1 }, { unique: true });

module.exports = mongoose.model("PayrollRecord", payrollRecordSchema);
