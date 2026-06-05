const Candidate = require("../models/Candidate");
const ApplicationEmailLog = require("../models/ApplicationEmailLog");
const Interview = require("../models/Interview");
const mongoose  = require("mongoose");
const https     = require("https");
const {
  notifyApplicationReceived,
  notifyShortlisted,
  notifyRejected
} = require("../utils/candidateEmails");

// ── Resume upload (public apply) → stored on the VM disk ────────────────────
const multer = require("multer");
const path   = require("path");
const fs     = require("fs");
const crypto = require("crypto");
const jwt    = require("jsonwebtoken");

const RESUME_DIR = path.join(__dirname, "..", "uploads", "resumes");
fs.mkdirSync(RESUME_DIR, { recursive: true });

const _resumeUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, RESUME_DIR),
    filename:    (req, file, cb) => cb(null, crypto.randomUUID() + ".pdf"),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },               // 5 MB
  fileFilter: (req, file, cb) => {
    const ok = file.mimetype === "application/pdf" || /\.pdf$/i.test(file.originalname || "");
    cb(ok ? null : new Error("Only PDF resumes are allowed"), ok);
  },
}).single("resume");

// Tolerant wrapper: surfaces multer errors as clean JSON, never crashes the route.
exports.uploadResumeMw = function (req, res, next) {
  _resumeUpload(req, res, function (err) {
    if (err) return res.status(400).json({ success: false, error: err.message });
    next();
  });
};


function checkHrAccess(req, res) {
  if (!["hr", "super_admin"].includes(req.user.role)) {
    res.status(403).json({ msg: "Access denied" });
    return false;
  }
  return true;
}

// Defensive: ensure the JWT-derived user id is something MongoDB can cast
// to ObjectId. If not, we'd otherwise CastError inside deleteMany and surface
// a useless "Internal server error" to the user.
function requireValidUserId(req, res) {
  const id = req.user?.id;
  if (!id || !mongoose.isValidObjectId(id)) {
    res.status(401).json({ msg: "Auth token user id is invalid — please log out and back in." });
    return null;
  }
  return id;
}

// ─────────────────────────────────────────────────────────────────────────────
// LIST CANDIDATES
// GET /api/hr/candidates?status=new|shortlisted|rejected&search=...
// ─────────────────────────────────────────────────────────────────────────────
exports.getCandidates = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;

    const { status, search, importBatchId } = req.query;
    const query = {};
    if (status)         query.status         = status;
    if (importBatchId)  query.importBatchId  = importBatchId;
    if (search) {
      query.$or = [
        { name:       { $regex: search, $options: "i" } },
        { email:      { $regex: search, $options: "i" } },
        { phone:      { $regex: search, $options: "i" } },
        { appliedFor: { $regex: search, $options: "i" } }
      ];
    }

    const candidates = await Candidate.find(query)
      .sort({ createdAt: -1 })
      .populate("interviewId", "overallStatus offered");

    return res.json({ candidates, total: candidates.length });
  } catch (err) {
    console.error("GET CANDIDATES ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// BULK IMPORT
// POST /api/hr/candidates/bulk-import
// body: { candidates: [{name,email,phone,appliedFor,department,raw}], importedFrom }
// ─────────────────────────────────────────────────────────────────────────────
exports.bulkImport = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;
    const userId = requireValidUserId(req, res);
    if (!userId) return;

    const { candidates = [], importedFrom = "manual" } = req.body;
    if (!Array.isArray(candidates) || candidates.length === 0) {
      return res.status(400).json({ msg: "candidates array is required" });
    }
    // Hard cap: payload sanity check (Express body limit is 10kb in server.js,
    // so 142 rows × 16 cols may bump up against this — see note below.)
    if (candidates.length > 10000) {
      return res.status(413).json({ msg: "Too many rows in one import (max 10,000)" });
    }

    const validSources = ["xlsx","csv","tsv","html","pdf","google_sheets","onedrive","manual"];
    const source = validSources.includes(importedFrom) ? importedFrom : "manual";
    const importBatchId = `${source}-${Date.now()}`;

    // ── Build docs DEFENSIVELY ────────────────────────────────────────────
    // Map first (trim/normalize all fields) THEN filter — the original code
    // filtered before trimming, so rows with whitespace-only name/email
    // slipped through and later failed Mongoose `required: true` validation,
    // which threw a BulkWriteError → "Internal server error".
    //
    // We also collect rejected rows so HR sees what was dropped and why,
    // and we preserve the FULL original row in `raw` so client-specific
    // custom columns aren't lost (those are displayed in the "Details" modal).
    const rejected = [];
    const docs     = [];

    candidates.forEach((c, idx) => {
      const name  = String(c?.name  || "").trim().slice(0, 200);
      const email = String(c?.email || "").trim().toLowerCase().slice(0, 200);

      // Basic sanity check on email (must contain "@" and a "." after it)
      const looksLikeEmail = /^\S+@\S+\.\S+$/.test(email);

      if (!name && !email)            { rejected.push({ idx, reason: "name & email empty" }); return; }
      if (!name)                       { rejected.push({ idx, reason: "name empty" });         return; }
      if (!email)                      { rejected.push({ idx, reason: "email empty" });        return; }
      if (!looksLikeEmail)             { rejected.push({ idx, reason: "email invalid: " + email }); return; }

      docs.push({
        name,
        email,
        phone:        String(c?.phone      || "").trim().slice(0, 50),
        appliedFor:   String(c?.appliedFor || "").trim().slice(0, 200),
        department:   String(c?.department || "").trim().slice(0, 100),
        resumeUrl:    String(c?.resumeUrl  || "").trim().slice(0, 500),
        status:       "new",
        importedFrom: source,
        importBatchId,
        raw:          c?.raw || {},        // full original row — all 16 columns preserved
        createdBy:    req.user.id
      });
    });

    if (docs.length === 0) {
      return res.status(400).json({
        msg: "No valid rows. Every candidate needs a non-empty Name AND a valid Email address.",
        rejectedSamples: rejected.slice(0, 5)
      });
    }

    // ── REPLACE-ON-IMPORT ─────────────────────────────────────────────────
    // A new import wipes the previous candidate roster AND the related
    // interview records. Interviews where offered=true are preserved (those
    // have legal offer letters attached).
    const wipedInterviews = await Interview.deleteMany({
      createdBy: req.user.id,
      offered:   { $ne: true }
    });
    const wipedCandidates = await Candidate.deleteMany({
      createdBy: req.user.id
    });

    // ── insertMany with partial-success handling ──────────────────────────
    // ordered:false continues past individual row failures. We avoid the
    // `rawResult` option since it behaves differently across Mongoose major
    // versions; instead we count the resolved array directly, and on
    // BulkWriteError we compute insertedCount from writeErrors.
    console.log(
      `[BULK IMPORT] user=${req.user?.id} validDocs=${docs.length} ` +
      `wipedCandidates=${wipedCandidates.deletedCount} wipedInterviews=${wipedInterviews.deletedCount}`
    );

    let insertedCount  = 0;
    const insertErrors = [];

    try {
      const inserted = await Candidate.insertMany(docs, { ordered: false });
      insertedCount = Array.isArray(inserted) ? inserted.length : 0;
    } catch (bulkErr) {
      // Could be a BulkWriteError (some rows failed) or a real error.
      // Log everything so Railway logs tell us exactly what went wrong.
      console.error("[BULK IMPORT] insertMany error:", {
        name:    bulkErr?.name,
        message: bulkErr?.message,
        code:    bulkErr?.code,
        hasWriteErrors: !!(bulkErr?.writeErrors && bulkErr.writeErrors.length)
      });

      const writeErrs = Array.isArray(bulkErr?.writeErrors) ? bulkErr.writeErrors : [];
      if (writeErrs.length) {
        // Partial success: total - failed
        insertedCount = Math.max(0, docs.length - writeErrs.length);
        writeErrs.slice(0, 10).forEach(e => insertErrors.push({
          index: e?.index ?? null,
          msg:   e?.errmsg || e?.err?.errmsg || String(e)
        }));
      } else {
        // Not a bulk-write error — re-throw so the outer catch can return
        // a meaningful 500 with the real message (not just "Internal error").
        throw bulkErr;
      }
    }

    const skipped = (candidates.length - docs.length) + (docs.length - insertedCount);

    // ── FIRE-AND-FORGET: send "Application Received" email to each new candidate.
    // We don't await — Office365 can be slow and we don't want the import HTTP
    // response to wait for 100+ SMTP roundtrips. Each send is independently
    // logged; failures don't affect the import response.
    // HR can suppress application emails entirely for an import by passing
    // sendEmails=false (query) or sendApplicationEmails:false (body) — e.g. when
    // loading historical data that should NOT be emailed.
    const sendApplicationEmails =
      String(req.query.sendEmails) !== "false" &&
      req.body.sendApplicationEmails !== false;

    setImmediate(async () => {
      try {
        if (!sendApplicationEmails) {
          await Candidate.updateMany(
            { createdBy: req.user.id, importBatchId },
            { $set: { applicationEmailSentAt: new Date() } }
          );
          console.log(`[bulkImport] sendEmails=false — marked batch ${importBatchId} as notified WITHOUT emailing`);
          return;
        }
        const fresh = await Candidate.find({
          createdBy:     req.user.id,
          importBatchId,
          applicationEmailSentAt: null
        }).select("_id name email appliedFor");

        // Email each address only ONCE, ever. Two layers of protection:
        //   • emailedAddresses  — de-dupes repeated rows within THIS import.
        //   • ApplicationEmailLog — a persistent collection that survives the
        //     import wipe, so RE-importing the same roster never re-emails a
        //     candidate who was already notified in a previous import.
        const emailedAddresses = new Set();
        for (const c of fresh) {
          const addr = String(c.email || "").trim().toLowerCase();

          // Already emailed in this batch, or in a previous import? Skip the send.
          const alreadyLogged = addr
            ? await ApplicationEmailLog.findOne({ createdBy: req.user.id, email: addr }).lean()
            : null;
          if (addr && (emailedAddresses.has(addr) || alreadyLogged)) {
            await Candidate.updateOne(
              { _id: c._id },
              { $set: { applicationEmailSentAt: new Date() } }
            );
            continue;
          }

          const result = await notifyApplicationReceived(c);
          if (result.sent) {
            if (addr) {
              emailedAddresses.add(addr);
              // Record persistently so future imports won't re-email this address.
              try {
                await ApplicationEmailLog.updateOne(
                  { createdBy: req.user.id, email: addr },
                  { $setOnInsert: { sentAt: new Date() } },
                  { upsert: true }
                );
              } catch (e) { /* duplicate-key race is fine */ }
            }
            await Candidate.updateOne(
              { _id: c._id },
              { $set: { applicationEmailSentAt: new Date() } }
            );
          }
          // Small breathing room to be friendly to Office365 rate limits
          await new Promise(r => setTimeout(r, 300));
        }
        console.log(`[bulkImport] application emails dispatched for batch ${importBatchId}`);
      } catch (e) {
        console.error("[bulkImport] async email dispatch error:", e.message);
      }
    });

    return res.status(201).json({
      msg: `Imported ${insertedCount} candidates` +
           ` (replaced ${wipedCandidates.deletedCount} previous, cleared ${wipedInterviews.deletedCount} pending interviews` +
           (skipped > 0 ? `, skipped ${skipped} invalid rows` : "") +
           "). Application-received emails are being sent in the background.)",
      count:             insertedCount,
      replacedCount:     wipedCandidates.deletedCount,
      clearedInterviews: wipedInterviews.deletedCount,
      skipped,
      rejectedSamples:   rejected.slice(0, 5),
      insertErrors:      insertErrors,
      importBatchId
    });
  } catch (err) {
    console.error("BULK IMPORT CANDIDATES ERROR:", err);
    return res.status(500).json({ msg: "Import failed: " + (err.message || "unknown error") });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// SHORTLIST — creates an Interview record and flips candidate status
// POST /api/hr/candidates/:id/shortlist
// ─────────────────────────────────────────────────────────────────────────────
exports.shortlistCandidate = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;

    const candidate = await Candidate.findById(req.params.id);
    if (!candidate) return res.status(404).json({ msg: "Candidate not found" });

    // Find the existing interview if already shortlisted; otherwise create it.
    // We do NOT early-return on "already shortlisted" — so if a prior attempt
    // never actually emailed the candidate, clicking Shortlist again retries it.
    let interview = null;
    if (candidate.status === "shortlisted" && candidate.interviewId) {
      interview = await Interview.findById(candidate.interviewId);
    }
    if (!interview) {
      interview = await Interview.create({
        candidateId:    candidate._id,
        candidateName:  candidate.name,
        candidateEmail: candidate.email,
        candidatePhone: candidate.phone,
        appliedFor:     candidate.appliedFor || "—",
        department:     candidate.department,
        round1: { status: "pending", durationMin: 50 },
        round2: { status: "pending", durationMin: 50 },
        round3: { status: "pending", durationMin: 50 },
        overallStatus:  "in_progress",
        createdBy:      req.user.id
      });
      candidate.status      = "shortlisted";
      candidate.interviewId = interview._id;
      await candidate.save();
    }

    // Send shortlist email via GAS (updates col N in the Sheet AND emails the candidate).
    // Always called — the backend's shortlistEmailSentAt guard prevents re-sends on
    // repeated clicks, and GAS's own EMAIL_SENT_FLAG (col R) provides a second guard.
    // Respond immediately so the button works on a SINGLE click. The GAS email
    // call (302 redirects + Gmail send) can take several seconds and must not
    // block the HTTP response — otherwise the UI looks frozen and HR clicks again.
    res.status(201).json({ msg: "Shortlisted", candidate, interview, emailQueued: true });

    // Fire the shortlist email in the background.
    if (!interview.shortlistEmailSentAt) {
      notifyShortlisted(interview)
        .then(r => {
          if (r && r.sent) {
            interview.shortlistEmailSentAt = new Date();
            return interview.save();
          }
          console.warn("[shortlist] email not sent:", r && r.reason);
        })
        .catch(e => console.error("[shortlist] email error:", e.message));
    }
    return;
  } catch (err) {
    console.error("SHORTLIST CANDIDATE ERROR:", err);
    return res.status(500).json({ msg: "Server error: " + err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// REJECT
// PATCH /api/hr/candidates/:id/reject
// ─────────────────────────────────────────────────────────────────────────────
exports.rejectCandidate = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;
    const c = await Candidate.findByIdAndUpdate(
      req.params.id, { status: "rejected" }, { new: true }
    );
    if (!c) return res.status(404).json({ msg: "Candidate not found" });

    // Send rejection email (only once — gate on rejectionEmailSentAt)
    let emailResult = { sent: false };
    if (!c.rejectionEmailSentAt) {
      emailResult = await notifyRejected(c);
      if (emailResult.sent) {
        c.rejectionEmailSentAt = new Date();
        await c.save();
      }
    }

    return res.json({
      msg:           "Rejected",
      candidate:     c,
      emailDelivered: emailResult.sent,
      emailReason:    emailResult.reason || undefined
    });
  } catch (err) {
    console.error("REJECT CANDIDATE ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE
// DELETE /api/hr/candidates/:id
// ─────────────────────────────────────────────────────────────────────────────
exports.deleteCandidate = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;
    const c = await Candidate.findByIdAndDelete(req.params.id);
    if (!c) return res.status(404).json({ msg: "Candidate not found" });

    // If they had an associated interview, drop it too (only if not yet offered)
    if (c.interviewId) {
      await Interview.findOneAndDelete({ _id: c.interviewId, offered: false });
    }

    return res.json({ msg: "Candidate deleted" });
  } catch (err) {
    return res.status(500).json({ msg: "Server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// IMPORT FROM URL  (Google Sheets / OneDrive)
// POST /api/hr/candidates/import-from-link
// body: { url }
// Server-side fetch to avoid browser CORS. Returns the raw CSV/text so the
// browser can parse it client-side with the same parser used for files.
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC JOB APPLICATION — no auth required
// POST /api/apply
//
// Accepts the same JSON body that the GAS web app used to receive:
//   { fullName, email, phone, position, qualifications, experience,
//     stateAddress, edtech, availability, source, declaration,
//     resumeBase64 (optional), resumeName (optional) }
//
// Saves to MongoDB, syncs to Google Sheet, and sends confirmation email.
// ─────────────────────────────────────────────────────────────────────────────
exports.applyForJob = async (req, res) => {
  try {
    const d = req.body || {};
    const name  = (d.fullName  || d.name  || "").trim();
    const email = (d.email     || "").trim().toLowerCase();
    const phone = (d.phone     || "").trim();
    const role  = (d.position  || d.appliedFor || "").trim();

    if (!name || !email) {
      return res.status(400).json({ success: false, error: "Name and email are required." });
    }

    // Save candidate to MongoDB
    const candidate = await Candidate.create({
      name,
      email,
      phone,
      appliedFor:   role,
      department:   d.department || "",
      importedFrom: "manual",
      raw: {
        qualifications : d.qualifications || "",
        experience     : d.experience     || "",
        stateAddress   : d.stateAddress   || "",
        edtech         : d.edtech         || "",
        availability   : d.availability   || "",
        source         : d.source         || "",
        declaration    : d.declaration    || "",
        timestamp      : d.timestamp      || new Date().toISOString(),
      }
    });

    // Attach the uploaded resume (multipart file) or legacy base64; store on disk.
    try {
      let storedName = null;
      if (req.file) {
        storedName = req.file.filename;             // multer already wrote it to RESUME_DIR
      } else if (d.resumeBase64) {
        storedName = crypto.randomUUID() + ".pdf";
        fs.writeFileSync(path.join(RESUME_DIR, storedName), Buffer.from(d.resumeBase64, "base64"));
      }
      if (storedName) {
        candidate.resumeFile = storedName;
        candidate.resumeUrl  = `/api/hr/resume/${candidate._id}`;
        await candidate.save();
      }
    } catch (fileErr) {
      console.warn("[apply] resume save failed:", fileErr.message);
    }

    // Send application-received email (fire-and-forget — never block the response)
    notifyApplicationReceived(candidate).catch(err =>
      console.warn("[apply] confirmation email failed:", err.message)
    );

    return res.status(201).json({ success: true, status: "success" });
  } catch (err) {
    console.error("APPLY ERROR:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
};


exports.importFromLink = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;

    const rawUrl = (req.body?.url || "").trim();
    if (!rawUrl) return res.status(400).json({ msg: "url is required" });

    // Convert known shared-link patterns into direct download URLs
    const fetchUrl = normalizeSharedLink(rawUrl);

    const { body, contentType } = await httpsGet(fetchUrl);

    // Detect format hint from contentType (xlsx vs csv)
    const isXlsx = /spreadsheetml|excel|octet-stream/i.test(contentType) ||
                   /\.xlsx(\?|$)/i.test(fetchUrl);

    return res.json({
      msg:      "Fetched",
      format:   isXlsx ? "xlsx" : "csv",
      // For xlsx we return base64 so the browser can hand it to xlsx.js;
      // for csv/html/tsv we return raw text.
      data:     isXlsx ? body.toString("base64") : body.toString("utf8"),
      bytes:    body.length,
      source:   detectSource(rawUrl)
    });
  } catch (err) {
    console.error("IMPORT FROM LINK ERROR:", err);
    return res.status(400).json({
      msg: "Could not fetch the link. Make sure it is publicly accessible " +
           "(Google Sheets: File → Share → 'Anyone with the link'; " +
           "OneDrive: use the 'Embed' or 'Share → Anyone with the link' URL). Error: " + err.message
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function normalizeSharedLink(url) {
  // Google Sheets — turn /edit links into /export?format=csv
  // Example: https://docs.google.com/spreadsheets/d/<ID>/edit#gid=0
  //       => https://docs.google.com/spreadsheets/d/<ID>/export?format=csv&gid=0
  const gSheets = url.match(/docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_-]+)/);
  if (gSheets) {
    const id  = gSheets[1];
    const gid = (url.match(/[?&#]gid=(\d+)/) || [])[1] || "0";
    return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
  }

  // OneDrive — convert share link to direct download
  //   https://1drv.ms/x/s!XXX  → resolved via redirect (handled by httpsGet follow)
  //   https://onedrive.live.com/?...  → add &download=1 if not present
  if (/onedrive\.live\.com|1drv\.ms|sharepoint\.com/i.test(url)) {
    if (!/[?&]download=1/.test(url)) {
      return url + (url.includes("?") ? "&" : "?") + "download=1";
    }
  }

  return url;
}

function detectSource(url) {
  if (/docs\.google\.com\/spreadsheets/i.test(url))   return "google_sheets";
  if (/onedrive|1drv\.ms|sharepoint/i.test(url))      return "onedrive";
  return "manual";
}

// Minimal HTTPS GET that follows redirects (so Google's 302 to googleusercontent works)
function httpsGet(url, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    try {
      const req = https.get(url, {
        headers: { "User-Agent": "ZyntrixCRM/1.0", "Accept": "*/*" }
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          if (redirectsLeft <= 0) return reject(new Error("Too many redirects"));
          return resolve(httpsGet(res.headers.location, redirectsLeft - 1));
        }
        if (res.statusCode >= 400) {
          return reject(new Error("HTTP " + res.statusCode));
        }
        const chunks = [];
        res.on("data", c => chunks.push(c));
        res.on("end",  () => resolve({
          body:        Buffer.concat(chunks),
          contentType: res.headers["content-type"] || ""
        }));
      });
      req.on("error", reject);
      req.setTimeout(15000, () => req.destroy(new Error("Timeout")));
    } catch (e) {
      reject(e);
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/hr/resume/:id — stream a candidate's resume PDF.
// Protected: requires a valid login JWT, accepted via the Authorization header
// OR a ?token= query param (so HR can open the link directly in a browser tab).
// ─────────────────────────────────────────────────────────────────────────────
exports.downloadResume = async (req, res) => {
  let token = "";
  const hdr = req.headers.authorization || "";
  if (hdr.startsWith("Bearer ")) token = hdr.slice(7);
  if (!token && req.query.token) token = String(req.query.token);
  try {
    jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ msg: "Unauthorized - please log in to view resumes" });
  }
  try {
    const c = await Candidate.findById(req.params.id).select("resumeFile name");
    if (!c || !c.resumeFile) return res.status(404).json({ msg: "Resume not found" });
    const filePath = path.join(RESUME_DIR, c.resumeFile);
    if (!fs.existsSync(filePath)) return res.status(404).json({ msg: "Resume file missing on server" });
    const safe = String(c.name || "resume").replace(/[^a-z0-9]+/gi, "_");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${safe}_resume.pdf"`);
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    return res.status(500).json({ msg: "Download error: " + err.message });
  }
};
