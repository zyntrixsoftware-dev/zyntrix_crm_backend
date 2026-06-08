const mongoose = require("mongoose");
const lmsModuleSchema = new mongoose.Schema({
  course:      { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
  title:       { type: String, required: true, trim: true },
  description: { type: String, default: "" },
  order:       { type: Number, default: 0 },
  isPublished: { type: Boolean, default: true },
  createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });
lmsModuleSchema.index({ course: 1, order: 1 });
module.exports = mongoose.model("LMSModule", lmsModuleSchema);
