const Onboarding  = require("../models/Onboarding");
const { notifyOnboarded } = require("../utils/candidateEmails");
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

    // Fire onboarding-complete email when HR marks the candidate as onboarded
    if (status === "onboarded") {
      notifyOnboarded(ob).catch(err =>
        console.warn("[updateStatus] onboarded email failed:", err.message)
      );
    }

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
// SYNC FROM GOOGLE SHEET — POST /api/hr/onboarding/sync-sheet
//
// Fetches a Google Sheets "Published CSV" (or shared export) URL from the
// request body, parses the rows, and upserts Onboarding records into MongoDB.
// Called automatically by the frontend on every page load when a sheet URL
// has been configured — no manual import needed.
//
// Expected body: { sheetUrl: "https://docs.google.com/spreadsheets/d/…" }
// ─────────────────────────────────────────────────────────────────────────────
exports.syncFromSheet = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;

    const { sheetUrl } = req.body;
    if (!sheetUrl || !sheetUrl.startsWith("https://docs.google.com/")) {
      return res.status(400).json({ msg: "A valid Google Sheets URL is required" });
    }

    // ── Build the CSV export URL from whatever URL the user pasted ─────────────
    // Google gives two distinct URL formats:
    //   1. Editing URL:   .../d/SHEET_ID/edit#gid=XXXX
    //   2. Published URL: .../d/e/LONG_PUB_ID/pubhtml?gid=XXXX&single=true
    // For format 2, the path has /d/e/LONG_ID/ — we capture "e/LONG_ID" so we
    // can reconstruct the correct base URL.
    // The gid may be ?gid=, &gid=, or #gid= (hash fragment in editing URLs).

    let sheetBase;
    const pubIdMatch = sheetUrl.match(/\/d\/(e\/[a-zA-Z0-9_-]+)\//);
    if (pubIdMatch) {
      // Published URL format: /d/e/2PACX-.../pubhtml
      sheetBase = `https://docs.google.com/spreadsheets/d/${pubIdMatch[1]}`;
    } else {
      const stdIdMatch = sheetUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
      if (!stdIdMatch) return res.status(400).json({ msg: "Could not extract spreadsheet ID from the URL" });
      sheetBase = `https://docs.google.com/spreadsheets/d/${stdIdMatch[1]}`;
    }

    const gidMatch = sheetUrl.match(/[?&#]gid=(\d+)/);
    const gidParam  = gidMatch ? `&gid=${gidMatch[1]}&single=true` : "";

    // /pub?output=csv is the only truly public endpoint — /export requires a Google login
    const csvUrl = `${sheetBase}/pub?output=csv${gidParam}`;
    console.log("[syncFromSheet] fetching:", csvUrl);

    // Fetch the CSV (Node 18+ built-in fetch, server-side — avoids browser CORS restrictions)
    let csvText;
    try {
      const resp = await fetch(csvUrl, {
        headers: { "User-Agent": "ZyntrixCRM/1.0" },
        redirect: "follow"
      });

      csvText = await resp.text();

      // Detect login wall (HTML) — happens when sheet is not published or gid is wrong
      const ct = resp.headers.get("content-type") || "";
      if (
        !resp.ok ||
        ct.includes("text/html") ||
        csvText.trimStart().startsWith("<!DOCTYPE") ||
        csvText.trimStart().startsWith("<html")
      ) {
        console.warn(`[syncFromSheet] Google returned status=${resp.status} ct=${ct} csvUrl=${csvUrl}`);
        return res.status(403).json({
          msg: `Sheet not accessible (HTTP ${resp.status}). Make sure it is published to the web and the correct tab is included.`,
          fix: "In Google Sheets: File → Share → Publish to web → select 'Entire Document' → CSV → Publish. Then save the URL again.",
          csvUrl
        });
      }
    } catch (fetchErr) {
      console.error("[syncFromSheet] fetch threw:", fetchErr.message, "csvUrl:", csvUrl);
      return res.status(502).json({
        msg: "Could not reach Google Sheets: " + fetchErr.message,
        fix: "Make sure the sheet is published: File → Share → Publish to web → CSV → Publish.",
        csvUrl
      });
    }

    // ── CSV parser (handles quoted fields) ───────────────────────────────────
    function splitLine(line) {
      const cols = []; let cur = "", inQ = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') { inQ = !inQ; continue; }
        if (ch === ',' && !inQ) { cols.push(cur); cur = ""; continue; }
        cur += ch;
      }
      cols.push(cur);
      return cols.map(c => c.trim());
    }

    const lines = csvText.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return res.json({ ok: true, synced: 0, msg: "Sheet appears empty" });

    const headers = splitLine(lines[0]);

    // ── Column detection ──────────────────────────────────────────────────────
    function findCol(...kws) {
      return headers.find(h => kws.some(k => h.toLowerCase().trim().includes(k)));
    }
    function docCol(h) {
      const lh = h.toLowerCase().trim();
      if (lh.includes("10th") || lh.includes("ssc"))                  return "tenthMarksheet";
      if (lh.includes("12th") || lh.includes("hsc"))                  return "twelfthMarksheet";
      if (lh.includes("post") && lh.includes("grad"))                 return "postGraduationCert";
      if (lh.includes("grad") || lh.includes("degree"))               return "graduationCert";
      if (lh.includes("passport"))                                     return "passportPhoto";
      if (lh.includes("government")||lh.includes("pan")||
          lh.includes("voter")    ||lh.includes("driving")||
          lh.includes("govt"))                                         return "governmentId";
      if (lh.includes("bank")||lh.includes("passbook")||
          lh.includes("account"))                                      return "bankDetails";
      if (lh.includes("accept")||lh.includes("confirmation"))         return "acceptanceLetter";
      return null;
    }

    const emailCol     = findCol("email");
    const nameCol      = findCol("full name", "name");
    const positionCol  = findCol("position", "applied for", "role");
    const timestampCol = findCol("timestamp", "submitted", "date");

    if (!emailCol) return res.status(400).json({ msg: "No email column found in sheet" });

    const docColMap = {};   // docKey → header
    headers.forEach(h => { const k = docCol(h); if (k) docColMap[k] = h; });

    const DOC_KEYS = [
      "tenthMarksheet","twelfthMarksheet","graduationCert","postGraduationCert",
      "passportPhoto","governmentId","bankDetails","acceptanceLetter"
    ];

    let synced = 0, skipped = 0;

    for (const line of lines.slice(1)) {
      const cols = splitLine(line);
      const row  = {};
      headers.forEach((h, i) => { row[h] = (cols[i] || "").trim(); });

      const email = (row[emailCol] || "").trim().toLowerCase();
      if (!email) { skipped++; continue; }

      try {
        let ob = await Onboarding.findOne({ candidateEmail: email });
        const isNew = !ob;

        if (!ob) {
          ob = new Onboarding({
            candidateEmail:   email,
            candidateName:    nameCol     ? String(row[nameCol]     || "").trim() : "",
            position:         positionCol ? String(row[positionCol] || "").trim() : "",
            onboardingStatus: "docs_submitted"
          });
        } else {
          if (!ob.candidateName && nameCol     && row[nameCol])     ob.candidateName = row[nameCol].trim();
          if (!ob.position      && positionCol && row[positionCol]) ob.position      = row[positionCol].trim();
        }

        DOC_KEYS.forEach(key => {
          const col = docColMap[key];
          if (!col) return;
          const url = (row[col] || "").trim();
          if (url && !ob.documents[key]?.url) {
            ob.documents[key] = { url, submitted: true };
          }
        });

        if (timestampCol && row[timestampCol]) {
          const parsed = new Date(row[timestampCol]);
          if (!isNaN(parsed) && !ob.formSubmittedAt) ob.formSubmittedAt = parsed;
        }

        if (["offer_sent","docs_pending"].includes(ob.onboardingStatus)) {
          ob.onboardingStatus = "docs_submitted";
        }

        await ob.save();
        synced++;
      } catch (rowErr) {
        console.error("[syncFromSheet] row error for", email, rowErr.message);
        skipped++;
      }
    }

    console.log(`[syncFromSheet] synced=${synced} skipped=${skipped}`);
    return res.json({ ok: true, synced, skipped });
  } catch (err) {
    console.error("SYNC FROM SHEET ERROR:", err);
    return res.status(500).json({ msg: "Server error: " + err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// MANUAL IMPORT — POST /api/hr/onboarding/import
//
// Lets HR import existing Google Form responses (from a CSV) directly into
// MongoDB without going through the GAS webhook pipeline.
//
// Expected body:
// {
//   candidates: [
//     {
//       candidateEmail:  "...",
//       candidateName:   "...",
//       position:        "...",
//       submittedAt:     "5/25/2026 14:56:17",   // optional, raw timestamp string
//       documents: {
//         tenthMarksheet:     "https://...",
//         twelfthMarksheet:   "https://...",
//         graduationCert:     "https://...",
//         postGraduationCert: "https://...",
//         passportPhoto:      "https://...",
//         governmentId:       "https://...",
//         bankDetails:        "https://...",
//         acceptanceLetter:   "https://..."
//       }
//     },
//     ...
//   ]
// }
// ─────────────────────────────────────────────────────────────────────────────
exports.manualImport = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;

    const { candidates } = req.body;
    if (!Array.isArray(candidates) || !candidates.length) {
      return res.status(400).json({ msg: "candidates array is required" });
    }

    const DOC_KEYS = [
      "tenthMarksheet", "twelfthMarksheet", "graduationCert",
      "postGraduationCert", "passportPhoto", "governmentId",
      "bankDetails", "acceptanceLetter"
    ];

    const results = [];

    for (const c of candidates) {
      const email = String(c.candidateEmail || "").trim().toLowerCase();
      if (!email) {
        results.push({ email: "unknown", status: "skipped", reason: "no email" });
        continue;
      }

      try {
        let ob = await Onboarding.findOne({ candidateEmail: email });
        const isNew = !ob;

        if (!ob) {
          ob = new Onboarding({
            candidateEmail:   email,
            candidateName:    String(c.candidateName || "").trim(),
            position:         String(c.position      || "").trim(),
            onboardingStatus: "docs_submitted",
            createdBy:        req.user.id
          });
        } else {
          // Update name/position only if blank on existing record
          if (!ob.candidateName && c.candidateName) ob.candidateName = String(c.candidateName).trim();
          if (!ob.position      && c.position)      ob.position      = String(c.position).trim();
        }

        // Map document URLs
        const docs = c.documents || {};
        DOC_KEYS.forEach(key => {
          const url = String(docs[key] || "").trim();
          if (url) ob.documents[key] = { url, submitted: true };
        });

        // Set form submission timestamp
        if (c.submittedAt) {
          const parsed = new Date(c.submittedAt);
          if (!isNaN(parsed)) ob.formSubmittedAt = parsed;
        }

        // Auto-advance status if still in early stages
        if (["offer_sent", "docs_pending"].includes(ob.onboardingStatus)) {
          ob.onboardingStatus = "docs_submitted";
        }

        await ob.save();
        results.push({ email, status: isNew ? "created" : "updated", id: ob._id });
      } catch (e) {
        console.error("IMPORT ROW ERROR:", e);
        results.push({ email, status: "error", reason: e.message });
      }
    }

    const imported = results.filter(r => r.status !== "error" && r.status !== "skipped").length;
    console.log(`[Onboarding manualImport] imported ${imported}/${candidates.length} records`);
    return res.json({ ok: true, results, imported, total: candidates.length });
  } catch (err) {
    console.error("MANUAL IMPORT ERROR:", err);
    return res.status(500).json({ msg: "Server error: " + err.message });
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
