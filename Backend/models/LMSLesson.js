const mongoose = require("mongoose");
const resourceSchema = new mongoose.Schema({
  fileName: { type: String, default: "" },
  fileKey:  { type: String, default: "" },   // stored filename on disk
  fileUrl:  { type: String, default: "" },    // download route
  size:     { type: Number, default: 0 },
}, { _id: true });
const lmsLessonSchema = new mongoose.Schema({
  module:      { type: mongoose.Schema.Types.ObjectId, ref: "LMSModule", required: true },
  course:      { type: mongoose.Schema.Types.ObjectId, ref: "Course",    required: true },
  title:       { type: String, required: true, trim: true },
  type:        { type: String, enum: ["video","document","text","quiz","assignment"], default: "video" },
  videoUrl:    { type: String, default: "" },   // external embed (used if no uploaded file)
  videoFile:   { type: String, default: "" },   // self-hosted filename on VM
  videoMime:   { type: String, default: "" },
  content:     { type: String, default: "" },   // text / html body
  resources:   { type: [resourceSchema], default: [] },
  durationMin: { type: Number, default: 0 },
  order:       { type: Number, default: 0 },
  isPreview:   { type: Boolean, default: false },// free preview without enrollment
  isPublished: { type: Boolean, default: true },
  createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });
lmsLessonSchema.index({ module: 1, order: 1 });
lmsLessonSchema.index({ course: 1 });
module.exports = mongoose.model("LMSLesson", lmsLessonSchema);
