const mongoose = require("mongoose");

/**
 * Candidate — a person imported from a spreadsheet / link / manual entry.
 * Lives independently of the Interview model. When HR clicks "Shortlist",
 * an Interview record is auto-created with 3 empty rounds and `status` flips
 * from "new" to "shortlisted".
 */
const candidateSchema = new mongoose.Schema({
  // ── Core identity fields (mapped from the imported row) ──
  name:        { type: String, required: true, trim: true },
  email:       { type: String, required: true, trim: true, lowercase: true },
  phone:       { type: String, default: "" },
  appliedFor:  { type: String, default: "" },   // Job role / position applied for
  department:  { type: String, default: "" },

  // ── Pipeline status ──
  status: {
    type: String,
    enum: ["new", "shortlisted", "rejected", "hired"],
    default: "new"
  },

  // ── Provenance ──
  importedFrom: {
    type: String,
    enum: ["xlsx", "csv", "tsv", "html", "pdf", "google_sheets", "onedrive", "manual"],
    default: "manual"
  },
  importBatchId: { type: String, default: "" },   // group rows from same upload
  resumeUrl:     { type: String, default: "" },

  // ── Link back to the interview record (set when shortlisted) ──
  interviewId: { type: mongoose.Schema.Types.ObjectId, ref: "Interview", default: null },

  // ── Original row (so we don't lose any column the user mapped) ──
  raw: { type: mongoose.Schema.Types.Mixed, default: {} },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }

}, { timestamps: true });

// Prevent duplicate imports of the same email by the same HR user
candidateSchema.index({ createdBy: 1, email: 1 }, { unique: false });

module.exports = mongoose.model("Candidate", candidateSchema);
