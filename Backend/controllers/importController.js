const multer       = require("multer");
const XLSX         = require("xlsx");
const SchemaConfig = require("../models/SchemaConfig");
const DynamicRecord= require("../models/DynamicRecord");

// ── MULTER: memory storage (no temp files on disk) ──────────────────────────
const storage = multer.memoryStorage();
exports.upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },   // 10 MB max
  fileFilter: (req, file, cb) => {
    const ok = /\.(xlsx|xls|csv)$/.test(file.originalname.toLowerCase());
    cb(ok ? null : new Error("Only .xlsx / .xls / .csv files allowed"), ok);
  }
});

// ── POST /api/import/upload ──────────────────────────────────────────────────
// multipart body fields:
//   system   – "hrms" | "sales" | "employee"
//   type     – "candidates" | "deals" | "leads" | etc.
//   mapping  – JSON string: [{excelHeader, systemKey, label, dataType}]
// file field: "file"
exports.uploadAndSave = async (req, res) => {
  try {
    const { system, type } = req.body;
    if (!system || !type) return res.status(400).json({ msg: "system and type are required" });
    if (!req.file)        return res.status(400).json({ msg: "No file uploaded" });

    const clientId = req.user.id;

    // 1. Parse Excel / CSV
    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheet    = workbook.Sheets[workbook.SheetNames[0]];
    const rows     = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    if (rows.length === 0) return res.status(400).json({ msg: "The file has no data rows" });

    // 2. Parse mapping
    let fields;
    try { fields = JSON.parse(req.body.mapping); }
    catch { return res.status(400).json({ msg: "mapping must be valid JSON" }); }

    if (!Array.isArray(fields) || fields.length === 0)
      return res.status(400).json({ msg: "mapping cannot be empty" });

    // 3. Upsert schema config
    await SchemaConfig.findOneAndUpdate(
      { clientId, system, type },
      { clientId, system, type, fields },
      { upsert: true, new: true }
    );

    // 4. Replace all old records for this system+type, insert fresh
    await DynamicRecord.deleteMany({ clientId, system, type });

    const docs = rows.map(row => {
      const mapped = {};
      fields.forEach(f => {
        const raw = row[f.excelHeader];
        if (raw !== undefined && raw !== "") mapped[f.systemKey] = raw;
      });
      return { clientId, system, type, data: mapped };
    });

    await DynamicRecord.insertMany(docs);

    return res.json({ msg: "Import successful", count: docs.length });
  } catch (err) {
    console.error("IMPORT UPLOAD ERROR:", err);
    return res.status(500).json({ msg: "Import failed: " + err.message });
  }
};

// ── GET /api/import/schema?system=hrms&type=candidates ───────────────────────
exports.getSchema = async (req, res) => {
  try {
    const { system, type } = req.query;
    if (!system || !type) return res.status(400).json({ msg: "system and type required" });

    const schema = await SchemaConfig.findOne({ clientId: req.user.id, system, type });
    if (!schema) return res.json({ fields: [], configured: false });

    return res.json({ ...schema.toObject(), configured: true });
  } catch (err) {
    console.error("GET SCHEMA ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// ── GET /api/import/records?system=hrms&type=candidates&page=1&limit=100 ─────
exports.getRecords = async (req, res) => {
  try {
    const { system, type } = req.query;
    if (!system || !type) return res.status(400).json({ msg: "system and type required" });

    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(500, parseInt(req.query.limit) || 100);

    const [docs, total] = await Promise.all([
      DynamicRecord.find({ clientId: req.user.id, system, type })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      DynamicRecord.countDocuments({ clientId: req.user.id, system, type })
    ]);

    const records = docs.map(d => ({ _id: d._id, createdAt: d.createdAt, ...d.data }));

    return res.json({ records, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error("GET RECORDS ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// ── PUT /api/import/record/:id ───────────────────────────────────────────────
exports.updateRecord = async (req, res) => {
  try {
    const doc = await DynamicRecord.findOne({ _id: req.params.id, clientId: req.user.id });
    if (!doc) return res.status(404).json({ msg: "Record not found" });

    doc.data = { ...doc.data, ...req.body };
    doc.markModified("data");
    await doc.save();

    return res.json({ _id: doc._id, ...doc.data });
  } catch (err) {
    console.error("UPDATE RECORD ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// ── DELETE /api/import/record/:id ────────────────────────────────────────────
exports.deleteRecord = async (req, res) => {
  try {
    const result = await DynamicRecord.findOneAndDelete({
      _id: req.params.id,
      clientId: req.user.id
    });
    if (!result) return res.status(404).json({ msg: "Record not found" });
    return res.json({ msg: "Deleted" });
  } catch (err) {
    console.error("DELETE RECORD ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// ── POST /api/import/record ───────────────────────────────────────────────────
// Create a single new record (used by Add Lead / Add Deal modals)
exports.createRecord = async (req, res) => {
  try {
    const { system, type, data } = req.body;
    if (!system || !type || !data) return res.status(400).json({ msg: "system, type, and data are required" });

    const clientId = req.user.id;

    // Verify schema exists for this system+type before inserting
    const schema = await SchemaConfig.findOne({ clientId, system, type });
    if (!schema) return res.status(404).json({ msg: "No schema configured for this system/type. Import an Excel first." });

    const doc = await DynamicRecord.create({ clientId, system, type, data });
    return res.status(201).json({ _id: doc._id, createdAt: doc.createdAt, ...doc.data });
  } catch (err) {
    console.error("CREATE RECORD ERROR:", err);
    return res.status(500).json({ msg: "Server error: " + err.message });
  }
};

// ── PATCH /api/import/bulk-update ────────────────────────────────────────────
// Bulk-update a field across multiple records (used by Bulk Status in Leads)
exports.bulkUpdate = async (req, res) => {
  try {
    const { ids, updates, system, type } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ msg: "ids must be a non-empty array" });
    if (!updates || typeof updates !== "object") return res.status(400).json({ msg: "updates object is required" });

    const clientId = req.user.id;

    // Build $set payload that targets nested data fields
    const setPayload = {};
    for (const [k, v] of Object.entries(updates)) {
      setPayload[`data.${k}`] = v;
    }

    const result = await DynamicRecord.updateMany(
      { _id: { $in: ids }, clientId, system, type },
      { $set: setPayload }
    );

    return res.json({ msg: "Bulk update successful", modifiedCount: result.modifiedCount });
  } catch (err) {
    console.error("BULK UPDATE ERROR:", err);
    return res.status(500).json({ msg: "Server error: " + err.message });
  }
};

// ── DELETE /api/import/all?system=hrms&type=candidates ───────────────────────
exports.deleteAll = async (req, res) => {
  try {
    const { system, type } = req.query;
    if (!system || !type) return res.status(400).json({ msg: "system and type required" });

    const result = await DynamicRecord.deleteMany({ clientId: req.user.id, system, type });
    await SchemaConfig.deleteOne({ clientId: req.user.id, system, type });

    return res.json({ msg: "All records deleted", count: result.deletedCount });
  } catch (err) {
    console.error("DELETE ALL ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// ── GET /api/import/headers  (reads file headers without saving) ─────────────
// Used by the import wizard to preview column names before mapping
exports.previewHeaders = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ msg: "No file" });

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheet    = workbook.Sheets[workbook.SheetNames[0]];
    const rows     = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    if (rows.length === 0) return res.json({ headers: [], sampleRow: {} });

    const headers   = Object.keys(rows[0]);
    const sampleRow = rows[0];

    return res.json({ headers, sampleRow, rowCount: rows.length });
  } catch (err) {
    console.error("PREVIEW ERROR:", err);
    return res.status(500).json({ msg: "Could not read file" });
  }
};
