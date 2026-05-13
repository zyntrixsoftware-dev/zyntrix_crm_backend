const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({

  name: {
    type: String,
    required: true
  },

  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },

  password: {
    type: String,
    required: true
  },

  role: {
    type: String,
    enum: ["super_admin","hr","sales","marketing","lms","employee"],
    default: "employee"
  },

  // ── HRMS EMPLOYEE PROFILE ────────────────────────────────────────
  phone:          { type: String, default: "" },
  department:     { type: String, default: "" },
  designation:    { type: String, default: "" },
  employeeType:   { type: String, enum: ["Full-time","Part-time","Contract","Intern"], default: "Full-time" },
  dateOfJoining:  { type: String, default: "" },   // "YYYY-MM-DD"
  salary:         { type: Number, default: 0 },
  reportingTo:    { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  employeeStatus: { type: String, enum: ["Active","On Leave","Terminated","Resigned"], default: "Active" },
  address:        { type: String, default: "" },
  emergencyContact: { type: String, default: "" },
  profileNote:    { type: String, default: "" },

  // OTP-based password reset
  otpCode:       { type: String },
  otpExpiry:     { type: Date },
  otpVerified:   { type: Boolean, default: false },
  otpResetToken: { type: String },

}, {
  timestamps: true
});

module.exports = mongoose.model("User", userSchema);