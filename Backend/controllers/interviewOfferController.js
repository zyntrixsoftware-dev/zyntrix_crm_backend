const Interview        = require("../models/Interview");
const OfferLetter      = require("../models/OfferLetter");
const Candidate        = require("../models/Candidate");
const sendEmail        = require("../utils/sendEmail");
const generateOfferPDF = require("../utils/generateOfferPDF");

function checkHrAccess(req, res) {
  if (!["hr", "super_admin"].includes(req.user.role)) {
    res.status(403).json({ msg: "Access denied" });
    return false;
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERVIEW PANEL
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/hr/interviews
//   ?status=in_progress|passed|failed|on_hold
//   ?offered=true|false
//   ?search=<text>
exports.getInterviews = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;

    const { status, search, offered } = req.query;
    const query = {};
    if (status)  query.overallStatus = status;
    if (offered === "true")  query.offered = true;
    if (offered === "false") query.offered = false;
    if (search) {
      query.$or = [
        { candidateName:  { $regex: search, $options: "i" } },
        { candidateEmail: { $regex: search, $options: "i" } },
        { appliedFor:     { $regex: search, $options: "i" } }
      ];
    }

    const interviews = await Interview.find(query)
      .populate("createdBy", "name")
      .sort({ createdAt: -1 });

    return res.json({ interviews, total: interviews.length });
  } catch (err) {
    console.error("GET INTERVIEWS ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// GET /api/hr/interviews/passed — kept for back-compat
exports.getPassedCandidates = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;

    const passed = await Interview.find({ overallStatus: "passed" })
      .populate("offerId", "status sentAt")
      .sort({ updatedAt: -1 });

    return res.json({ candidates: passed, total: passed.length });
  } catch (err) {
    console.error("GET PASSED CANDIDATES ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// POST /api/hr/interviews — manual create (still supported alongside auto-shortlist)
exports.createInterview = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;

    const { candidateName, candidateEmail, candidatePhone, appliedFor, department, note } = req.body;
    if (!candidateName || !candidateEmail || !appliedFor)
      return res.status(400).json({ msg: "candidateName, candidateEmail and appliedFor are required" });

    const interview = await Interview.create({
      candidateName, candidateEmail, candidatePhone,
      appliedFor, department,
      round1: { status: "pending", durationMin: 50 },
      round2: { status: "pending", durationMin: 50 },
      round3: { status: "pending", durationMin: 50 },
      note: note || "",
      overallStatus: "in_progress",
      createdBy: req.user.id
    });

    return res.status(201).json({ msg: "Interview record created", interview });
  } catch (err) {
    console.error("CREATE INTERVIEW ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// PATCH /api/hr/interviews/:id/round
// body: { roundKey: "round1"|"round2"|"round3", status: "qualified"|"not_qualified"|"pending",
//         scheduledAt?, interviewer?, remarks? }
exports.updateRound = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;

    const { roundKey, status, scheduledAt, interviewer, remarks } = req.body;
    const validKeys    = ["round1", "round2", "round3"];
    const validStatus  = ["pending", "qualified", "not_qualified"];

    if (!validKeys.includes(roundKey))
      return res.status(400).json({ msg: "roundKey must be round1, round2 or round3" });
    if (!validStatus.includes(status))
      return res.status(400).json({ msg: "status must be pending, qualified or not_qualified" });

    const interview = await Interview.findById(req.params.id);
    if (!interview) return res.status(404).json({ msg: "Interview not found" });

    interview[roundKey] = interview[roundKey] || {};
    interview[roundKey].status      = status;
    interview[roundKey].durationMin = 50;   // enforced 50-min slot
    if (scheduledAt !== undefined) interview[roundKey].scheduledAt = scheduledAt || null;
    if (interviewer !== undefined) interview[roundKey].interviewer = interviewer || "";
    if (remarks     !== undefined) interview[roundKey].remarks     = remarks     || "";
    if (status !== "pending")      interview[roundKey].conductedAt = new Date();

    // Auto-derive overallStatus (unless HR has put it on_hold manually)
    if (interview.overallStatus !== "on_hold") {
      interview.overallStatus = interview.deriveOverallStatus();
    }

    await interview.save();
    return res.json({ msg: "Round updated", interview });
  } catch (err) {
    console.error("UPDATE ROUND ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// PATCH /api/hr/interviews/:id/status — manual override
exports.updateInterviewStatus = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;

    const { status } = req.body;
    const valid = ["in_progress", "passed", "failed", "on_hold"];
    if (!valid.includes(status))
      return res.status(400).json({ msg: "Invalid status" });

    const interview = await Interview.findByIdAndUpdate(
      req.params.id, { overallStatus: status }, { new: true }
    );
    if (!interview) return res.status(404).json({ msg: "Interview not found" });

    return res.json({ msg: "Status updated", interview });
  } catch (err) {
    return res.status(500).json({ msg: "Server error" });
  }
};

// PATCH /api/hr/interviews/:id/note
exports.updateInterviewNote = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;
    const note = (req.body?.note || "").toString().slice(0, 1000);
    const interview = await Interview.findByIdAndUpdate(
      req.params.id, { note }, { new: true }
    );
    if (!interview) return res.status(404).json({ msg: "Interview not found" });
    return res.json({ msg: "Note updated", interview });
  } catch (err) {
    return res.status(500).json({ msg: "Server error" });
  }
};

// PATCH /api/hr/interviews/:id/offered
// body: { offered: true|false }
// When flipping to true, candidate becomes eligible for an Offer Letter.
exports.toggleOffered = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;

    const offered = req.body?.offered === true;
    const interview = await Interview.findById(req.params.id);
    if (!interview) return res.status(404).json({ msg: "Interview not found" });

    interview.offered   = offered;
    interview.offeredAt = offered ? new Date() : null;
    interview.offeredBy = offered ? req.user.id : null;

    // If marking offered, require all 3 rounds qualified (or status=passed)
    if (offered) {
      const allQualified = ["round1","round2","round3"]
        .every(k => interview[k] && interview[k].status === "qualified");
      if (!allQualified && interview.overallStatus !== "passed") {
        return res.status(400).json({
          msg: "Cannot mark Offered — all 3 rounds must be Qualified first (or status set to Passed)."
        });
      }
    }

    await interview.save();
    return res.json({ msg: offered ? "Marked as Offered" : "Unmarked Offered", interview });
  } catch (err) {
    console.error("TOGGLE OFFERED ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// OFFER LETTER TEMPLATES
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// COMPANY CONSTANTS — pulled from env so they can be overridden per deployment
// ─────────────────────────────────────────────────────────────────────────────
const COMPANY = {
  name:      process.env.COMPANY_NAME      || "Zyntrix Software Solutions Pvt. Ltd.",
  shortName: process.env.COMPANY_SHORTNAME || "ZYNTRIX SOFTWARE SOLUTIONS",
  address:   process.env.COMPANY_ADDRESS   || "Hyderabad, Telangana, India",
  hrEmail:   process.env.COMPANY_HR_EMAIL  || "hr@zyntrixsoftware.com",
  support:   process.env.COMPANY_SUPPORT_EMAIL || "support@zyntrixsoftware.com",
  phone:     process.env.COMPANY_PHONE     || "",
  cin:       process.env.COMPANY_CIN       || "",
  gstn:      process.env.COMPANY_GSTN      || "",
  pan:       process.env.COMPANY_PAN       || ""
};

const OFFER_TEMPLATES = {
  default: {
    key:   "default",
    label: "Default",
    intro: "We are pleased to inform you that you have been selected for the position of {{appliedFor}} " +
           "at {{companyName}}. Please find below the confirmation of your employment offer."
  },
  engineer: {
    key:   "engineer",
    label: "Engineering",
    intro: "We are excited to confirm your selection for the position of {{appliedFor}} on the " +
           "{{companyName}} Engineering team. Your technical strengths and problem-solving approach " +
           "stood out across every round of our interview process. Please find below the confirmation " +
           "of your employment offer."
  },
  sales: {
    key:   "sales",
    label: "Sales",
    intro: "We are delighted to confirm your selection for the position of {{appliedFor}} in the " +
           "{{companyName}} Sales organisation. Your customer-first mindset and ownership impressed us " +
           "throughout the interview process. Please find below the confirmation of your employment offer."
  },
  intern: {
    key:   "intern",
    label: "Internship",
    intro: "We congratulate you for being selected for an Internship with {{companyName}} on an “At will basis” " +
           "which can be extended based on performance. Please find below the confirmation of your Internship."
  },
  manager: {
    key:   "manager",
    label: "Manager / Lead",
    intro: "We are pleased to extend an offer for the leadership role of {{appliedFor}} at {{companyName}}. " +
           "We are confident you will be a strong addition to our leadership team. Please find below the " +
           "confirmation of your employment offer."
  }
};

function fillIntro(template, data) {
  return (template.intro || "")
    .replace(/\{\{appliedFor\}\}/g,  data.appliedFor  || "the role")
    .replace(/\{\{companyName\}\}/g, COMPANY.name);
}

// Format a YYYY-MM-DD string as "21 June 2021" style (Verzeo style)
function fmtDate(s) {
  if (!s) return "—";
  const d = new Date(s + (s.length === 10 ? "T00:00:00" : ""));
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
}

function rule() {
  return "────────────────────────────────────────────────────────────────────────";
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN LETTER GENERATOR — mirrors the Verzeo offer letter structure under
// Zyntrix branding. Sections adapt based on employeeType + supplied fields.
// ─────────────────────────────────────────────────────────────────────────────
function generateLetterBody(data, templateKey = "default") {
  const template = OFFER_TEMPLATES[templateKey] || OFFER_TEMPLATES.default;
  const isIntern = (data.employeeType || "").toLowerCase() === "intern";

  const today          = new Date().toLocaleDateString("en-IN", {
    day: "2-digit", month: "long", year: "numeric"
  });
  const positionLabel  = isIntern ? "Internship" : "Employment";
  const positionWord   = isIntern ? "Internship" : "Position";
  const ctcLabel       = isIntern ? "Internship Stipend" : "CTC Offered";
  const ctcUnit        = isIntern ? "per month"          : "per annum";
  const currency       = data.ctcCurrency || "INR";
  const salaryStr      = Number(data.offeredSalary || 0).toLocaleString("en-IN");
  const intro          = fillIntro(template, data);

  // Compose key-terms block — only include lines we have data for
  const keyTerms = [];
  keyTerms.push(`${positionWord} Title       : ${data.appliedFor || "—"}`);
  if (data.department) keyTerms.push(`Department          : ${data.department}`);
  if (isIntern && data.trainingStartDate)
    keyTerms.push(`Training Date       : ${fmtDate(data.trainingStartDate)} to ${fmtDate(data.trainingEndDate)}`);
  keyTerms.push(`${isIntern ? "Internship Start" : "Date of Joining "}    : ${fmtDate(data.joiningDate)}`);
  if (isIntern && data.internshipEndDate)
    keyTerms.push(`Internship End Date : ${fmtDate(data.internshipEndDate)}`);

  // Working terms block
  const workTerms = [];
  if (data.hoursPerWeek) workTerms.push(`Number of Hours     : ${data.hoursPerWeek} hours a week`);
  workTerms.push(`Location            : ${data.location || "Zyntrix Office"}`);
  if (data.reportingTo)  workTerms.push(`Reporting To        : ${data.reportingTo}`);
  workTerms.push(`${ctcLabel.padEnd(20, " ")}: ${currency} ${salaryStr} ${ctcUnit}` +
                 (isIntern ? " (Subject to statutory deductions)" : ""));
  if (data.revenueTarget) workTerms.push(`Revenue Target      : ${data.revenueTarget}`);
  if (data.offerExpiryDate) workTerms.push(`Offer Valid Until   : ${fmtDate(data.offerExpiryDate)}`);

  const acceptanceDays = data.acceptanceWindowDays || 2;
  const reportingByDate = isIntern && data.trainingStartDate
    ? fmtDate(data.trainingStartDate)
    : fmtDate(data.joiningDate);

  // ── POLICY SECTION (Verzeo page 2 — adapted for both intern and FT) ──
  const policyHeader = isIntern ? "INTERNSHIP POLICY" : "EMPLOYMENT POLICY";
  const noticeDays   = data.noticePeriodDays || (isIntern ? 15 : 30);
  const workingHrs   = data.workingHoursPerDay || 9;

  const policyLines = [
    `• By accepting this ${isIntern ? "internship" : "employment"} offer you agree to perform all`,
    `  responsibilities assigned to you with due care and diligence and in compliance`,
    `  with the management norms.`,
    "",
    `• You are required to substantially use your time and effort to perform these tasks`,
    `  during business hours and such reasonable additional time as may be necessary.`,
    "",
    `  Working Hours : ${workingHrs} hours a day (inc. lunch break)`,
    `  Job Type      : ${data.employeeType || "Full-time"}`,
    `  Location      : ${data.location || "Zyntrix Office"}` +
      (data.revenueTarget ? `\n  Revenue Target: ${data.revenueTarget}` : ""),
    "",
    isIntern
      ? `• As an intern you will not receive employee benefits that regular employees receive.`
      : `• You will be eligible for the standard employee benefits offered by ${COMPANY.name}, as`,
    isIntern ? "" : `  detailed separately in the Employee Handbook.`,
    "",
    `• During the ${isIntern ? "internship" : "probation"} period, the Company reserves the right to`,
    `  terminate your services without offering any reason, and you are required to give`,
    `  ${noticeDays} days' notice should you wish to resign before the end of your tenure.`,
    "",
    isIntern
      ? `• If you discontinue the internship for personal reasons, you will pay a`
      : `• If you leave before completing your probation, you will compensate the Company`,
    isIntern
      ? `  compensation equal to 1 month stipend to the Company.`
      : `  in line with the standard probation-exit policy.`,
    "",
    `• All information acquired during your tenure shall be strictly confidential and you`,
    `  shall refrain from using it for your own purpose or from disclosing it to anyone`,
    `  outside of the Company.`,
    "",
    `• Upon conclusion of your tenure, you will immediately return to the Company all of`,
    `  its property, equipment and documents — including electronically stored information.`,
    "",
    `• You will observe all policies and practices governing the conduct of our business`,
    `  and employees.`,
    "",
    `• Official communication, within or outside the Company, must be through the company`,
    `  email account assigned to you or via your reporting manager.`,
    "",
    isIntern
      ? `• Post successful completion of the internship tenure, the candidate will be`
      : `• Continued employment is subject to satisfactory performance reviews and`,
    isIntern
      ? `  considered for performance-based pre-placement offers by the Company.`
      : `  adherence to Company policy.`
  ].filter(l => l !== "");      // drop empty filler lines

  // ── ANNEXURE (Verzeo page 3 — required documents) ──
  const annexure = [
    "1. Professional / Educational Certificates and Mark Sheets:",
    "     • 10th standard or equivalent examination (Original MS for verification)",
    "     • 12th standard or equivalent examination (Original MS for verification)",
    "     • Graduation",
    "     • Post-graduation / Doctorate",
    "     • Other relevant educational or skill certifications",
    "",
    "2. Colour scanned copy of your photograph",
    "",
    "3. PAN Card, Voter ID or Driving Licence (scanned copy)",
    "",
    "4. Bank Account Details — Bank Name, Name as per bank records,",
    "   Account Number, IFSC Code"
  ];

  // ── FOOTER (company identity block, Verzeo footer style) ──
  const footerLines = [
    rule(),
    COMPANY.name,
    COMPANY.address,
    [COMPANY.hrEmail, COMPANY.phone].filter(Boolean).join("  ·  ")
  ];
  const legalLine = [
    COMPANY.cin  ? `CIN: ${COMPANY.cin}`   : "",
    COMPANY.gstn ? `GSTN: ${COMPANY.gstn}` : "",
    COMPANY.pan  ? `PAN: ${COMPANY.pan}`   : ""
  ].filter(Boolean).join("  ·  ");
  if (legalLine) footerLines.push(legalLine);
  footerLines.push(rule());

  // ────────────────────────────────────────────────────────────────────────
  // ASSEMBLE
  // ────────────────────────────────────────────────────────────────────────
  return [
    `Date: ${today}`,
    "",
    `Dear ${data.candidateName},`,
    "",
    `Subject: Offer of ${positionLabel} — ${data.appliedFor}`,
    "",
    intro,
    "",
    keyTerms.join("\n"),
    "",
    workTerms.join("\n"),
    "",
    `Please indicate your acceptance by signing this letter and mailing the signed,`,
    `scanned soft copy of this Offer Letter — along with the documents listed in the`,
    `Annexure below — to <${COMPANY.hrEmail}> within ${acceptanceDays} working days`,
    `of receipt. The offer shall stand automatically withdrawn without further action on`,
    `the part of ${COMPANY.shortName} if we do not receive your acceptance within this timeline.`,
    "",
    `I have read and understood the above terms and conditions, and I accept this offer`,
    `as set forth above with ${COMPANY.name}, and will report on or before ${reportingByDate}.`,
    "",
    `SIGNATURE: ____________________________     DATE: ____________________________`,
    `(Candidate's Signature)`,
    "",
    data.additionalTerms ? `Additional Terms:\n${data.additionalTerms}\n` : "",
    ...footerLines,
    "",
    "",
    policyHeader,
    rule(),
    policyLines.join("\n"),
    "",
    "",
    "ANNEXURE — Documents required at the time of joining",
    rule(),
    annexure.join("\n"),
    "",
    `SIGNATURE: ____________________________     DATE: ____________________________`,
    `(Candidate's Signature)`
  ].filter(l => l !== null && l !== undefined).join("\n").trim();
}

// GET /api/hr/offers/templates — list available templates
exports.getOfferTemplates = async (req, res) => {
  if (!checkHrAccess(req, res)) return;
  return res.json({ templates: Object.values(OFFER_TEMPLATES) });
};

// POST /api/hr/offers/preview
// body: { interviewId, templateKey, offeredSalary, joiningDate, ... }
// Returns the generated letter body WITHOUT saving. Used by the offer letter
// page to update the preview when HR changes the template or any field.
exports.previewOffer = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;

    const { interviewId, templateKey = "default" } = req.body;
    if (!interviewId) return res.status(400).json({ msg: "interviewId required" });

    const interview = await Interview.findById(interviewId);
    if (!interview) return res.status(404).json({ msg: "Interview not found" });

    const data = {
      candidateName:  interview.candidateName,
      appliedFor:     interview.appliedFor,
      department:     interview.department,
      offeredSalary:  req.body.offeredSalary  || 0,
      ctcCurrency:    req.body.ctcCurrency    || "INR",
      joiningDate:    req.body.joiningDate    || "",
      offerExpiryDate:req.body.offerExpiryDate|| "",
      employeeType:   req.body.employeeType   || "Full-time",
      location:       req.body.location       || "",
      reportingTo:    req.body.reportingTo    || "",
      additionalTerms:req.body.additionalTerms|| "",
      // Verzeo-style extended fields
      trainingStartDate:    req.body.trainingStartDate    || "",
      trainingEndDate:      req.body.trainingEndDate      || "",
      internshipEndDate:    req.body.internshipEndDate    || "",
      hoursPerWeek:         req.body.hoursPerWeek         || 40,
      workingHoursPerDay:   req.body.workingHoursPerDay   || 9,
      acceptanceWindowDays: req.body.acceptanceWindowDays || 2,
      noticePeriodDays:     req.body.noticePeriodDays     || 30,
      revenueTarget:        req.body.revenueTarget        || ""
    };

    const body = generateLetterBody(data, templateKey);
    return res.json({ letterBody: body, templateKey });
  } catch (err) {
    return res.status(500).json({ msg: "Server error: " + err.message });
  }
};

// GET /api/hr/offers
exports.getOffers = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;
    const { status } = req.query;
    const query = status ? { status } : {};

    const offers = await OfferLetter.find(query)
      .populate("interviewId", "round1 round2 round3 overallStatus offered")
      .populate("sentBy", "name")
      .sort({ createdAt: -1 });

    return res.json({ offers, total: offers.length });
  } catch (err) {
    console.error("GET OFFERS ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// GET /api/hr/offers/:id
exports.getOffer = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;
    const offer = await OfferLetter.findById(req.params.id).populate("interviewId");
    if (!offer) return res.status(404).json({ msg: "Offer not found" });
    return res.json({ offer });
  } catch (err) {
    return res.status(500).json({ msg: "Server error" });
  }
};

// POST /api/hr/offers — create offer letter for a candidate marked offered=true
exports.createOffer = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;

    const { interviewId, offeredSalary, ctcCurrency, joiningDate, offerExpiryDate,
            employeeType, location, reportingTo, additionalTerms,
            trainingStartDate, trainingEndDate, internshipEndDate,
            hoursPerWeek, workingHoursPerDay, acceptanceWindowDays,
            noticePeriodDays, revenueTarget,
            templateKey, letterBody } = req.body;

    if (!interviewId || !offeredSalary || !joiningDate)
      return res.status(400).json({ msg: "interviewId, offeredSalary and joiningDate are required" });

    const interview = await Interview.findById(interviewId);
    if (!interview) return res.status(404).json({ msg: "Interview not found" });
    if (!interview.offered)
      return res.status(400).json({
        msg: "Offer can only be created for candidates marked Offered on the Interview Panel."
      });

    const chosenTemplate = OFFER_TEMPLATES[templateKey] ? templateKey : "default";

    const extended = {
      ctcCurrency:           ctcCurrency           || "INR",
      trainingStartDate:     trainingStartDate     || "",
      trainingEndDate:       trainingEndDate       || "",
      internshipEndDate:     internshipEndDate     || "",
      hoursPerWeek:          hoursPerWeek          || 40,
      workingHoursPerDay:    workingHoursPerDay    || 9,
      acceptanceWindowDays:  acceptanceWindowDays  || 2,
      noticePeriodDays:      noticePeriodDays      || 30,
      revenueTarget:         revenueTarget         || ""
    };

    const letterData = {
      candidateName:  interview.candidateName,
      candidateEmail: interview.candidateEmail,
      appliedFor:     interview.appliedFor,
      department:     interview.department,
      offeredSalary, joiningDate, offerExpiryDate,
      employeeType: employeeType || "Full-time",
      location, reportingTo, additionalTerms,
      ...extended
    };

    // If HR supplied a custom letterBody, use it as-is (and mark bodyEdited)
    const customBody = (letterBody || "").toString().trim();
    const finalBody  = customBody || generateLetterBody(letterData, chosenTemplate);

    const offer = await OfferLetter.create({
      interviewId,
      candidateName:   interview.candidateName,
      candidateEmail:  interview.candidateEmail,
      appliedFor:      interview.appliedFor,
      department:      interview.department,
      offeredSalary, joiningDate, offerExpiryDate,
      employeeType: employeeType || "Full-time",
      location, reportingTo, additionalTerms,
      ...extended,
      templateKey: chosenTemplate,
      bodyEdited:  !!customBody,
      letterBody:  finalBody,
      status:      "draft",
      createdBy:   req.user.id
    });

    await Interview.findByIdAndUpdate(interviewId, { offerId: offer._id });
    return res.status(201).json({ msg: "Offer letter created", offer });
  } catch (err) {
    console.error("CREATE OFFER ERROR:", err);
    return res.status(500).json({ msg: "Server error: " + err.message });
  }
};

// PUT /api/hr/offers/:id — edit before send. Re-generates body unless HR edited it.
exports.updateOffer = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;

    const offer = await OfferLetter.findById(req.params.id);
    if (!offer) return res.status(404).json({ msg: "Offer not found" });
    if (offer.status === "sent")
      return res.status(400).json({ msg: "Cannot edit an already sent offer" });

    const allowed = [
      "offeredSalary","ctcCurrency","joiningDate","offerExpiryDate","employeeType",
      "location","reportingTo","additionalTerms","templateKey",
      // Verzeo-style extended fields
      "trainingStartDate","trainingEndDate","internshipEndDate",
      "hoursPerWeek","workingHoursPerDay","acceptanceWindowDays",
      "noticePeriodDays","revenueTarget"
    ];
    allowed.forEach(f => { if (req.body[f] !== undefined) offer[f] = req.body[f]; });

    // If HR supplied a custom body, mark it edited and use it verbatim.
    if (typeof req.body.letterBody === "string") {
      const incoming = req.body.letterBody.trim();
      // Treat any non-empty incoming body as a manual edit
      offer.letterBody = incoming;
      offer.bodyEdited = true;
    } else if (!offer.bodyEdited) {
      // Re-generate from template if HR has not hand-edited it yet
      offer.letterBody = generateLetterBody({
        candidateName:      offer.candidateName,
        appliedFor:         offer.appliedFor,
        department:         offer.department,
        offeredSalary:      offer.offeredSalary,
        ctcCurrency:        offer.ctcCurrency,
        joiningDate:        offer.joiningDate,
        offerExpiryDate:    offer.offerExpiryDate,
        employeeType:       offer.employeeType,
        location:           offer.location,
        reportingTo:        offer.reportingTo,
        additionalTerms:    offer.additionalTerms,
        trainingStartDate:  offer.trainingStartDate,
        trainingEndDate:    offer.trainingEndDate,
        internshipEndDate:  offer.internshipEndDate,
        hoursPerWeek:       offer.hoursPerWeek,
        workingHoursPerDay: offer.workingHoursPerDay,
        acceptanceWindowDays: offer.acceptanceWindowDays,
        noticePeriodDays:   offer.noticePeriodDays,
        revenueTarget:      offer.revenueTarget
      }, offer.templateKey);
    }

    await offer.save();
    return res.json({ msg: "Offer updated", offer });
  } catch (err) {
    console.error("UPDATE OFFER ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// Build the short cover-note body that accompanies the PDF attachment.
function buildCoverNote(offer) {
  const isIntern = (offer.employeeType || "").toLowerCase() === "intern";
  return [
    `Dear ${offer.candidateName},`,
    "",
    isIntern
      ? `Congratulations! Please find attached your Internship Offer Letter from Zyntrix Software Solutions for the role of ${offer.appliedFor}.`
      : `Congratulations! Please find attached your Offer Letter from Zyntrix Software Solutions for the role of ${offer.appliedFor}.`,
    "",
    `Kindly review the letter, sign the relevant pages, and reply to this email with the signed copy along with the documents listed in the Annexure.`,
    "",
    `Should you have any questions, please contact us at ` +
      (process.env.COMPANY_HR_EMAIL || "hr@zyntrixsoftware.com") + ".",
    "",
    "Warm regards,",
    "HR Department",
    process.env.COMPANY_NAME || "Zyntrix Software Solutions Pvt. Ltd."
  ].join("\n");
}

// Build the offer data shape that generateOfferPDF / generateLetterBody both consume
function offerToLetterData(offer) {
  return {
    candidateName:        offer.candidateName,
    appliedFor:           offer.appliedFor,
    department:           offer.department,
    employeeType:         offer.employeeType,
    offeredSalary:        offer.offeredSalary,
    ctcCurrency:          offer.ctcCurrency,
    joiningDate:          offer.joiningDate,
    offerExpiryDate:      offer.offerExpiryDate,
    location:             offer.location,
    reportingTo:          offer.reportingTo,
    additionalTerms:      offer.additionalTerms,
    trainingStartDate:    offer.trainingStartDate,
    trainingEndDate:      offer.trainingEndDate,
    internshipEndDate:    offer.internshipEndDate,
    hoursPerWeek:         offer.hoursPerWeek,
    workingHoursPerDay:   offer.workingHoursPerDay,
    acceptanceWindowDays: offer.acceptanceWindowDays,
    noticePeriodDays:     offer.noticePeriodDays,
    revenueTarget:        offer.revenueTarget
  };
}

function safeFilename(s) {
  return String(s || "candidate").replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 60);
}

// POST /api/hr/offers/:id/send — send offer letter via email (PDF attached)
exports.sendOffer = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;

    const offer = await OfferLetter.findById(req.params.id);
    if (!offer) return res.status(404).json({ msg: "Offer not found" });
    if (offer.status === "sent")
      return res.status(400).json({ msg: "Offer already sent" });

    // Generate the PDF in memory using the same template + offer data
    const pdfBuffer = await generateOfferPDF(
      offerToLetterData(offer),
      offer.templateKey || "default"
    );

    const filename = `Zyntrix_Offer_Letter_${safeFilename(offer.candidateName)}.pdf`;

    await sendEmail(
      offer.candidateEmail,
      `Offer Letter — ${offer.appliedFor} | Zyntrix Software Solutions`,
      buildCoverNote(offer),
      {
        attachments: [{
          filename,
          content:     pdfBuffer,
          contentType: "application/pdf"
        }]
      }
    );

    offer.status = "sent";
    offer.sentAt = new Date();
    offer.sentBy = req.user.id;
    await offer.save();

    return res.json({ msg: `Offer letter sent to ${offer.candidateEmail}`, offer });
  } catch (err) {
    console.error("SEND OFFER ERROR:", err);
    return res.status(500).json({ msg: "Failed to send offer: " + err.message });
  }
};

// GET /api/hr/offers/:id/pdf — download/preview the PDF version of an offer letter
exports.downloadOfferPdf = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;
    const offer = await OfferLetter.findById(req.params.id);
    if (!offer) return res.status(404).json({ msg: "Offer not found" });

    const pdfBuffer = await generateOfferPDF(
      offerToLetterData(offer),
      offer.templateKey || "default"
    );
    const filename = `Zyntrix_Offer_Letter_${safeFilename(offer.candidateName)}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    return res.end(pdfBuffer);
  } catch (err) {
    console.error("DOWNLOAD OFFER PDF ERROR:", err);
    return res.status(500).json({ msg: "Failed to render PDF: " + err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// BULK SEND — POST /api/hr/offers/bulk-send
//
// body: {
//   interviewIds: [<id>, ...],         // candidates marked offered=true on the panel
//   mode:         "perCandidate" | "shared",
//   sharedTerms?: {                    // only used when mode === "shared"
//     templateKey, employeeType, offeredSalary, ctcCurrency, joiningDate,
//     offerExpiryDate, location, reportingTo, additionalTerms,
//     trainingStartDate, trainingEndDate, internshipEndDate,
//     hoursPerWeek, workingHoursPerDay, acceptanceWindowDays,
//     noticePeriodDays, revenueTarget
//   }
// }
//
// Per-candidate mode:
//   - Uses each interview's existing OfferLetter draft (if HR already saved one).
//   - If no draft exists, falls back to safe defaults (employeeType "Full-time",
//     salary 0) and reports the issue in `warnings` so HR can fix it.
//
// Shared mode:
//   - Creates or updates each interview's OfferLetter with the supplied shared
//     terms. HR's previously-edited letter body is overwritten in shared mode.
//
// Response: { sent: [...], failed: [{interviewId, reason}], warnings: [...] }
// ─────────────────────────────────────────────────────────────────────────────
exports.bulkSendOffers = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;

    const { interviewIds, mode = "perCandidate", sharedTerms = {} } = req.body || {};
    if (!Array.isArray(interviewIds) || interviewIds.length === 0)
      return res.status(400).json({ msg: "interviewIds array is required" });
    if (!["perCandidate", "shared"].includes(mode))
      return res.status(400).json({ msg: 'mode must be "perCandidate" or "shared"' });
    if (interviewIds.length > 200)
      return res.status(400).json({ msg: "Up to 200 candidates per bulk send" });

    const interviews = await Interview.find({ _id: { $in: interviewIds } });
    const itvById    = new Map(interviews.map(i => [String(i._id), i]));

    const sent     = [];
    const failed   = [];
    const warnings = [];

    for (const id of interviewIds) {
      const interview = itvById.get(String(id));
      if (!interview) {
        failed.push({ interviewId: id, reason: "Interview not found" });
        continue;
      }
      if (!interview.offered) {
        failed.push({ interviewId: id, reason: "Not marked Offered on the Interview Panel" });
        continue;
      }
      if (!interview.candidateEmail) {
        failed.push({ interviewId: id, reason: "Candidate has no email on file" });
        continue;
      }

      try {
        // ── Resolve / create the OfferLetter document ────────────────────
        let offer = await OfferLetter.findOne({ interviewId: interview._id });

        if (mode === "shared") {
          // Apply shared terms (creates or overwrites)
          const merged = {
            interviewId:     interview._id,
            candidateName:   interview.candidateName,
            candidateEmail:  interview.candidateEmail,
            appliedFor:      interview.appliedFor,
            department:      interview.department,
            templateKey:     OFFER_TEMPLATES[sharedTerms.templateKey] ? sharedTerms.templateKey : "default",
            employeeType:    sharedTerms.employeeType    || "Full-time",
            offeredSalary:   Number(sharedTerms.offeredSalary || 0),
            ctcCurrency:     sharedTerms.ctcCurrency     || "INR",
            joiningDate:     sharedTerms.joiningDate     || "",
            offerExpiryDate: sharedTerms.offerExpiryDate || "",
            location:        sharedTerms.location        || "",
            reportingTo:     sharedTerms.reportingTo     || "",
            additionalTerms: sharedTerms.additionalTerms || "",
            trainingStartDate:    sharedTerms.trainingStartDate    || "",
            trainingEndDate:      sharedTerms.trainingEndDate      || "",
            internshipEndDate:    sharedTerms.internshipEndDate    || "",
            hoursPerWeek:         sharedTerms.hoursPerWeek         || 40,
            workingHoursPerDay:   sharedTerms.workingHoursPerDay   || 9,
            acceptanceWindowDays: sharedTerms.acceptanceWindowDays || 2,
            noticePeriodDays:     sharedTerms.noticePeriodDays     || 30,
            revenueTarget:        sharedTerms.revenueTarget        || "",
            bodyEdited:           false,
            createdBy:            req.user.id
          };
          if (!merged.offeredSalary || !merged.joiningDate) {
            failed.push({ interviewId: id, reason: "Shared mode needs offeredSalary and joiningDate" });
            continue;
          }
          merged.letterBody = generateLetterBody(merged, merged.templateKey);
          if (offer) {
            Object.assign(offer, merged);
            await offer.save();
          } else {
            offer = await OfferLetter.create({ ...merged, status: "draft" });
            await Interview.findByIdAndUpdate(interview._id, { offerId: offer._id });
          }
        } else {
          // perCandidate mode — must already have a saved offer with required terms
          if (!offer) {
            failed.push({
              interviewId: id,
              reason: "No saved offer draft. Open this candidate first and click Save, or use Shared mode."
            });
            continue;
          }
          if (!offer.offeredSalary || !offer.joiningDate) {
            failed.push({
              interviewId: id,
              reason: "Draft is missing offeredSalary or joiningDate. Open the candidate to complete it."
            });
            continue;
          }
          // Ensure letterBody is fresh if HR never edited it
          if (!offer.bodyEdited) {
            offer.letterBody = generateLetterBody(offerToLetterData(offer), offer.templateKey || "default");
            await offer.save();
          }
        }

        if (offer.status === "sent") {
          warnings.push({ interviewId: id, msg: "Offer was already sent earlier; skipped re-send" });
          continue;
        }

        // ── Generate PDF + send ──────────────────────────────────────────
        const pdfBuffer = await generateOfferPDF(
          offerToLetterData(offer),
          offer.templateKey || "default"
        );
        const filename = `Zyntrix_Offer_Letter_${safeFilename(offer.candidateName)}.pdf`;

        await sendEmail(
          offer.candidateEmail,
          `Offer Letter — ${offer.appliedFor} | Zyntrix Software Solutions`,
          buildCoverNote(offer),
          {
            attachments: [{
              filename,
              content:     pdfBuffer,
              contentType: "application/pdf"
            }]
          }
        );

        offer.status = "sent";
        offer.sentAt = new Date();
        offer.sentBy = req.user.id;
        await offer.save();

        sent.push({
          interviewId:    String(interview._id),
          offerId:        String(offer._id),
          candidateName:  offer.candidateName,
          candidateEmail: offer.candidateEmail
        });
      } catch (sendErr) {
        console.error("BULK SEND — failure for", id, ":", sendErr?.message);
        failed.push({ interviewId: id, reason: sendErr?.message || "Send failed" });
      }
    }

    return res.json({
      msg:    `Sent ${sent.length} of ${interviewIds.length}` +
              (failed.length ? `, ${failed.length} failed` : "") +
              (warnings.length ? `, ${warnings.length} warning(s)` : ""),
      sent, failed, warnings
    });
  } catch (err) {
    console.error("BULK SEND OFFERS ERROR:", err);
    return res.status(500).json({ msg: "Bulk send failed: " + err.message });
  }
};

// PATCH /api/hr/offers/:id/status — accepted / declined / expired
exports.updateOfferStatus = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;
    const { status } = req.body;
    const valid = ["draft", "sent", "accepted", "declined", "expired"];
    if (!valid.includes(status)) return res.status(400).json({ msg: "Invalid status" });

    const offer = await OfferLetter.findByIdAndUpdate(
      req.params.id, { status }, { new: true }
    );
    if (!offer) return res.status(404).json({ msg: "Offer not found" });

    // If accepted, mark the linked candidate as hired
    if (status === "accepted" && offer.interviewId) {
      const itv = await Interview.findById(offer.interviewId);
      if (itv && itv.candidateId) {
        await Candidate.findByIdAndUpdate(itv.candidateId, { status: "hired" });
      }
    }

    return res.json({ msg: "Offer status updated", offer });
  } catch (err) {
    return res.status(500).json({ msg: "Server error" });
  }
};
