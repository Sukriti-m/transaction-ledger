# API Documentation

Base URL: `http://localhost:3001/api`

---

## Response Format

### Success Responses

- Resource Creation: `201 Created`
- Lookups / Queries: `200 OK`

### Error Responses

Errors follow a uniform JSON schema:

```json
{
  "error": {
    "code": "ACCOUNT_NOT_FOUND",
    "message": "Account '49386d4e-...' was not found.",
    "details": { ... }
  }
}
```

---
## Accounts Endpoints

### 1. Create Account

`POST /accounts`

Creates a new account. Every new account starts with an initial balance of `₹0.00`. The client is not permitted to set opening balances or system timestamps.

**Request Body:**

```json
{
  "name": "Ada Lovelace"
}
```

**Response (`201 Created`):**

```json
{
  "id": "e0b9d997-7c15-4fa2-bf66-b3ea022415c9",
  "name": "Ada Lovelace",
  "balance": 0,
  "created_at": "2026-10-27T14:30:00.000Z"
}
```

**Validation & Rules:**
- `name` is required, must be a non-empty string (trimmed), max length 255 characters.
- Initial balance is always `0`. If `balance`, `balance_paise`, or `balance_cents` is supplied, returns `400` (`INITIAL_BALANCE_NOT_ALLOWED`).
- `id` and `created_at` are system-generated. If supplied, returns `400` (`READ_ONLY_FIELD`).

---

### 2. List All Accounts

`GET /accounts`

Returns all accounts ordered newest first.

**Response (`200 OK`):**

```json
{
  "data": [
    {
      "id": "e0b9d997-7c15-4fa2-bf66-b3ea022415c9",
      "name": "Ada Lovelace",
      "balance": 1500.5,
      "created_at": "2026-10-27T14:30:00.000Z"
    }
  ]
}
```

---

### 3. Get Account by ID

`GET /accounts/:id`

Fetches full account record.

**Response (`200 OK`):**

```json
{
  "id": "e0b9d997-7c15-4fa2-bf66-b3ea022415c9",
  "name": "Ada Lovelace",
  "balance": 1500.5,
  "created_at": "2026-10-27T14:30:00.000Z"
}
```

If the account ID does not exist, returns `404` (`ACCOUNT_NOT_FOUND`).

---

### 4. Get Account Balance

`GET /accounts/:id/balance`

Fetches the current real-time balance of an account in INR.

**Response (`200 OK`):**

```json
{
  "account_id": "e0b9d997-7c15-4fa2-bf66-b3ea022415c9",
  "balance": 1500.5
}
```

Direct mutation methods (`POST`, `PUT`, `PATCH`, `DELETE`) on `/accounts/:id/balance` return `405 Method Not Allowed`. Balances can only be altered through valid transactions.

---

## Transactions Endpoints

### 5. Add Transaction

The API supports both the nested REST convention (`POST /accounts/:id/transactions`) and the flat convention (`POST /transactions` with `account_id` in body).

`POST /accounts/:id/transactions`
`POST /transactions`

**Request Body:**

```json
{
  "account_id": "e0b9d997-7c15-4fa2-bf66-b3ea022415c9",
  "type": "credit",
  "amount": 1000.50,
  "reference_id": "inv-2026-001",
  "description": "Salary deposit"
}
```

*(Note: when using `POST /accounts/:id/transactions`, `account_id` is inferred from URL. If also passed in body, it must match).*

**Response (`201 Created`):**

```json
{
  "id": "fa1a81dc-4a31-4dd9-a5eb-0ad447cf08e7",
  "account_id": "e0b9d997-7c15-4fa2-bf66-b3ea022415c9",
  "type": "credit",
  "amount": 1000.5,
  "description": "Salary deposit",
  "reference_id": "inv-2026-001",
  "created_at": "2026-10-27T14:35:12.345Z"
}
```

**Transaction Rules:**
1. **Credit**: Increases the account balance by `amount` (INR).
2. **Debit**: Decreases the account balance by `amount` (INR). If `current_balance < amount`, returns `422 Unprocessable Entity` (`INSUFFICIENT_BALANCE`). The balance is preserved and no transaction is persisted.
3. **Duplicate Prevention (Idempotency)**:
    - `reference_id` must be unique per account.
    - Resubmitting the same `reference_id` on the same account returns `409 Conflict` (`DUPLICATE_TRANSACTION`) with the existing transaction in `details`. The balance remains unchanged and no new record is written.
    - The same `reference_id` may be used by different accounts without collision.
4. **Atomicity**: Insertion of the transaction record and updating the account balance occur inside an immediate SQLite database transaction. If either fails, all changes are rolled back.
5. **Precision (Paise)**: Amounts are stored as integer paise in SQLite. Amounts must be positive (`> 0`) with at most two decimal places (representing paise).

---

### 6. Get Transaction History

`GET /accounts/:id/transactions`
`GET /transactions?account_id=:id`

Fetches transaction history with optional type filtering and pagination.

**Query Parameters:**
- `type` *(optional)*: `credit` or `debit` (case-insensitive). If omitted, returns all types.
- `page` *(optional)*: Positive integer page number (default: `1`).
- `limit` *(optional)*: Number of items per page (default: `10`, max: `100`).

**Example Request:**
`GET /accounts/e0b9d997-7c15-4fa2-bf66-b3ea022415c9/transactions?type=credit&page=1&limit=10`

**Response (`200 OK`):**

```json
{
  "data": [
    {
      "id": "fa1a81dc-4a31-4dd9-a5eb-0ad447cf08e7",
      "account_id": "e0b9d997-7c15-4fa2-bf66-b3ea022415c9",
      "type": "credit",
      "amount": 1000.5,
      "description": "Salary deposit",
      "reference_id": "inv-2026-001",
      "created_at": "2026-10-27T14:35:12.345Z"
    }
  ],
  "pagination": {
    "page": 1,
    "current_page": 1,
    "limit": 10,
    "page_size": 10,
    "total_records": 1,
    "total_pages": 1
  }
}
```

**Sorting:**
Transactions are strictly ordered **latest-first** (`created_at DESC`, `rowid DESC`).

---

### 7. Get Transaction by ID

`GET /transactions/:id`
`GET /accounts/:id/transactions/:transactionId`

Fetches a single transaction by ID.

---

### 8. Transaction Immutability

Transactions are append-only. Any attempt to update or delete transactions (`PUT`, `PATCH`, `DELETE` on `/transactions/:id` or `/accounts/:id/transactions/:transactionId`) returns:

**Response (`405 Method Not Allowed`):**

```json
{
  "error": {
    "code": "METHOD_NOT_ALLOWED",
    "message": "Transactions are immutable and cannot be updated or deleted."
  }
}
```

---

### 9. Transfer Funds Between Accounts

`POST /transfers`

Executes an atomic transfer from one account to another in INR.

**Request Body:**

```json
{
  "from_account_id": "uuid-account-a",
  "to_account_id": "uuid-account-b",
  "amount": 500.00,
  "reference_id": "xfer-2026-001",
  "description": "Shared project expense"
}
```

**Response (`201 Created`):**

```json
{
  "id": "uuid-transfer",
  "from_account_id": "uuid-account-a",
  "to_account_id": "uuid-account-b",
  "amount": 500,
  "description": "Shared project expense",
  "reference_id": "xfer-2026-001",
  "debit_transaction_id": "uuid-debit-txn",
  "credit_transaction_id": "uuid-credit-txn",
  "created_at": "2026-10-27T14:40:00.000Z"
}
```

**Transfer Requirements & Atomicity:**
- Source and destination accounts must both exist (`404` if not found).
- Source and destination must not be the same account (`400 INVALID_TRANSFER`).
- Source account must have sufficient funds in INR (`422 INSUFFICIENT_BALANCE`).
- The debit on the source account, the credit on the destination account, and the transfer log are committed inside a single database transaction. If any part fails, the entire transfer rolls back.
- Resubmitting the same transfer `reference_id` returns `409 Conflict` (`DUPLICATE_TRANSFER`) with existing transfer details; balances do not change.

---

### 10. Get Transfer by ID

`GET /transfers/:id`

Returns transfer details.

---

## Error Codes Reference

| HTTP Code | Error Code | Description |
| :--- | :--- | :--- |
| **400** | `INVALID_REQUEST_BODY` | Request body is missing or is not a JSON object |
| **400** | `INVALID_JSON` | Body has invalid JSON syntax |
| **400** | `INVALID_ACCOUNT_NAME` | Account name missing, empty, or exceeds 255 chars |
| **400** | `INITIAL_BALANCE_NOT_ALLOWED` | Client attempted to set initial balance on account creation |
| **400** | `READ_ONLY_FIELD` | Client attempted to set read-only fields (`id`, `created_at`) |
| **400** | `INVALID_ACCOUNT_ID` | Account ID is invalid or missing |
| **400** | `INVALID_TRANSACTION_TYPE` | Type is not `credit` or `debit` |
| **400** | `INVALID_AMOUNT` | Amount is `<= 0`, non-numeric, or has `> 2` decimal places (fractional paise) |
| **400** | `INVALID_REFERENCE_ID` | Reference ID missing or empty |
| **400** | `INVALID_PAGINATION` | `page < 1` or `limit < 1` or `limit > 100` |
| **400** | `INVALID_TRANSFER` | Source and destination accounts are identical |
| **404** | `ACCOUNT_NOT_FOUND` | Specified account does not exist |
| **404** | `TRANSACTION_NOT_FOUND` | Specified transaction does not exist |
| **404** | `TRANSFER_NOT_FOUND` | Specified transfer does not exist |
| **404** | `NOT_FOUND` | Requested route does not exist |
| **405** | `METHOD_NOT_ALLOWED` | Attempted update or deletion of immutable records |
| **409** | `DUPLICATE_TRANSACTION` | Transaction with this reference already exists for account |
| **409** | `DUPLICATE_TRANSFER` | Transfer with this reference already exists |
| **422** | `INSUFFICIENT_BALANCE` | Account does not have sufficient balance for debit/transfer |
| **500** | `INTERNAL_ERROR` | Unexpected internal server error |
