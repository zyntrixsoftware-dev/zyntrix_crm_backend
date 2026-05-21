const mongoose = require("mongoose");

// ─────────────────────────────────────────────────────────────────────────────
// EMPLOYEE REQUEST
//
// Backs the "Quick Actions" on the employee Attendance page:
//   • leave       — time-off request (fromDate → toDate + reason)
//   • shift_swap  — request to change/swap a shift on a given date
//
// Every request starts as "pending" and must be approved or rejected by HR
// from the HRMS "Requests" approval page.
// ─────────────────────────────────────────────────────────────────────────────
const employeeRequestSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    type: {
      type: String,
      enum: ["leave", "shift_swap"],
      required: true
    },

    // Leave fields
    leaveType: { type: String, default: "" },   // Annual / Sick / Casual / Comp-off / Unpaid
    fromDate:  { type: String, default: "" },    // "YYYY-MM-DD"
    toDate:    { type: String, default: "" },    // "YYYY-MM-DD"

    // Shift-swap fields
    date:      { type: String, default: "" },    // the shift date to change "YYYY-MM-DD"
    fromSlot:  { type: String, default: "" },    // current slot, e.g. "09:00-18:00"
    toSlot:    { type: String, default: "" },    // requested slot

    reason: { type: String, default: "" },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending"
    },
    reviewedBy:    { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    reviewedAt:    Date,
    reviewRemarks: { type: String, default: "" }
  },
  { timestamps: true }
);

employeeRequestSchema.index({ userId: 1, status: 1 });
employeeRequestSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("EmployeeRequest", employeeRequestSchema);
