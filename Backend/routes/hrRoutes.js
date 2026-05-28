const express = require("express");
const {
  getDashboard,
  getShiftRequests,
  updateShiftRequestStatus,
  getEmployeeAttendance,
  getEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  terminateEmployee,
  reactivateEmployee,
  getDepartments,
  getHrmsDashboard,
  exportEmployees
} = require("../controllers/hrController");
const { getAllRequests, reviewRequest } = require("../controllers/requestController");
const auth = require("../middleware/authMiddleware");

const router = express.Router();

// ── LEGACY (employee system uses these) ──────────────────────────
router.get("/dashboard",                     auth, getDashboard);
router.get("/shift-requests",                auth, getShiftRequests);
router.patch("/shift-requests/:id/status",   auth, updateShiftRequestStatus);
router.get("/employee/:userId/attendance",   auth, getEmployeeAttendance);

// ── LEAVE / SHIFT-SWAP REQUESTS (HR approval) ─────────────────────
router.get("/requests",                      auth, getAllRequests);
router.patch("/requests/:id/status",         auth, reviewRequest);

// ── HRMS DASHBOARD ────────────────────────────────────────────────
router.get("/hrms/dashboard",                auth, getHrmsDashboard);

// ── EMPLOYEE MANAGEMENT ───────────────────────────────────────────
// IMPORTANT: /employees/departments and /employees/export MUST be before
// /employees/:id otherwise Express treats them as the :id param
router.get("/employees",                     auth, getEmployees);
router.get("/employees/departments",         auth, getDepartments);  // ← must be before /:id
router.get("/employees/export",              auth, exportEmployees); // ← must be before /:id
router.post("/employees",                    auth, createEmployee);
router.get("/employees/:id",                 auth, getEmployee);     // ← after named routes
router.put("/employees/:id",                 auth, updateEmployee);
router.patch("/employees/:id/terminate",     auth, terminateEmployee);
router.patch("/employees/:id/reactivate",    auth, reactivateEmployee);

// ── LIVE CAREERS SCRAPER ──────────────────────────────────────────
// Fetches https://zyntrixsoftware.com/careers/ live and returns parsed jobs as JSON.
// Called by the HRMS careers page to avoid CORS issues.
router.get("/careers/live", auth, async (req, res) => {
  try {
    const response = await fetch("https://zyntrixsoftware.com/careers/", {
      headers: { "User-Agent": "ZyntrixCRM-HRMS/1.0" },
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw new Error(`Site returned ${response.status}`);
    const html = await response.text();
    const jobs = parseCareersPage(html);
    res.json({ ok: true, jobs, fetchedAt: new Date().toISOString(), count: jobs.length });
  } catch (err) {
    console.error("[careers/live] fetch error:", err.message);
    res.status(502).json({ ok: false, msg: "Could not reach zyntrixsoftware.com/careers/", error: err.message });
  }
});

/**
 * Parse raw HTML from zyntrixsoftware.com/careers/ into structured job objects.
 * The page lists each role as: <h3>Title</h3> followed by paragraphs for
 * department, location (📍), type (💼), description, and a View Details link.
 */
function parseCareersPage(html) {
  const jobs = [];

  // Strip scripts/styles to avoid false matches inside JS strings
  const clean = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');

  // Split on <h3 tags and process each chunk
  const h3Parts = clean.split(/<h3[^>]*>/i);
  // Skip the first chunk (before any h3)
  for (let i = 1; i < h3Parts.length; i++) {
    const part = h3Parts[i];

    // Extract the h3 title (text up to closing </h3>)
    const titleMatch = part.match(/^([^<]+)<\/h3>/);
    if (!titleMatch) continue;
    const title = decodeHtmlEntities(titleMatch[1].trim());

    // Stop processing if this h3 belongs to the footer/nav area
    if (['Quick Link', 'Company', 'Contact Info', 'Contact', 'About', 'Services'].includes(title)) continue;

    // Extract all <p> texts in this block (up to next major section)
    const block = part.substring(titleMatch[0].length);
    const pMatches = [...block.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)];
    const texts = pMatches
      .map(m => m[1].replace(/<[^>]+>/g, '').trim())
      .filter(t => t.length > 0);

    // Find "View Details" link
    const linkMatch = block.match(/href="(https?:\/\/zyntrixsoftware\.com\/[^"]+)"/i);
    if (!linkMatch) continue;  // Skip if no valid job link found
    const url = linkMatch[1];

    // Categorise the paragraph texts
    let dept = '', location = '', type = '', desc = '';
    for (const t of texts) {
      const clean_t = decodeHtmlEntities(t);
      if (clean_t.includes('📍') || clean_t.startsWith('📍')) {
        location = clean_t.replace(/^📍\s*/, '').trim();
      } else if (clean_t.includes('💼') || clean_t.startsWith('💼')) {
        type = clean_t.replace(/^💼\s*/, '').trim();
      } else if (!dept && clean_t.length < 60) {
        dept = clean_t;
      } else if (!desc && clean_t.length > 20) {
        desc = clean_t;
      }
    }

    // Only include if it looks like a real job listing
    if (title && (dept || location || type)) {
      jobs.push({ title, dept, location, type, desc, url });
    }
  }

  return jobs;
}

function decodeHtmlEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    .replace(/&#8211;/g, '–')
    .replace(/&#8212;/g, '—')
    .trim();
}

module.exports = router;
