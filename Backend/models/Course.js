const mongoose = require("mongoose");

const CATEGORIES = ["tech", "design", "business", "marketing", "language", "other"];
const MODES      = ["online", "offline", "hybrid"];

const moduleSchema = new mongoose.Schema(
  {
    title:    { type: String, default: "" },
    duration: { type: String, default: "" }   // e.g. "2 weeks"
  },
  { _id: false }
);

const courseSchema = new mongoose.Schema(
  {
    title:         { type: String, required: true, trim: true },
    slug:          { type: String, unique: true, lowercase: true, trim: true },
    description:   { type: String, default: "" },
    category:      { type: String, enum: CATEGORIES, default: "tech" },
    durationWeeks: { type: Number, default: 8 },
    price:         { type: Number, default: 0 },
    discountPrice: { type: Number, default: 0 },
    mode:          { type: String, enum: MODES, default: "online" },
    curriculum:    { type: [moduleSchema], default: [] },
    thumbnail:     { type: String, default: "" },  // URL
    isActive:      { type: Boolean, default: true },
    createdBy:     { type: mongoose.Schema.Types.ObjectId, ref: "User" }
  },
  { timestamps: true }
);

// Auto-generate slug from title before save
courseSchema.pre("save", function (next) {
  if (this.isModified("title") && !this.slug) {
    this.slug = this.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }
  next();
});

courseSchema.index({ category: 1, isActive: 1 });
courseSchema.statics.CATEGORIES = CATEGORIES;
courseSchema.statics.MODES      = MODES;

module.exports = mongoose.model("Course", courseSchema);
