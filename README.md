# Transaction Ledger System

## Key Architectural Principles

1. **Exact Currency Representation (Integer Paise in INR)**
   All monetary amounts are converted and stored internally as integer paise (`1 INR = 100 paise`; e.g. `₹150.50` is stored as `15050` paise). This eliminates IEEE 754 floating-point rounding errors and preserves balance consistency down to the single paisa.

2. **Strict Database Atomicity (ACID)**
   Writing a transaction and updating the account balance are executed within a single immediate SQLite transaction (`BEGIN IMMEDIATE ... COMMIT`). If any step or constraint fails, the entire transaction is rolled back (`ROLLBACK`). A partial or desynchronized balance is impossible.

3. **Multi-Layer Data Integrity & Defense-in-Depth**
    - **Database Constraints**: `accounts` has `CHECK (balance_paise >= 0)`. The database engine itself rejects any operation that would result in a negative balance.
    - **Unique Constraints**: `transactions` enforces `UNIQUE(account_id, reference_id)`. The engine rejects duplicates even under high concurrency.
    - **Foreign Keys**: `PRAGMA foreign_keys = ON` ensures orphaned transactions cannot be inserted.
    - **Service-Level Checks**: Balances are verified before issuing debits, returning human-friendly `422 INSUFFICIENT_BALANCE` errors with actionable details.

4. **Idempotency & Duplicate Protection**
   Submitting a transaction with an already-used `reference_id` for that account returns HTTP `409 Conflict` (`DUPLICATE_TRANSACTION`), returning the details of the existing transaction. No duplicate row is persisted and balances remain untouched. The same `reference_id` may be reused on different accounts.

5. **Ledger Immutability**
   Transactions are strictly append-only. There are no API endpoints to update or delete transactions or accounts. Any attempt to send `PUT`, `PATCH`, or `DELETE` to transaction or balance routes returns `405 Method Not Allowed`.
---

## Project Structure

```text
transaction-ledger/
├── backend/
│   ├── src/
│   │   ├── app.js               # Express application configuration & middleware
│   │   ├── index.js             # Server startup entrypoint
│   │   ├── db.js                # SQLite connection, WAL mode, schema & withTransaction helper
│   │   ├── routes.js            # REST route declarations & 405 immutability protections
│   │   ├── errors.js            # AppError classes & centralized JSON error handler
│   │   ├── money.js             # Exact integer paise conversion & validation in INR
│   │   ├── serializers.js       # JSON response formatters
│   │   └── services/
│   │       ├── accounts.js      # Account creation, validation & balance retrieval
│   │       ├── transactions.js  # Transaction execution, balance updates & history query
│   │       └── transfers.js     # Atomic multi-account money transfer
├── frontend/
│   ├── src/
│   │   ├── App.jsx              # React UI: account creation, cards, forms, tables & pagination (INR ₹)
│   │   ├── api.js               # Client API integration layer
│   │   ├── styles.css           # Clean, responsive banking dashboard stylesheet
│   │   └── main.jsx             # React DOM entrypoint
│   └── vite.config.js           # Vite configuration with /api reverse proxy
├── docs/
│   └── API.md                   # Complete API reference documentation (INR)
├── package.json                 # Monorepo workspaces configuration
└── README.md                    # Project documentation & run guide
```

---
## Local Setup & Execution

### 1. Install Dependencies

From the repository root:

```bash
npm install
```

This installs dependencies for both backend and frontend workspaces.

---

### 2. Start the Backend API

Start the Express API server (runs on `http://localhost:3001`):

```bash
npm run start
```

Or start with auto-reload for development:

```bash
npm run dev
```

Health check:
```bash
curl http://localhost:3001/api/health
# {"status":"ok"}
```

---

### 3. Start the Frontend React App

In a separate terminal, start the Vite development server (runs on `http://localhost:5173`):

```bash
npm run dev:frontend
```

Open [http://localhost:5173](http://localhost:5173) in your browser. The Vite development server automatically proxies all `/api` requests to the backend server running on port `3001`. All balances, inputs, chips, and transactions are displayed in **Indian Rupees (₹ / Rs.)** with `en-IN` numbering formatting (e.g. `₹1,50,000.00`).

---

## API Summary

Base URL: `http://localhost:3001/api`

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/accounts` | Create an account (opening balance always `₹0.00`) |
| `GET` | `/accounts` | List all accounts |
| `GET` | `/accounts/:id` | Get account details |
| `GET` | `/accounts/:id/balance` | Get account balance in INR |
| `POST` | `/accounts/:id/transactions` | Post a credit or debit transaction to an account |
| `GET` | `/accounts/:id/transactions` | Query transaction history (filter by `type`, pagination: `page`, `limit`) |
| `GET` | `/accounts/:id/transactions/:transactionId` | Get single transaction |
| `POST` | `/transactions` | Flat endpoint to post transaction (`account_id` in body) |
| `GET` | `/transactions?account_id=:id` | Flat endpoint to query transaction history |
| `GET` | `/transactions/:id` | Get single transaction by ID |
| `POST` | `/transfers` | Transfer funds atomically between two accounts in INR |
| `GET` | `/transfers/:id` | Get transfer details |
| `GET` | `/health` | API health check |

For complete payload schemas, rules, and example responses, see [docs/API.md](docs/API.md).

---

## Assumptions & Design Decisions

1. **Currency and Precision**:
    - Currency is Indian Rupee (`INR`, `₹` / `Rs.`) with subunit **paise** (`1 INR = 100 paise`). Internally, all operations are executed in integer paise to prevent floating point inaccuracies.
    - Values with more than two decimal places (fractional paise, e.g. `10.999`) are rejected with `400 INVALID_AMOUNT`.

2. **Opening Balance**:
    - New accounts strictly begin with a balance of `0.00`. Clients cannot specify an initial balance at creation time; attempting to provide `balance`, `balance_paise`, or `balance_cents` is rejected with `400 INITIAL_BALANCE_NOT_ALLOWED`.

3. **System-Generated Metadata**:
    - `id` (UUIDv4) and `created_at` (ISO 8601 UTC timestamp) are generated strictly by the server. Any client payload attempting to specify these fields is rejected with `400 READ_ONLY_FIELD`.

4. **Reference ID Scope & Idempotency**:
    - `reference_id` uniqueness is scoped to each account (`UNIQUE(account_id, reference_id)`).
    - Re-submitting a duplicate `reference_id` for an account returns HTTP `409 Conflict` with code `DUPLICATE_TRANSACTION` and the existing transaction in `details`. The balance remains unchanged.
    - Different accounts can safely reuse the same `reference_id` (e.g. recurring invoice numbers across distinct customers).

5. **Ledger Immutability**:
    - Once written, transactions and transfer records can never be updated or deleted via the API. HTTP `PUT`, `PATCH`, and `DELETE` requests to transactions and balances return `405 METHOD_NOT_ALLOWED`.

6. **History Ordering**:
    - Transactions are sorted latest-first: `ORDER BY created_at DESC, rowid DESC`. The `rowid DESC` tiebreaker guarantees strictly deterministic newest-first ordering even if multiple transactions occur within the same millisecond.

7. **Pagination**:
    - History pagination defaults to `page=1` and `limit=10` (max limit `100`). The response includes both `page`/`current_page`, `limit`/`page_size`, `total_records`, and `total_pages`.

8. **Transfers**:
    - Transfers require distinct source and destination accounts.
    - Transfers execute a debit from the source and a credit to the destination atomically within a single database transaction. If either operation fails (e.g. insufficient balance on the source), neither account is touched.
    - Transfer `reference_id` is globally unique across transfers, preventing double-transfers.