const express = require("express");
const auth    = require("../middleware/authMiddleware");
const ic      = require("../controllers/importController");

const router = express.Router();

// Preview column headers from a file (no DB write)
router.post("/preview-headers",  auth, ic.upload.single("file"), ic.previewHeaders);

// Full upload: parse + save schema + save records
router.post("/upload",           auth, ic.upload.single("file"), ic.uploadAndSave);

// Read schema config for a system+type
router.get("/schema",            auth, ic.getSchema);

// Read records for a system+type  (paginated)
router.get("/records",           auth, ic.getRecords);

// Update a single record by id
router.put("/record/:id",        auth, ic.updateRecord);

// Delete a single record by id
router.delete("/record/:id",     auth, ic.deleteRecord);

// Delete ALL records + schema for a system+type  (used by "re-import")
router.delete("/all",            auth, ic.deleteAll);

module.exports = router;
