const express = require("express");
const productRoutes = require("./productRoutes");
const reservationRoutes = require("./reservationRoutes");

const router = express.Router();

router.use("/products", productRoutes);
router.use("/reservations", reservationRoutes);

module.exports = router;
