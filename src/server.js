require("dotenv").config();
const http = require("http");
const app = require("./app");
const connectDb = require("./config/db");
const redis = require("./config/redis");

const PORT = process.env.PORT || 3000;

(async () => {
  try {
    await connectDb();
    redis.on("connect", () => {
      console.log("Connected to Redis");
    });

    const server = http.createServer(app);

    server.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start server", err);
    process.exit(1);
  }
})();
