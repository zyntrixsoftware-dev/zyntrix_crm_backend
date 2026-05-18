const Interview   = require("../models/Interview");
const OfferLetter = require("../models/OfferLetter");
const Candidate   = require("../models/Candidate");
const sendEmail   = require("../utils/sendEmail");

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

const OFFER_TEMPLATES = {
  default: {
    key:   "default",
    label: "Default",
    intro: "We are pleased to offer you the position of {{appliedFor}} at Zyntrix Software Pvt. Ltd."
  },
  engineer: {
    key:   "engineer",
    label: "Engineering",
    intro: "We are excited to extend an offer for the role of {{appliedFor}} on the Zyntrix Engineering team. " +
           "Your experience and technical strengths impressed us through every round of our interview process."
  },
  sales: {
    key:   "sales",
    label: "Sales",
    intro: "We are delighted to offer you the position of {{appliedFor}} in the Zyntrix Sales organization. " +
           "Your drive and customer-first mindset stood out across all interview rounds."
  },
  intern: {
    key:   "intern",
    label: "Internship",
    intro: "We are happy to offer you an internship as a {{appliedFor}} at Zyntrix Software Pvt. Ltd. " +
           "This will be a fixed-term programme designed to give you hands-on experience."
  },
  manager: {
    key:   "manager",
    label: "Manager / Lead",
    intro: "We are pleased to extend an offer for the leadership role of {{appliedFor}} at Zyntrix Software Pvt. Ltd. " +
           "We are confident you will be a strong addition to our leadership team."
  }
};

function fillIntro(template, data) {
  return (template.intro || "").replace(/\{\{appliedFor\}\}/g, data.appliedFor || "the role");
}

function generateLetterBody(data, templateKey = "default") {
  const template = OFFER_TEMPLATES[templateKey] || OFFER_TEMPLATES.default;
  const today    = new Date().toLocaleDateString("en-IN", {
    day: "2-digit", month: "long", year: "numeric"
  });
  const intro    = fillIntro(template, data);
  const salary   = Number(data.offeredSalary || 0).toLocaleString("en-IN");

  return `
Date: ${today}

To,
${data.candidateName}

Subject: Offer of Employment — ${data.appliedFor}

Dear ${data.candidateName},

${intro}

Your employment details are as follows:

  • Position         : ${data.appliedFor}
  • Department       : ${data.department || "—"}
  • Employee Type    : ${data.employeeType || "Full-time"}
  • Location         : ${data.location || "Zyntrix Office"}
  • Reporting To     : ${data.reportingTo || "Respective Manager"}
  • Date of Joining  : ${data.joiningDate}
  • CTC Offered      : ₹${salary} per annum
  • Offer Valid Until: ${data.offerExpiryDate || "—"}

${data.additionalTerms ? "Additional Terms:\n" + data.additionalTerms + "\n" : ""}
Please confirm your acceptance of this offer by replying to this email before the offer expiry date.

We look forward to having you on the Zyntrix team!

Warm regards,
HR Department
Zyntrix Software Pvt. Ltd.
hr@zyntrixsoftware.com
`.trim();
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
      joiningDate:    req.body.joiningDate    || "",
      offerExpiryDate:req.body.offerExpiryDate|| "",
      employeeType:   req.body.employeeType   || "Full-time",
      location:       req.body.location       || "",
      reportingTo:    req.body.reportingTo    || "",
      additionalTerms:req.body.additionalTerms|| ""
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

    const { interviewId, offeredSalary, joiningDate, offerExpiryDate,
            employeeType, location, reportingTo, additionalTerms,
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

    const letterData = {
      candidateName:  interview.candidateName,
      candidateEmail: interview.candidateEmail,
      appliedFor:     interview.appliedFor,
      department:     interview.department,
      offeredSalary, joiningDate, offerExpiryDate,
      employeeType: employeeType || "Full-time",
      location, reportingTo, additionalTerms
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

    const allowed = ["offeredSalary","joiningDate","offerExpiryDate","employeeType",
                     "location","reportingTo","additionalTerms","templateKey"];
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
        candidateName:   offer.candidateName,
        appliedFor:      offer.appliedFor,
        department:      offer.department,
        offeredSalary:   offer.offeredSalary,
        joiningDate:     offer.joiningDate,
        offerExpiryDate: offer.offerExpiryDate,
        employeeType:    offer.employeeType,
        location:        offer.location,
        reportingTo:     offer.reportingTo,
        additionalTerms: offer.additionalTerms
      }, offer.templateKey);
    }

    await offer.save();
    return res.json({ msg: "Offer updated", offer });
  } catch (err) {
    console.error("UPDATE OFFER ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// POST /api/hr/offers/:id/send — send offer letter via email
exports.sendOffer = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;

    const offer = await OfferLetter.findById(req.params.id);
    if (!offer) return res.status(404).json({ msg: "Offer not found" });
    if (offer.status === "sent")
      return res.status(400).json({ msg: "Offer already sent" });

    await sendEmail(
      offer.candidateEmail,
      `Offer Letter — ${offer.appliedFor} | Zyntrix Software`,
      offer.letterBody
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
