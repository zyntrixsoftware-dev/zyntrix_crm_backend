const mongoose = require("mongoose");

const offerLetterSchema = new mongoose.Schema({
  // Link to the interview record
  interviewId: { type: mongoose.Schema.Types.ObjectId, ref: "Interview", required: true },

  // Candidate details (copied from interview for convenience / history)
  candidateName:  { type: String, required: true },
  candidateEmail: { type: String, required: true },
  appliedFor:     { type: String, required: true },
  department:     { type: String, default: "" },

  // Offer terms (HR fills these in the panel)
  offeredSalary:  { type: Number, required: true },
  ctcCurrency:    { type: String, default: "INR" },   // INR / USD / EUR — currency label
  joiningDate:    { type: String, required: true },   // "YYYY-MM-DD"
  offerExpiryDate:{ type: String, default: "" },      // "YYYY-MM-DD"
  employeeType:   { type: String, enum: ["Full-time","Part-time","Contract","Intern"], default: "Full-time" },
  location:       { type: String, default: "" },
  reportingTo:    { type: String, default: "" },      // Manager name
  additionalTerms:{ type: String, default: "" },

  // ── Verzeo-style extended terms ─────────────────────────────────────────
  // Internship-specific (only rendered in letter when employeeType=Intern)
  trainingStartDate:  { type: String, default: "" },   // "YYYY-MM-DD"
  trainingEndDate:    { type: String, default: "" },   // "YYYY-MM-DD"
  internshipEndDate:  { type: String, default: "" },   // "YYYY-MM-DD"

  // Common employment terms (defaults follow standard Zyntrix policy)
  hoursPerWeek:         { type: Number, default: 40 },
  workingHoursPerDay:   { type: Number, default: 9 },     // inc. lunch break
  acceptanceWindowDays: { type: Number, default: 2 },     // days candidate has to accept
  noticePeriodDays:     { type: Number, default: 30 },    // notice required to resign

  // Sales-specific (rendered when present, regardless of employeeType)
  revenueTarget: { type: String, default: "" },           // free-text e.g. "INR 1,50,000 per month"

  // Status
  status: {
    type: String,
    enum: ["draft", "sent", "accepted", "declined", "expired"],
    default: "draft"
  },

  // Email tracking
  sentAt:    { type: Date },
  sentBy:    { type: mongoose.Schema.Types.ObjectId, ref: "User" },

  // ── Template selection ─────────────────────────────────────────────────
  // Drives which boilerplate fills letterBody initially. HR can still edit
  // the rendered body freely; once bodyEdited=true, we stop auto-regenerating.
  templateKey: {
    type: String,
    enum: ["default", "engineer", "sales", "intern", "manager"],
    default: "default"
  },
  bodyEdited: { type: Boolean, default: false },

  // The rendered letter body (auto-generated from template + candidate data,
  // or HR-edited when bodyEdited=true)
  letterBody: { type: String, default: "" },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }

}, { timestamps: true });

module.exports = mongoose.model("OfferLetter", offerLetterSchema);
