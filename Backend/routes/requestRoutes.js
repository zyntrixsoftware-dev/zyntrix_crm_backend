const express = require("express");
const {
  createRequest,
  getMyRequests
} = require("../controllers/requestController");
const auth = require("../middleware/authMiddleware");

const router = express.Router();

// Employee self-service (mounted at /api/requests)
router.post("/",   auth, createRequest);
router.get("/my",  auth, getMyRequests);

module.exports = router;
