# Flash Deal Cart Reservation & Checkout API

Backend API in Node.js (Express) that handles flash-deal style reservations for limited-stock products using MongoDB and Redis.

## How to start the project

1. Install dependencies

   ```bash
   npm install
   ```

2. Configure environment

   Create a `.env` file (you can copy from `.env.example`) and set:

   - `PORT` – HTTP port (default `3000`)
   - `MONGO_URI` – Mongo connection string
   - `REDIS_URL` – Redis connection string
   - `RESERVATION_TTL_SECONDS` – reservation lifetime in seconds (default `600` = 10 minutes)

3. Run MongoDB & Redis

   - MongoDB default: `mongodb://localhost:27017/flash_deal`
   - Redis default: `redis://localhost:6379`

4. Start the server

   ```bash
   npm start
   ```

   The API will be available at: `http://localhost:3000/api`

## Tech stack choices

- **Runtime / framework**: Node.js + Express – simple, fast HTTP API layer.
- **Database**: MongoDB via Mongoose – stores products and orders.
- **Cache / reservation store**: Redis via `ioredis` – keeps live stock counters and reservations with atomic operations.
- **Validation**: Joi – validates all incoming payloads.
- **Rate limiting**: `express-rate-limit` – protects the API from abuse.

## How the reservation lock logic works

- Each product has a fixed `totalStock` in MongoDB. When a product is created, `productService.createProduct` also initialises Redis keys:

  - `product:{id}:total`
  - `product:{id}:available`
  - `product:{id}:reserved`
  - `product:{id}:sold`

- To reserve stock, the client calls `POST /api/reservations` with:

  ```json
  {
    "userId": "user-1",
    "items": [
      { "productId": "<mongoId>", "quantity": 2 },
      { "productId": "<mongoId2>", "quantity": 1 }
    ]
  }
  ```

- `reservationService.createReservation` then:

  - Loads all requested products from MongoDB and checks that each requested `quantity` does not exceed that product’s `totalStock`.
  - Iterates over the items and, for each one, uses Redis to lock stock:

    - Calls `DECRBY product:{id}:available` by `quantity` (atomic in Redis).
    - If the new value is **negative**, it:
      - Reverts the current decrement.
      - Rolls back all previously locked items in this reservation by:
        - `INCRBY product:{id}:available`
        - `DECRBY product:{id}:reserved`
      - Throws `409 Conflict` (no partial reservation; all-or-nothing for multiple SKUs).
    - If the new value is non-negative, it:
      - Calls `INCRBY product:{id}:reserved` by `quantity`.
      - Records the item in a `booked` list.

- After all items are successfully locked, the service creates a reservation object with status `PENDING` and stores it in Redis under `reservation:{reservationId}` along with its `items`, `userId`, `createdAt`, and `expiresAt`.

## How expiration works

- The reservation TTL is configured via `RESERVATION_TTL_SECONDS` in `src/config/constants.js` (default 600 seconds).

- When a reservation is created, `reservationService.createReservation`:

  - Computes `expiresAt = Date.now() + RESERVATION_TTL_SECONDS * 1000`.
  - Stores the reservation JSON in Redis at `reservation:{reservationId}` with `EX RESERVATION_TTL_SECONDS` so Redis automatically deletes it after the TTL.
  - Calls `scheduleExpiration(reservationId, ttlMs, expireReservationInternal)` from `src/services/reservationScheduler.js`.

- `scheduleExpiration`:

  - Keeps a `Map` of timers keyed by `reservationId`.
  - Uses `setTimeout` to invoke the handler (`expireReservationInternal`) after the delay.
  - Ensures any existing timer for the same reservation is cleared before scheduling a new one.

- `expireReservationInternal` in `reservationService`:

  - Loads `reservation:{reservationId}` from Redis.
  - If there is no reservation or its status is not `PENDING`, it returns without doing anything.
  - If `expiresAt` is still in the future (for example because of clock skew or a restarted process), it reschedules another timeout for the remaining time.
  - If the reservation is truly expired:
    - Calls `releaseReservationStock`, which for each item:
      - `INCRBY product:{id}:available` by `quantity`
      - `DECRBY product:{id}:reserved` by `quantity`
    - Sets `status` to `EXPIRED` and saves the reservation back to Redis (still subject to its TTL).

- When a reservation is **checked out** or **cancelled** before expiry, the relevant service functions:

  - Update MongoDB (`soldStock` and orders) or just release stock.
  - Adjust the Redis counters (`reserved`, `sold`, `available`).
  - Call `clearExpiration(reservationId)` so the in-memory timer is removed and no further expiration work is done for that reservation.

This keeps the behaviour consistent even under concurrency: stock is locked atomically in Redis, automatically released on expiration, and cleaned up when the user checks out or cancels.
