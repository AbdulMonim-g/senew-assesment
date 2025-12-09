const ApiError = require("../utils/ApiError");

function errorHandler(err, req, res, next) {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      error: err.message
    });
  }

  console.error(err);
  res.status(500).json({ error: "Internal Server Error" });
}

module.exports = errorHandler;
