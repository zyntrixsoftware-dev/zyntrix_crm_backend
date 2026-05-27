const mongoose = require("mongoose");

const BATCH_STATUSES = ["upcoming", "ongoing", "completed", "cancelled"];
const MODES          = ["online", "offline", "hybrid"];

const batchSchema = new mongoose.Schema(
  {
    course:      { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
    batchCode:   { type: String, required: true, trim: true, uppercase: true },
    startDate:   { type: Date, default: null },
    endDate:     { type: Date, default: null },
    schedule:    { type: String, default: "" },      // e.g. "Mon/Wed/Fri 7–9 PM"
    mode:        { type: String, enum: MODES, default: "online" },
    totalSeats:  { type: Number, default: 30 },
    seatsBooked: { type: Number, default: 0 },
    instructor:  { type: String, default: "" },
    meetingLink: { type: String, default: "" },
    venue:       { type: String, default: "" },
    notes:       { type: String, default: "" },
    status:      { type: String, enum: BATCH_STATUSES, default: "upcoming" },
    createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: "User" }
  },
  { timestamps: true }
);

batchSchema.index({ course: 1, status: 1 });
batchSchema.index({ batchCode: 1 }, { unique: true });
batchSchema.index({ startDate: 1 });

batchSchema.virtual("seatsAvailable").get(function () {
  return Math.max(0, this.totalSeats - this.seatsBooked);
});

batchSchema.statics.BATCH_STATUSES = BATCH_STATUSES;
batchSchema.statics.MODES          = MODES;

module.exports = mongoose.model("Batch", batchSchema);
