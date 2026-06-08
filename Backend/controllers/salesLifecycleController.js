const mongoose = require("mongoose");
const Quote  = require("../models/SalesQuote");
const Ticket = require("../models/SupportTicket");
const validId = (id) => mongoose.Types.ObjectId.isValid(id);
function canSales(req, res) {
  const ok = req.user && ["sales","presales","postsales","super_admin","admin"].includes(req.user.role);
  if (!ok) { res.status(403).json({ msg: "Sales access only" }); return false; }
  return true;
}
// ── QUOTES ───────────────────────────────────────────────────────────────────
exports.listQuotes = async (req, res) => {
  if (!canSales(req, res)) return;
  try { const quotes = await Quote.find({}).sort({ createdAt: -1 }).limit(200).lean(); return res.json({ quotes }); }
  catch (e) { console.error("listQuotes:", e); return res.status(500).json({ msg: "Server error" }); }
};
exports.createQuote = async (req, res) => {
  if (!canSales(req, res)) return;
  try {
    const b = req.body || {};
    if (!b.prospectName) return res.status(400).json({ msg: "prospectName required" });
    const q = await Quote.create({
      prospectName: b.prospectName, lead: validId(b.lead) ? b.lead : null,
      course: validId(b.course) ? b.course : null, courseTitle: b.courseTitle || "",
      basePrice: b.basePrice || 0, discountPct: b.discountPct || 0, gstPct: b.gstPct != null ? b.gstPct : 18,
      total: b.total || 0, status: b.status || "sent", notes: b.notes || "",
      createdBy: req.user.id, createdByName: req.user.name || "",
    });
    return res.json({ quote: q });
  } catch (e) { console.error("createQuote:", e); return res.status(500).json({ msg: "Server error" }); }
};
exports.updateQuote = async (req, res) => {
  if (!canSales(req, res)) return;
  try {
    const allow = ["prospectName","courseTitle","basePrice","discountPct","gstPct","total","status","notes"];
    const upd = {}; allow.forEach(k => { if (req.body[k] !== undefined) upd[k] = req.body[k]; });
    const q = await Quote.findByIdAndUpdate(req.params.id, upd, { new: true });
    if (!q) return res.status(404).json({ msg: "Not found" });
    return res.json({ quote: q });
  } catch (e) { return res.status(500).json({ msg: "Server error" }); }
};
exports.deleteQuote = async (req, res) => {
  if (!canSales(req, res)) return;
  try { await Quote.findByIdAndDelete(req.params.id); return res.json({ msg: "Deleted" }); }
  catch (e) { return res.status(500).json({ msg: "Server error" }); }
};
// ── SUPPORT TICKETS ──────────────────────────────────────────────────────────
exports.listTickets = async (req, res) => {
  if (!canSales(req, res)) return;
  try {
    const q = {}; if (req.query.status) q.status = req.query.status;
    const tickets = await Ticket.find(q).sort({ createdAt: -1 }).limit(300).lean();
    return res.json({ tickets });
  } catch (e) { console.error("listTickets:", e); return res.status(500).json({ msg: "Server error" }); }
};
exports.createTicket = async (req, res) => {
  if (!canSales(req, res)) return;
  try {
    const b = req.body || {};
    if (!b.studentName || !b.subject) return res.status(400).json({ msg: "studentName and subject required" });
    const t = await Ticket.create({
      studentName: b.studentName, studentEmail: b.studentEmail || "",
      enrollment: validId(b.enrollment) ? b.enrollment : null,
      subject: b.subject, category: b.category || "Other", priority: b.priority || "medium",
      status: "open", createdBy: req.user.id,
    });
    return res.json({ ticket: t });
  } catch (e) { console.error("createTicket:", e); return res.status(500).json({ msg: "Server error" }); }
};
exports.updateTicket = async (req, res) => {
  if (!canSales(req, res)) return;
  try {
    const allow = ["status","priority","category","subject"];
    const upd = {}; allow.forEach(k => { if (req.body[k] !== undefined) upd[k] = req.body[k]; });
    const t = await Ticket.findByIdAndUpdate(req.params.id, upd, { new: true });
    if (!t) return res.status(404).json({ msg: "Not found" });
    return res.json({ ticket: t });
  } catch (e) { return res.status(500).json({ msg: "Server error" }); }
};
exports.replyTicket = async (req, res) => {
  if (!canSales(req, res)) return;
  try {
    const t = await Ticket.findById(req.params.id); if (!t) return res.status(404).json({ msg: "Not found" });
    if (!req.body.message) return res.status(400).json({ msg: "message required" });
    t.replies.push({ by: req.user.id, byName: req.user.name || "", message: req.body.message });
    if (req.body.status) t.status = req.body.status;
    await t.save(); return res.json({ ticket: t });
  } catch (e) { return res.status(500).json({ msg: "Server error" }); }
};
exports.deleteTicket = async (req, res) => {
  if (!canSales(req, res)) return;
  try { await Ticket.findByIdAndDelete(req.params.id); return res.json({ msg: "Deleted" }); }
  catch (e) { return res.status(500).json({ msg: "Server error" }); }
};
