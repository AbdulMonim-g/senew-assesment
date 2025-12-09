const Product = require("../models/Product");
const redis = require("../config/redis");
const ApiError = require("../utils/ApiError");

async function createProduct(payload) {
  const product = await Product.create({
    name: payload.name,
    sku: payload.sku,
    price: payload.price,
    totalStock: payload.totalStock,
    soldStock: 0
  });

  const baseKey = `product:${product._id.toString()}`;
  await redis.mset({
    [`${baseKey}:total`]: product.totalStock,
    [`${baseKey}:available`]: product.totalStock,
    [`${baseKey}:reserved`]: 0,
    [`${baseKey}:sold`]: 0
  });

  return product.toObject();
}

async function getProductStatus(productId) {
  const product = await Product.findById(productId).lean();
  if (!product) {
    throw new ApiError(404, "Product not found");
  }

  const baseKey = `product:${productId}`;
  const [reservedRaw, soldRaw, availableRaw, totalRaw] = await redis.mget(
    `${baseKey}:reserved`,
    `${baseKey}:sold`,
    `${baseKey}:available`,
    `${baseKey}:total`
  );

  const totalStock = product.totalStock;
  const reservedStock = parseInt(reservedRaw || "0", 10);
  const soldStockRedis = parseInt(soldRaw || "0", 10);
  const availableStockRedis = parseInt(availableRaw || "0", 10);

  const soldStock = product.soldStock != null ? product.soldStock : soldStockRedis;
  const availableStock = Number.isNaN(availableStockRedis)
    ? Math.max(totalStock - reservedStock - soldStock, 0)
    : availableStockRedis;

  return {
    productId: product._id.toString(),
    name: product.name,
    sku: product.sku,
    totalStock,
    reservedStock,
    soldStock,
    availableStock
  };
}

module.exports = {
  createProduct,
  getProductStatus
};
