const Interview   = require("../models/Interview");
const OfferLetter = require("../models/OfferLetter");
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

// GET /api/hr/interviews  — list all candidates (with optional filter)
exports.getInterviews = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;

    const { status, search } = req.query;
    const query = {};
    if (status)  query.overallStatus   = status;
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

// GET /api/hr/interviews/passed  — ONLY candidates who passed all rounds
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

// POST /api/hr/interviews  — add new candidate
exports.createInterview = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;

    const { candidateName, candidateEmail, candidatePhone, appliedFor, department, rounds, notes } = req.body;
    if (!candidateName || !candidateEmail || !appliedFor)
      return res.status(400).json({ msg: "candidateName, candidateEmail and appliedFor are required" });

    const interview = await Interview.create({
      candidateName, candidateEmail, candidatePhone,
      appliedFor, department,
      rounds: rounds || [],
      notes,
      createdBy: req.user.id
    });

    return res.status(201).json({ msg: "Interview record created", interview });
  } catch (err) {
    console.error("CREATE INTERVIEW ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// PATCH /api/hr/interviews/:id/round  — update a single round result
exports.updateRound = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;

    const { roundIndex, status, remarks, conductedBy } = req.body;
    if (roundIndex === undefined || !status)
      return res.status(400).json({ msg: "roundIndex and status are required" });

    const interview = await Interview.findById(req.params.id);
    if (!interview) return res.status(404).json({ msg: "Interview not found" });

    if (!interview.rounds[roundIndex])
      return res.status(400).json({ msg: "Round index out of range" });

    interview.rounds[roundIndex].status      = status;
    interview.rounds[roundIndex].remarks     = remarks || "";
    interview.rounds[roundIndex].conductedBy = conductedBy || "";
    interview.rounds[roundIndex].conductedAt = new Date();

    // ── Auto-derive overallStatus ────────────────────────────────
    const anyFailed  = interview.rounds.some(r => r.status === "failed");
    const allPassed  = interview.rounds.length > 0 &&
                       interview.rounds.every(r => r.status === "passed");

    if (anyFailed)       interview.overallStatus = "failed";
    else if (allPassed)  interview.overallStatus = "passed";
    else                 interview.overallStatus = "in_progress";

    await interview.save();
    return res.json({ msg: "Round updated", interview });
  } catch (err) {
    console.error("UPDATE ROUND ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// PATCH /api/hr/interviews/:id/status  — manually override overall status
exports.updateInterviewStatus = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;

    const { status } = req.body;
    const valid = ["in_progress", "passed", "failed", "on_hold"];
    if (!valid.includes(status))
      return res.status(400).json({ msg: "Invalid status" });

    const interview = await Interview.findByIdAndUpdate(
      req.params.id,
      { overallStatus: status },
      { new: true }
    );
    if (!interview) return res.status(404).json({ msg: "Interview not found" });

    return res.json({ msg: "Status updated", interview });
  } catch (err) {
    return res.status(500).json({ msg: "Server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// OFFER LETTER PANEL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * generateLetterBody — auto-fills the offer letter template
 * with the candidate's real data.
 * ✅ YES — this is fully automatic. HR doesn't type the candidate name manually.
 */
function generateLetterBody(data) {
  const today = new Date().toLocaleDateString("en-IN", {
    day: "2-digit", month: "long", year: "numeric"
  });

  return `
Date: ${today}

To,
${data.candidateName}

Subject: Offer of Employment — ${data.appliedFor}

Dear ${data.candidateName},

We are pleased to offer you the position of ${data.appliedFor} at Zyntrix Software Pvt. Ltd.,
in the ${data.department || "respective"} department.

Your employment details are as follows:

  • Position       : ${data.appliedFor}
  • Department     : ${data.department || "—"}
  • Employee Type  : ${data.employeeType}
  • Location       : ${data.location || "Zyntrix Office"}
  • Reporting To   : ${data.reportingTo || "Respective Manager"}
  • Date of Joining: ${data.joiningDate}
  • CTC Offered    : ₹${Number(data.offeredSalary).toLocaleString("en-IN")} per annum
  • Offer Valid Until: ${data.offerExpiryDate || "—"}

${data.additionalTerms ? `Additional Terms:\n${data.additionalTerms}\n` : ""}
Please confirm your acceptance of this offer by replying to this email before the offer expiry date.

We look forward to having you on the Zyntrix team!

Warm regards,
HR Department
Zyntrix Software Pvt. Ltd.
hr@zyntrixsoftware.com
`.trim();
}

// GET /api/hr/offers  — list all offer letters
exports.getOffers = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;

    const { status } = req.query;
    const query = status ? { status } : {};

    const offers = await OfferLetter.find(query)
      .populate("interviewId", "rounds overallStatus")
      .populate("sentBy", "name")
      .sort({ createdAt: -1 });

    return res.json({ offers, total: offers.length });
  } catch (err) {
    console.error("GET OFFERS ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// GET /api/hr/offers/:id  — single offer letter (preview)
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

// POST /api/hr/offers  — create offer letter for a passed candidate
exports.createOffer = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;

    const { interviewId, offeredSalary, joiningDate, offerExpiryDate,
            employeeType, location, reportingTo, additionalTerms } = req.body;

    if (!interviewId || !offeredSalary || !joiningDate)
      return res.status(400).json({ msg: "interviewId, offeredSalary and joiningDate are required" });

    // Fetch the interview — must be "passed"
    const interview = await Interview.findById(interviewId);
    if (!interview)
      return res.status(404).json({ msg: "Interview not found" });
    if (interview.overallStatus !== "passed")
      return res.status(400).json({ msg: "Offer can only be created for candidates who have passed all rounds" });

    // Auto-generate the letter body with candidate details
    const letterData = {
      candidateName:  interview.candidateName,
      candidateEmail: interview.candidateEmail,
      appliedFor:     interview.appliedFor,
      department:     interview.department,
      offeredSalary, joiningDate, offerExpiryDate,
      employeeType: employeeType || "Full-time",
      location, reportingTo, additionalTerms
    };

    const letterBody = generateLetterBody(letterData);

    const offer = await OfferLetter.create({
      interviewId,
      candidateName:   interview.candidateName,
      candidateEmail:  interview.candidateEmail,
      appliedFor:      interview.appliedFor,
      department:      interview.department,
      offeredSalary, joiningDate, offerExpiryDate,
      employeeType: employeeType || "Full-time",
      location, reportingTo, additionalTerms,
      letterBody,
      status: "draft",
      createdBy: req.user.id
    });

    // Link offer back to interview
    await Interview.findByIdAndUpdate(interviewId, { offerId: offer._id });

    return res.status(201).json({ msg: "Offer letter created", offer });
  } catch (err) {
    console.error("CREATE OFFER ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// PUT /api/hr/offers/:id  — edit offer letter (before sending)
exports.updateOffer = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;

    const offer = await OfferLetter.findById(req.params.id);
    if (!offer) return res.status(404).json({ msg: "Offer not found" });
    if (offer.status === "sent")
      return res.status(400).json({ msg: "Cannot edit an already sent offer" });

    const allowed = ["offeredSalary","joiningDate","offerExpiryDate","employeeType",
                     "location","reportingTo","additionalTerms"];
    allowed.forEach(f => { if (req.body[f] !== undefined) offer[f] = req.body[f]; });

    // Re-generate letter body with updated terms
    offer.letterBody = generateLetterBody({
      candidateName:   offer.candidateName,
      candidateEmail:  offer.candidateEmail,
      appliedFor:      offer.appliedFor,
      department:      offer.department,
      offeredSalary:   offer.offeredSalary,
      joiningDate:     offer.joiningDate,
      offerExpiryDate: offer.offerExpiryDate,
      employeeType:    offer.employeeType,
      location:        offer.location,
      reportingTo:     offer.reportingTo,
      additionalTerms: offer.additionalTerms
    });

    await offer.save();
    return res.json({ msg: "Offer updated", offer });
  } catch (err) {
    console.error("UPDATE OFFER ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// POST /api/hr/offers/:id/send  — send offer letter via hr@zyntrixsoftware.com
exports.sendOffer = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;

    const offer = await OfferLetter.findById(req.params.id);
    if (!offer) return res.status(404).json({ msg: "Offer not found" });
    if (offer.status === "sent")
      return res.status(400).json({ msg: "Offer already sent" });

    // Send email to candidate
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

// PATCH /api/hr/offers/:id/status  — mark as accepted / declined / expired
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
    return res.json({ msg: "Offer status updated", offer });
  } catch (err) {
    return res.status(500).json({ msg: "Server error" });
  }
};
