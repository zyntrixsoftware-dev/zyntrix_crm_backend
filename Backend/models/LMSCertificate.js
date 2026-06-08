const mongoose = require("mongoose");
const s = new mongoose.Schema({
  student:       { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  course:        { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
  certificateNo: { type: String, required: true, unique: true },
  studentName:   { type: String, default: "" },
  courseTitle:   { type: String, default: "" },
  issuedAt:      { type: Date, default: Date.now },
  issuedBy:      { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true });
s.index({ student: 1, course: 1 }, { unique: true });
module.exports = mongoose.model("LMSCertificate", s);
