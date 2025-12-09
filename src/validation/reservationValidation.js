const Joi = require("joi");
const ApiError = require("../utils/ApiError");

const reservationItemSchema = Joi.object({
  productId: Joi.string().required(),
  quantity: Joi.number().integer().min(1).required()
});

const createReservationSchema = Joi.object({
  userId: Joi.string().min(1).required(),
  items: Joi.array().items(reservationItemSchema).min(1).required()
});

const reservationActionSchema = Joi.object({
  reservationId: Joi.string().required(),
  userId: Joi.string().min(1).required()
});

function validateCreateReservation(body) {
  const { value, error } = createReservationSchema.validate(body);
  if (error) {
    throw new ApiError(400, error.details[0].message);
  }
  return value;
}

function validateReservationAction(input) {
  const { value, error } = reservationActionSchema.validate(input);
  if (error) {
    throw new ApiError(400, error.details[0].message);
  }
  return value;
}

module.exports = {
  validateCreateReservation,
  validateReservationAction
};
