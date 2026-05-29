const mongoose = require("mongoose");

const CATEGORIES = ["tech", "design", "business", "marketing", "language", "other"];
const MODES      = ["online", "offline", "hybrid"];

// Sales-side Course: pricing catalogue only.
// Content (curriculum, thumbnail, recordings) lives in the LMS — NOT here.
const courseSchema = new mongoose.Schema(
  {
    title:         { type: String, required: true, trim: true },
    slug:          { type: String, unique: true, lowercase: true, trim: true },
    description:   { type: String, default: "" },   // short sales pitch
    category:      { type: String, enum: CATEGORIES, default: "tech" },
    durationWeeks: { type: Number, default: 8 },
    price:         { type: Number, default: 0 },    // MRP
    discountPrice: { type: Number, default: 0 },    // selling price
    mode:          { type: String, enum: MODES, default: "online" },
    highlights:    { type: [String], default: [] }, // bullet selling points shown during demo
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
