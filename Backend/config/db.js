const mongoose = require("mongoose");

const connectDB = async () => {
  try {

    const uri = process.env.MONGO_URI;

    if (!uri) {
      throw new Error("❌ Mongo URI not found in .env");
    }

    await mongoose.connect(uri);

    console.log("✅ MongoDB Atlas Connected 🚀");

  } catch (err) {
    console.error("❌ DB Error:", err.message);
    process.exit(1);
  }
};

module.exports = connectDB;