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
  joiningDate:    { type: String, required: true },   // "YYYY-MM-DD"
  offerExpiryDate:{ type: String, default: "" },      // "YYYY-MM-DD"
  employeeType:   { type: String, enum: ["Full-time","Part-time","Contract","Intern"], default: "Full-time" },
  location:       { type: String, default: "" },
  reportingTo:    { type: String, default: "" },      // Manager name
  additionalTerms:{ type: String, default: "" },

  // Status
  status: {
    type: String,
    enum: ["draft", "sent", "accepted", "declined", "expired"],
    default: "draft"
  },

  // Email tracking
  sentAt:    { type: Date },
  sentBy:    { type: mongoose.Schema.Types.ObjectId, ref: "User" },

  // The rendered letter body (auto-generated from template + candidate data)
  letterBody: { type: String, default: "" },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }

}, { timestamps: true });

module.exports = mongoose.model("OfferLetter", offerLetterSchema);
