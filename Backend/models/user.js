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
    enum: ["super_admin","hr","sales","marketing","lms","employee","payroll","leadgen"],
    default: "employee"
  },

  // ── HRMS EMPLOYEE PROFILE ────────────────────────────────────────
  phone:          { type: String, default: "" },
  department:     { type: String, default: "" },
  designation:    { type: String, default: "" },
  employeeType:   { type: String, enum: ["Full-time","Part-time","Contract","Intern"], default: "Full-time" },
  dateOfJoining:  { type: String, default: "" },
  salary:         { type: Number, default: 0 },
  reportingTo:    { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  employeeStatus: { type: String, enum: ["Active","On Leave","Terminated","Resigned"], default: "Active" },
  address:        { type: String, default: "" },
  emergencyContact: { type: String, default: "" },
  profileNote:    { type: String, default: "" },
  workLocation:   { type: String, default: "On-site" },

  // ── EMPLOYEE SELF-SERVICE PROFILE ───────────────────────────────
  photo:          { type: String, default: "" },
  photoFileId:    { type: mongoose.Schema.Types.ObjectId, default: null },
  photoMime:      { type: String, default: "" },
  dob:            { type: String, default: "" },
  gender:         { type: String, default: "" },
  city:           { type: String, default: "" },
  state:          { type: String, default: "" },
  bio:            { type: String, default: "" },
  emergencyDetails: {
    name:     { type: String, default: "" },
    relation: { type: String, default: "" },
    phone:    { type: String, default: "" },
    altPhone: { type: String, default: "" }
  },

  // ── EMPLOYEE APP SETTINGS (self-service Settings page) ──────────
  // Free-form object holding the user's preferences (notifications,
  // appearance, attendance prefs, privacy, language, integrations).
  settings: { type: mongoose.Schema.Types.Mixed, default: {} },

  // Account-level activation. Set to false when the employee self-deactivates
  // from Settings → Danger Zone. Login is blocked while this is false.
  active: { type: Boolean, default: true },

  // OTP-based password reset
  otpCode:       { type: String },
  otpExpiry:     { type: Date },
  otpVerified:   { type: Boolean, default: false },
  otpResetToken: { type: String },

}, {
  timestamps: true
});

module.exports = mongoose.model("User", userSchema);
