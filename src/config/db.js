const mongoose = require("mongoose");

async function connectDb() {
  const uri = process.env.MONGO_URI || "mongodb://localhost:27017/flash_deal";
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 5000
  });
  console.log("Connected to MongoDB");
}

module.exports = connectDb;
