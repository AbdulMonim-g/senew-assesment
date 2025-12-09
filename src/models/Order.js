const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    quantity: { type: Number, required: true },
    unitPrice: { type: Number, required: true }
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    items: [orderItemSchema],
    totalAmount: { type: Number, required: true },
    reservationId: { type: String, required: true },
    status: { type: String, enum: ["PAID", "CANCELLED"], default: "PAID" }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Order", orderSchema);
