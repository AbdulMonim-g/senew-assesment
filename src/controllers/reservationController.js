const reservationService = require("../services/reservationService");
const {
  validateCreateReservation,
  validateReservationAction
} = require("../validation/reservationValidation");

async function createReservation(req, res, next) {
  try {
    const payload = validateCreateReservation(req.body);
    const reservation = await reservationService.createReservation(payload.userId, payload.items);
    res.status(201).json(reservation);
  } catch (err) {
    next(err);
  }
}

async function checkoutReservation(req, res, next) {
  try {
    const { reservationId, userId } = validateReservationAction({ ...req.params, ...req.body });
    const order = await reservationService.checkoutReservation(reservationId, userId);
    res.json(order);
  } catch (err) {
    next(err);
  }
}

async function cancelReservation(req, res, next) {
  try {
    const { reservationId, userId } = validateReservationAction({ ...req.params, ...req.body });
    const result = await reservationService.cancelReservation(reservationId, userId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createReservation,
  checkoutReservation,
  cancelReservation
};
