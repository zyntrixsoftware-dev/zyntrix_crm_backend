const mongoose = require("mongoose");

const dynamicRecordSchema = new mongoose.Schema({
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  system:   { type: String, required: true },
  type:     { type: String, required: true },
  data:     { type: mongoose.Schema.Types.Mixed, required: true }
}, { timestamps: true });

dynamicRecordSchema.index({ clientId: 1, system: 1, type: 1 });

module.exports = mongoose.model("DynamicRecord", dynamicRecordSchema);
