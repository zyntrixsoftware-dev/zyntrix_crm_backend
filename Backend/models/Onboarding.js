const mongoose = require("mongoose");

// ─────────────────────────────────────────────────────────────────────────────
// ONBOARDING
//
// One record per candidate whose offer letter has been sent.
// Created automatically when HR clicks "Send Offer Letter".
// Updated when the candidate submits the Google Form with their documents
// (via the GAS onFormSubmit → backend webhook pipeline).
//
// Status workflow:
//   offer_sent → docs_pending → docs_submitted → docs_verified
//              → joining_scheduled → onboarded
// ─────────────────────────────────────────────────────────────────────────────

const ONBOARDING_STATUSES = [
  "offer_sent",         // offer letter emailed, waiting for candidate to submit docs
  "docs_pending",       // form link sent, no submission yet
  "docs_submitted",     // candidate submitted the Google Form
  "docs_verified",      // HR has verified the uploaded documents
  "joining_scheduled",  // joining date confirmed
  "onboarded"           // candidate has joined and is now an employee
];

// One entry per required document
const documentFieldSchema = new mongoose.Schema(
  {
    url:       { type: String,  default: "" },    // Google Drive link from form
    submitted: { type: Boolean, default: false },
    verifiedAt:{ type: Date,    default: null }
  },
  { _id: false }
);

const checklistItemSchema = new mongoose.Schema(
  {
    key:    { type: String,  default: "" },
    label:  { type: String,  default: "" },
    dept:   { type: String,  default: "" },   // IT / HR / Admin
    done:   { type: Boolean, default: false },
    doneAt: { type: Date,    default: null },
    note:   { type: String,  default: "" }
  },
  { _id: true }
);

const hrNoteSchema = new mongoose.Schema(
  {
    text:    { type: String, default: "" },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    addedAt: { type: Date,   default: Date.now }
  },
  { _id: true }
);

const onboardingSchema = new mongoose.Schema(
  {
    // ── Candidate identity (copied from OfferLetter for history) ───────────
    candidateEmail: { type: String, required: true, lowercase: true, trim: true },
    candidateName:  { type: String, default: "" },
    position:       { type: String, default: "" },
    department:     { type: String, default: "" },
    phone:          { type: String, default: "" },

    // ── Links to upstream records ─────────────────────────────────────────
    offerId:     { type: mongoose.Schema.Types.ObjectId, ref: "OfferLetter" },
    interviewId: { type: mongoose.Schema.Types.ObjectId, ref: "Interview"  },

    // ── Offer terms (copied from OfferLetter for convenience) ─────────────
    joiningDate:   { type: String, default: "" },   // "YYYY-MM-DD"
    employeeType:  { type: String, default: "Full-time" },
    location:      { type: String, default: "" },
    reportingTo:   { type: String, default: "" },
    offeredSalary: { type: Number, default: 0 },
    ctcCurrency:   { type: String, default: "INR" },

    // ── Google Form submission ─────────────────────────────────────────────
    formSubmittedAt: { type: Date, default: null },

    // Document slots — each has a Drive URL + submitted flag
    // Mandatory: tenthMarksheet, twelfthMarksheet, graduationCert,
    //            passportPhoto, governmentId, bankDetails, acceptanceLetter
    // Optional:  postGraduationCert
    documents: {
      tenthMarksheet:     { type: documentFieldSchema, default: () => ({}) },
      twelfthMarksheet:   { type: documentFieldSchema, default: () => ({}) },
      graduationCert:     { type: documentFieldSchema, default: () => ({}) },
      postGraduationCert: { type: documentFieldSchema, default: () => ({}) },  // optional
      otherCertifications:{ type: documentFieldSchema, default: () => ({}) },  // optional
      passportPhoto:      { type: documentFieldSchema, default: () => ({}) },
      governmentId:       { type: documentFieldSchema, default: () => ({}) },
      bankDetails:        { type: documentFieldSchema, default: () => ({}) },
      acceptanceLetter:   { type: documentFieldSchema, default: () => ({}) }
    },

    // ── Status ─────────────────────────────────────────────────────────────
    onboardingStatus: {
      type:    String,
      enum:    ONBOARDING_STATUSES,
      default: "offer_sent"
    },

    // ── IT setup checklist (seeded on creation) ────────────────────────────
    itChecklist: { type: [checklistItemSchema], default: () => [
      { key: "work_email",   label: "Work email created",         dept: "IT" },
      { key: "domain_acc",   label: "Domain account setup",       dept: "IT" },
      { key: "jira_github",  label: "Jira / GitHub / Git access", dept: "IT" },
      { key: "laptop",       label: "Laptop / equipment issued",  dept: "IT" },
      { key: "security_badge",label: "Security badge issued",     dept: "IT" },
      { key: "vpn_slack",    label: "VPN & Slack access",         dept: "IT" }
    ]},

    // ── HR / Admin checklist (seeded on creation) ─────────────────────────
    hrChecklist: { type: [checklistItemSchema], default: () => [
      { key: "agreement",   label: "Employment agreement signed",  dept: "HR"    },
      { key: "pf_esi",      label: "PF & ESI registration",        dept: "HR"    },
      { key: "payroll",     label: "Payroll profile created",       dept: "Finance" },
      { key: "org_chart",   label: "Org chart updated",             dept: "Admin" },
      { key: "buddy",       label: "Buddy / mentor assigned",       dept: "HR"    }
    ]},

    // ── HR metadata ───────────────────────────────────────────────────────
    buddy:   { type: String, default: "" },
    notes:   { type: String, default: "" },
    hrNotes: { type: [hrNoteSchema], default: () => [] },

    // ── Lifecycle ─────────────────────────────────────────────────────────
    onboardedAt: { type: Date, default: null },
    createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: "User" }
  },
  { timestamps: true }
);

onboardingSchema.index({ candidateEmail: 1 });
onboardingSchema.index({ onboardingStatus: 1, createdAt: -1 });
onboardingSchema.index({ offerId: 1 }, { unique: true, sparse: true });

onboardingSchema.statics.ONBOARDING_STATUSES = ONBOARDING_STATUSES;

// Virtual: how many of the 8 document slots are submitted
onboardingSchema.virtual("docsSubmittedCount").get(function () {
  const d = this.documents || {};
  return Object.values(d).filter(v => v && v.submitted).length;
});

// Virtual: required docs (6 mandatory, 2 optional)
onboardingSchema.virtual("requiredDocsComplete").get(function () {
  const d = this.documents || {};
  const mandatory = ["tenthMarksheet","twelfthMarksheet","graduationCert",
                     "passportPhoto","governmentId","bankDetails"];
  return mandatory.every(k => d[k] && d[k].submitted);
});

module.exports = mongoose.model("Onboarding", onboardingSchema);
