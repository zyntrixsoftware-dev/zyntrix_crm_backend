const Candidate = require("../models/Candidate");
const Interview = require("../models/Interview");
const https     = require("https");

function checkHrAccess(req, res) {
  if (!["hr", "super_admin"].includes(req.user.role)) {
    res.status(403).json({ msg: "Access denied" });
    return false;
  }
  return true;
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

    const { candidates = [], importedFrom = "manual" } = req.body;
    if (!Array.isArray(candidates) || candidates.length === 0) {
      return res.status(400).json({ msg: "candidates array is required" });
    }

    const validSources = ["xlsx","csv","tsv","html","pdf","google_sheets","onedrive","manual"];
    const source = validSources.includes(importedFrom) ? importedFrom : "manual";
    const importBatchId = `${source}-${Date.now()}`;

    const docs = candidates
      .filter(c => c && c.name && c.email)
      .map(c => ({
        name:         String(c.name).trim().slice(0, 200),
        email:        String(c.email).trim().toLowerCase().slice(0, 200),
        phone:        String(c.phone || "").trim().slice(0, 50),
        appliedFor:   String(c.appliedFor || "").trim().slice(0, 200),
        department:   String(c.department || "").trim().slice(0, 100),
        resumeUrl:    String(c.resumeUrl || "").trim().slice(0, 500),
        status:       "new",
        importedFrom: source,
        importBatchId,
        raw:          c.raw || {},
        createdBy:    req.user.id
      }));

    if (docs.length === 0) {
      return res.status(400).json({ msg: "No valid rows — each candidate needs at least a name and email" });
    }

    // ── REPLACE-ON-IMPORT ─────────────────────────────────────────────────
    // A new import wipes the previous candidate roster AND the related
    // interview records, so the Candidates and Interview Panel pages reflect
    // only the latest spreadsheet. We keep interviews where offered=true
    // (those have legal offer letters attached) — those will be left orphaned
    // but visible on the offer letter page.
    const wipedInterviews = await Interview.deleteMany({
      createdBy: req.user.id,
      offered:   { $ne: true }
    });
    const wipedCandidates = await Candidate.deleteMany({
      createdBy: req.user.id
    });

    const inserted = await Candidate.insertMany(docs, { ordered: false });

    return res.status(201).json({
      msg:               `Imported ${inserted.length} candidates (replaced ${wipedCandidates.deletedCount} previous, cleared ${wipedInterviews.deletedCount} pending interviews)`,
      count:             inserted.length,
      replacedCount:     wipedCandidates.deletedCount,
      clearedInterviews: wipedInterviews.deletedCount,
      skipped:           candidates.length - inserted.length,
      importBatchId
    });
  } catch (err) {
    console.error("BULK IMPORT CANDIDATES ERROR:", err);
    return res.status(500).json({ msg: "Import failed: " + err.message });
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

    if (candidate.status === "shortlisted" && candidate.interviewId) {
      // Already shortlisted — return existing interview
      const existing = await Interview.findById(candidate.interviewId);
      return res.json({ msg: "Already shortlisted", candidate, interview: existing });
    }

    // Create the interview record with 3 empty rounds (50 min each)
    const interview = await Interview.create({
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

    return res.status(201).json({ msg: "Shortlisted", candidate, interview });
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
    return res.json({ msg: "Rejected", candidate: c });
  } catch (err) {
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
