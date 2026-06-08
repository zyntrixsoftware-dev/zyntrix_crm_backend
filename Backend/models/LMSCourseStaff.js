const mongoose = require("mongoose");
const s = new mongoose.Schema({
  course:         { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true, unique: true },
  instructor:     { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  instructorName: { type: String, default: "" },
  assignedBy:     { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true });
module.exports = mongoose.model("LMSCourseStaff", s);
