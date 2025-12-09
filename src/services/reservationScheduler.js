const redis = require("../config/redis");

const timers = new Map();

function scheduleExpiration(reservationId, delayMs, handler) {
  clearExpiration(reservationId);
  const timeout = setTimeout(() => {
    timers.delete(reservationId);
    handler(reservationId).catch((err) => {
      console.error("Failed to auto-expire reservation", reservationId, err);
    });
  }, delayMs);
  timers.set(reservationId, timeout);
}

function clearExpiration(reservationId) {
  const timeout = timers.get(reservationId);
  if (timeout) {
    clearTimeout(timeout);
    timers.delete(reservationId);
  }
}

module.exports = {
  scheduleExpiration,
  clearExpiration
};
