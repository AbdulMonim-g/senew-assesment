const Joi = require("joi");
const ApiError = require("../utils/ApiError");

const createProductSchema = Joi.object({
  name: Joi.string().min(1).max(255).required(),
  sku: Joi.string().min(1).max(255).optional(),
  price: Joi.number().min(0).required(),
  totalStock: Joi.number().integer().min(1).required()
});

const productStatusSchema = Joi.object({
  productId: Joi.string().required()
});

function validateCreateProduct(body) {
  const { value, error } = createProductSchema.validate(body);
  if (error) {
    throw new ApiError(400, error.details[0].message);
  }
  return value;
}

function validateProductStatus(params) {
  const { value, error } = productStatusSchema.validate(params);
  if (error) {
    throw new ApiError(400, error.details[0].message);
  }
  return value;
}

module.exports = {
  validateCreateProduct,
  validateProductStatus
};
