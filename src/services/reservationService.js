const { randomUUID } = require("crypto");
const Product = require("../models/Product");
const Order = require("../models/Order");
const redis = require("../config/redis");
const ApiError = require("../utils/ApiError");
const { RESERVATION_TTL_SECONDS } = require("../config/constants");
const { scheduleExpiration, clearExpiration } = require("./reservationScheduler");

function productKeys(productId) {
  const base = `product:${productId}`;
  return {
    base,
    availableKey: `${base}:available`,
    reservedKey: `${base}:reserved`,
    soldKey: `${base}:sold`
  };
}

async function createReservation(userId, items) {
  const productIds = items.map((i) => i.productId);
  const products = await Product.find({ _id: { $in: productIds } }).lean();
  if (products.length !== productIds.length) {
    throw new ApiError(400, "One or more products not found");
  }

  const productMap = new Map(products.map((p) => [p._id.toString(), p]));

  const normalizedItems = items.map((item) => {
    const product = productMap.get(item.productId);
    if (!product) {
      throw new ApiError(400, `Product not found: ${item.productId}`);
    }
    if (item.quantity > product.totalStock) {
      throw new ApiError(400, `Requested quantity exceeds total stock for product ${product._id}`);
    }
    return {
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: product.price,
      name: product.name,
      sku: product.sku
    };
  });

  const booked = [];
  try {
    for (const item of normalizedItems) {
      const { availableKey, reservedKey } = productKeys(item.productId);
      const newAvailable = await redis.decrby(availableKey, item.quantity);
      if (newAvailable < 0) {
        await redis.incrby(availableKey, item.quantity);
        for (const b of booked) {
          const keys = productKeys(b.productId);
          await redis.incrby(keys.availableKey, b.quantity);
          await redis.decrby(keys.reservedKey, b.quantity);
        }
        throw new ApiError(409, `Insufficient stock for product ${item.productId}`);
      }
      await redis.incrby(reservedKey, item.quantity);
      booked.push(item);
    }
  } catch (err) {
    throw err;
  }

  const reservationId = randomUUID();
  const now = Date.now();
  const ttlMs = RESERVATION_TTL_SECONDS * 1000;
  const expiresAt = now + ttlMs;

  const reservationKey = `reservation:${reservationId}`;
  const reservation = {
    id: reservationId,
    userId,
    status: "PENDING",
    items: normalizedItems,
    createdAt: now,
    expiresAt
  };

  await redis.set(reservationKey, JSON.stringify(reservation), "EX", RESERVATION_TTL_SECONDS);

  scheduleExpiration(reservationId, ttlMs, expireReservationInternal);

  return {
    reservationId,
    userId,
    expiresAt,
    items: normalizedItems
  };
}

async function loadReservation(reservationId) {
  const key = `reservation:${reservationId}`;
  const data = await redis.get(key);
  if (!data) {
    return null;
  }
  try {
    return JSON.parse(data);
  } catch (err) {
    console.error("Failed to parse reservation", reservationId, err);
    return null;
  }
}

async function saveReservation(reservation) {
  const key = `reservation:${reservation.id}`;
  await redis.set(key, JSON.stringify(reservation), "EX", RESERVATION_TTL_SECONDS);
}

async function releaseReservationStock(reservation) {
  for (const item of reservation.items) {
    const { availableKey, reservedKey } = productKeys(item.productId);
    await redis.incrby(availableKey, item.quantity);
    await redis.decrby(reservedKey, item.quantity);
  }
}

async function expireReservationInternal(reservationId) {
  const reservation = await loadReservation(reservationId);
  if (!reservation) {
    return;
  }
  if (reservation.status !== "PENDING") {
    return;
  }

  const now = Date.now();
  if (reservation.expiresAt > now) {
    const delayMs = reservation.expiresAt - now;
    scheduleExpiration(reservationId, delayMs, expireReservationInternal);
    return;
  }

  await releaseReservationStock(reservation);
  reservation.status = "EXPIRED";
  await saveReservation(reservation);
}

async function cancelReservation(reservationId, userId) {
  const reservation = await loadReservation(reservationId);
  if (!reservation) {
    throw new ApiError(404, "Reservation not found or expired");
  }
  if (reservation.userId !== userId) {
    throw new ApiError(403, "Cannot cancel reservation of another user");
  }
  if (reservation.status !== "PENDING") {
    throw new ApiError(400, "Reservation is not pending");
  }

  await releaseReservationStock(reservation);
  reservation.status = "CANCELLED";
  await saveReservation(reservation);
  clearExpiration(reservationId);

  return { status: "CANCELLED" };
}

async function checkoutReservation(reservationId, userId) {
  const reservation = await loadReservation(reservationId);
  if (!reservation) {
    throw new ApiError(404, "Reservation not found or expired");
  }
  if (reservation.userId !== userId) {
    throw new ApiError(403, "Cannot checkout reservation of another user");
  }
  if (reservation.status !== "PENDING") {
    throw new ApiError(400, "Reservation is not pending");
  }

  const now = Date.now();
  if (reservation.expiresAt <= now) {
    await releaseReservationStock(reservation);
    reservation.status = "EXPIRED";
    await saveReservation(reservation);
    clearExpiration(reservationId);
    throw new ApiError(410, "Reservation expired");
  }

  const productIds = reservation.items.map((i) => i.productId);
  const products = await Product.find({ _id: { $in: productIds } }).lean();
  const productMap = new Map(products.map((p) => [p._id.toString(), p]));

  let totalAmount = 0;
  const orderItems = [];
  for (const item of reservation.items) {
    const product = productMap.get(item.productId);
    if (!product) {
      throw new ApiError(400, `Product not found: ${item.productId}`);
    }
    const unitPrice = item.unitPrice != null ? item.unitPrice : product.price;
    const lineAmount = unitPrice * item.quantity;
    totalAmount += lineAmount;
    orderItems.push({
      product: item.productId,
      quantity: item.quantity,
      unitPrice
    });
  }

  let orderDoc = await Order.create({
    userId,
    items: orderItems,
    totalAmount,
    reservationId,
    status: "PAID"
  });

  for (const item of reservation.items) {
    await Product.updateOne(
      { _id: item.productId },
      { $inc: { soldStock: item.quantity } }
    );
  }

  for (const item of reservation.items) {
    const { reservedKey, soldKey } = productKeys(item.productId);
    await redis.decrby(reservedKey, item.quantity);
    await redis.incrby(soldKey, item.quantity);
  }

  reservation.status = "COMPLETED";
  await saveReservation(reservation);
  clearExpiration(reservationId);

  return orderDoc.toObject();
}

module.exports = {
  createReservation,
  cancelReservation,
  checkoutReservation
};
