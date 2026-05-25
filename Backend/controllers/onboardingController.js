const Onboarding  = require("../models/Onboarding");
const OfferLetter = require("../models/OfferLetter");
const Interview   = require("../models/Interview");

function checkHrAccess(req, res) {
  if (!["hr", "super_admin"].includes(req.user.role)) {
    res.status(403).json({ msg: "Access denied" });
    return false;
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// WEBHOOK — POST /api/hr/onboarding/webhook
//
// Called by the Google Apps Script onFormSubmit trigger when a candidate
// submits the document-upload Google Form. No JWT — authenticated by the
// shared ONBOARDING_WEBHOOK_SECRET env var.
//
// Expected body:
// {
//   secret:           "xxx",
//   candidateEmail:   "candidate@email.com",
//   candidateName:    "Asha Rao",
//   position:         "Software Engineer",
//   submittedAt:      "2025-05-20T10:30:00Z",   // ISO string
//   documents: {
//     tenthMarksheet:      "https://drive.google.com/...",
//     twelfthMarksheet:    "...",
//     graduationCert:      "...",
//     postGraduationCert:  "...",  // optional, may be empty
//     otherCertifications: "...",  // optional, may be empty
//     passportPhoto:       "...",
//     governmentId:        "...",
//     bankDetails:         "..."
//   }
// }
// ─────────────────────────────────────────────────────────────────────────────
exports.formWebhook = async (req, res) => {
  try {
    const secret = process.env.ONBOARDING_WEBHOOK_SECRET;
    if (secret && req.body.secret !== secret) {
      return res.status(401).json({ ok: false, error: "Invalid webhook secret" });
    }

    const { candidateEmail, candidateName, position, submittedAt, documents = {} } = req.body;
    if (!candidateEmail) return res.status(400).json({ ok: false, error: "candidateEmail required" });

    const email = candidateEmail.trim().toLowerCase();

    // Find the existing onboarding record by email (created when offer was sent)
    let ob = await Onboarding.findOne({ candidateEmail: email });

    if (!ob) {
      // Candidate submitted the form but no onboarding record exists yet
      // (edge case: form submitted before backend caught up). Create one.
      ob = new Onboarding({
        candidateEmail: email,
        candidateName:  String(candidateName || "").trim(),
        position:       String(position      || "").trim(),
        onboardingStatus: "docs_submitted"
      });
    }

    // Map the submitted document URLs into the documents sub-document
    const DOC_KEYS = [
      "tenthMarksheet", "twelfthMarksheet", "graduationCert",
      "postGraduationCert",
      "passportPhoto", "governmentId", "bankDetails", "acceptanceLetter"
    ];

    DOC_KEYS.forEach(key => {
      const url = String((documents[key] || "")).trim();
      if (url) {
        ob.documents[key] = { url, submitted: true };
      }
    });

    ob.formSubmittedAt = submittedAt ? new Date(submittedAt) : new Date();

    // Auto-advance status
    if (["offer_sent", "docs_pending"].includes(ob.onboardingStatus)) {
      ob.onboardingStatus = "docs_submitted";
    }

    await ob.save();

    console.log("[Onboarding webhook] form submitted by:", email, "| status:", ob.onboardingStatus);
    return res.json({ ok: true, onboardingId: ob._id, status: ob.onboardingStatus });
  } catch (err) {
    console.error("ONBOARDING WEBHOOK ERROR:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// CREATE — POST /api/hr/onboarding
// Called automatically by interviewOfferController.sendOffer after successful send.
// ─────────────────────────────────────────────────────────────────────────────
exports.createOnboarding = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;

    const { offerId } = req.body;
    if (!offerId) return res.status(400).json({ msg: "offerId required" });

    const offer = await OfferLetter.findById(offerId).populate("interviewId");
    if (!offer) return res.status(404).json({ msg: "Offer not found" });

    // Idempotent — don't create a duplicate
    const existing = await Onboarding.findOne({ offerId });
    if (existing) return res.json({ msg: "Onboarding record already exists", onboarding: existing });

    const ob = await Onboarding.create({
      candidateEmail: offer.candidateEmail,
      candidateName:  offer.candidateName,
      position:       offer.appliedFor,
      department:     offer.department,
      offerId:        offer._id,
      interviewId:    offer.interviewId?._id || offer.interviewId,
      joiningDate:    offer.joiningDate,
      employeeType:   offer.employeeType,
      location:       offer.location,
      reportingTo:    offer.reportingTo,
      offeredSalary:  offer.offeredSalary,
      ctcCurrency:    offer.ctcCurrency,
      onboardingStatus: "offer_sent",
      createdBy:      req.user.id
    });

    return res.status(201).json({ msg: "Onboarding record created", onboarding: ob });
  } catch (err) {
    console.error("CREATE ONBOARDING ERROR:", err);
    return res.status(500).json({ msg: "Server error: " + err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// LIST — GET /api/hr/onboarding
//   ?status=offer_sent|docs_pending|docs_submitted|docs_verified|joining_scheduled|onboarded
//   ?search=<text>
// ─────────────────────────────────────────────────────────────────────────────
exports.getOnboardings = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;

    const { status, search } = req.query;
    const query = {};
    if (status) query.onboardingStatus = status;
    if (search) {
      query.$or = [
        { candidateName:  { $regex: search, $options: "i" } },
        { candidateEmail: { $regex: search, $options: "i" } },
        { position:       { $regex: search, $options: "i" } }
      ];
    }

    const list = await Onboarding.find(query)
      .populate("offerId", "status sentAt joiningDate")
      .sort({ createdAt: -1 });

    // Attach derived doc counts
    const enriched = list.map(ob => {
      const plain = ob.toObject({ virtuals: true });
      return plain;
    });

    return res.json({ onboardings: enriched, total: enriched.length });
  } catch (err) {
    console.error("GET ONBOARDINGS ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET ONE — GET /api/hr/onboarding/:id
// ─────────────────────────────────────────────────────────────────────────────
exports.getOnboarding = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;
    const ob = await Onboarding.findById(req.params.id)
      .populate("offerId", "status sentAt joiningDate letterBody")
      .populate("interviewId", "round1 round2 round3 overallStatus")
      .populate("createdBy", "name")
      .populate("hrNotes.addedBy", "name");
    if (!ob) return res.status(404).json({ msg: "Onboarding record not found" });
    return res.json({ onboarding: ob.toObject({ virtuals: true }) });
  } catch (err) {
    return res.status(500).json({ msg: "Server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE STATUS — PATCH /api/hr/onboarding/:id/status
// body: { status: "docs_verified" }
// ─────────────────────────────────────────────────────────────────────────────
exports.updateStatus = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;

    const { status } = req.body;
    const valid = Onboarding.schema.path("onboardingStatus").enumValues;
    if (!valid.includes(status))
      return res.status(400).json({ msg: "Invalid status. Valid: " + valid.join(", ") });

    const ob = await Onboarding.findById(req.params.id);
    if (!ob) return res.status(404).json({ msg: "Onboarding record not found" });

    ob.onboardingStatus = status;
    if (status === "onboarded" && !ob.onboardedAt) ob.onboardedAt = new Date();
    await ob.save();

    return res.json({ msg: "Status updated", onboarding: ob });
  } catch (err) {
    return res.status(500).json({ msg: "Server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE CHECKLIST ITEM — PATCH /api/hr/onboarding/:id/checklist/:itemId
// body: { done: true, note?: "..." }
// Works for both itChecklist and hrChecklist.
// ─────────────────────────────────────────────────────────────────────────────
exports.updateChecklistItem = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;

    const ob = await Onboarding.findById(req.params.id);
    if (!ob) return res.status(404).json({ msg: "Onboarding record not found" });

    const { itemId } = req.params;
    const { done, note } = req.body;

    let item = ob.itChecklist.id(itemId) || ob.hrChecklist.id(itemId);
    if (!item) return res.status(404).json({ msg: "Checklist item not found" });

    item.done   = !!done;
    item.doneAt = done ? new Date() : null;
    if (note !== undefined) item.note = note;

    await ob.save();
    return res.json({ msg: "Checklist updated", onboarding: ob });
  } catch (err) {
    return res.status(500).json({ msg: "Server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// VERIFY DOCUMENT — PATCH /api/hr/onboarding/:id/documents/:docKey/verify
// Marks a specific document as verified by HR.
// ─────────────────────────────────────────────────────────────────────────────
exports.verifyDocument = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;

    const DOC_KEYS = [
      "tenthMarksheet", "twelfthMarksheet", "graduationCert",
      "postGraduationCert",
      "passportPhoto", "governmentId", "bankDetails", "acceptanceLetter"
    ];
    const { docKey } = req.params;
    if (!DOC_KEYS.includes(docKey))
      return res.status(400).json({ msg: "Invalid document key" });

    const ob = await Onboarding.findById(req.params.id);
    if (!ob) return res.status(404).json({ msg: "Onboarding record not found" });

    if (!ob.documents[docKey]) ob.documents[docKey] = {};
    ob.documents[docKey].verifiedAt = new Date();
    ob.documents[docKey].submitted  = true;

    // If all mandatory docs verified → auto-advance to docs_verified
    const mandatory = ["tenthMarksheet","twelfthMarksheet","graduationCert",
                       "passportPhoto","governmentId","bankDetails"];
    const allVerified = mandatory.every(k =>
      ob.documents[k] && ob.documents[k].verifiedAt
    );
    if (allVerified && ob.onboardingStatus === "docs_submitted") {
      ob.onboardingStatus = "docs_verified";
    }

    await ob.save();
    return res.json({ msg: "Document verified", onboarding: ob });
  } catch (err) {
    return res.status(500).json({ msg: "Server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ADD HR NOTE — POST /api/hr/onboarding/:id/notes
// body: { text: "..." }
// ─────────────────────────────────────────────────────────────────────────────
exports.addNote = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;

    const text = (req.body?.text || "").toString().trim().slice(0, 1000);
    if (!text) return res.status(400).json({ msg: "Note text required" });

    const ob = await Onboarding.findById(req.params.id);
    if (!ob) return res.status(404).json({ msg: "Onboarding record not found" });

    ob.hrNotes.push({ text, addedBy: req.user.id, addedAt: new Date() });
    await ob.save();

    return res.json({ msg: "Note added", onboarding: ob });
  } catch (err) {
    return res.status(500).json({ msg: "Server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE DETAILS — PATCH /api/hr/onboarding/:id
// Allows HR to update joining date, buddy, notes, location, reportingTo.
// ─────────────────────────────────────────────────────────────────────────────
exports.updateOnboarding = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;

    const allowed = ["joiningDate", "buddy", "notes", "location", "reportingTo"];
    const ob = await Onboarding.findById(req.params.id);
    if (!ob) return res.status(404).json({ msg: "Onboarding record not found" });

    allowed.forEach(f => { if (req.body[f] !== undefined) ob[f] = req.body[f]; });
    await ob.save();

    return res.json({ msg: "Onboarding updated", onboarding: ob });
  } catch (err) {
    return res.status(500).json({ msg: "Server error" });
  }
};
