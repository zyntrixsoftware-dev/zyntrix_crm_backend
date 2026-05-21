const express = require("express");
const {
  getMyProfile,
  updateMyProfile
} = require("../controllers/employeeController");
const auth = require("../middleware/authMiddleware");

const router = express.Router();

// Logged-in employee self-service profile
router.get("/profile", auth, getMyProfile);
router.put("/profile", auth, updateMyProfile);

module.exports = router;
