const mongoose = require("mongoose");
const lmsProgressSchema = new mongoose.Schema({
  student:        { type: mongoose.Schema.Types.ObjectId, ref: "User",      required: true },
  lesson:         { type: mongoose.Schema.Types.ObjectId, ref: "LMSLesson", required: true },
  course:         { type: mongoose.Schema.Types.ObjectId, ref: "Course",    required: true },
  status:         { type: String, enum: ["not_started","in_progress","completed"], default: "not_started" },
  lastPositionSec:{ type: Number, default: 0 },
  completedAt:    { type: Date, default: null },
}, { timestamps: true });
lmsProgressSchema.index({ student: 1, lesson: 1 }, { unique: true });
lmsProgressSchema.index({ student: 1, course: 1 });
module.exports = mongoose.model("LMSProgress", lmsProgressSchema);
