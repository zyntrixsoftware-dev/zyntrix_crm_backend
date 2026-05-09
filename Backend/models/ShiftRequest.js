const mongoose = require("mongoose");

const shiftRequestSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    date: {
      type: String,
      required: true
    },
    slotStart: {
      type: String,
      required: true
    },
    slotEnd: {
      type: String,
      required: true
    },
    note: {
      type: String,
      default: ""
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending"
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    reviewedAt: Date,
    reviewRemarks: {
      type: String,
      default: ""
    }
  },
  { timestamps: true }
);

shiftRequestSchema.index({ userId: 1, date: 1, slotStart: 1, slotEnd: 1 }, { unique: true });

module.exports = mongoose.model("ShiftRequest", shiftRequestSchema);
