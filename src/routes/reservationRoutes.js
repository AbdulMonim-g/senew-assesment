const express = require("express");
const reservationController = require("../controllers/reservationController");

const router = express.Router();

router.post("/", reservationController.createReservation);
router.post("/:reservationId/checkout", reservationController.checkoutReservation);
router.post("/:reservationId/cancel", reservationController.cancelReservation);

module.exports = router;
