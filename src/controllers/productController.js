const productService = require("../services/productService");
const { validateCreateProduct, validateProductStatus } = require("../validation/productValidation");

async function createProduct(req, res, next) {
  try {
    const payload = validateCreateProduct(req.body);
    const product = await productService.createProduct(payload);
    res.status(201).json(product);
  } catch (err) {
    next(err);
  }
}

async function getProductStatus(req, res, next) {
  try {
    const params = validateProductStatus(req.params);
    const status = await productService.getProductStatus(params.productId);
    res.json(status);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createProduct,
  getProductStatus
};
