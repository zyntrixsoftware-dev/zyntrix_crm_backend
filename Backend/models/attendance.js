const mongoose = require("mongoose");

const attendanceSchema = new mongoose.Schema({
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  date:     { type: String, required: true },   // "YYYY-MM-DD"
  punchIn:  { type: Date },
  punchOut: { type: Date }
});

// FIX: unique index prevents duplicate punch-in records even under concurrent requests
attendanceSchema.index({ userId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("Attendance", attendanceSchema);
