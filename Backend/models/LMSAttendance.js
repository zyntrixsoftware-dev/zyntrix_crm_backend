const mongoose = require("mongoose");
const s = new mongoose.Schema({
  session:  { type: mongoose.Schema.Types.ObjectId, ref: "LMSClassSession", required: true },
  course:   { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
  student:  { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  status:   { type: String, enum: ["present","absent","late"], default: "present" },
  markedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  source:   { type: String, enum: ["self","staff"], default: "staff" },
}, { timestamps: true });
s.index({ session: 1, student: 1 }, { unique: true });
s.index({ student: 1 });
module.exports = mongoose.model("LMSAttendance", s);
