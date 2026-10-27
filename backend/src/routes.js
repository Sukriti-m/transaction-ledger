import { Router } from "express";
import {
  createAccount,
  getAccount,
  getAccountBalance,
  listAccounts,
} from "./services/accounts.js";
import {
  createTransaction,
  getTransaction,
  getTransactionHistory,
} from "./services/transactions.js";
import { createTransfer, getTransfer } from "./services/transfers.js";
import { badRequest, notFound } from "./errors.js";

const router = Router();

function handle(handler) {
  return (req, res, next) => {
    try {
      handler(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

function requireJsonObject(req) {
  if (req.body === undefined || req.body === null || typeof req.body !== "object" || Array.isArray(req.body)) {
    throw badRequest("INVALID_REQUEST_BODY", "Request body must be a JSON object.");
  }
}

function methodNotAllowed(message) {
  return (_req, res) => {
    res.status(405).json({
      error: {
        code: "METHOD_NOT_ALLOWED",
        message,
      },
    });
  };
}

router.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

router.get("/accounts", handle((_req, res) => {
  res.json({ data: listAccounts() });
}));

router.post("/accounts", handle((req, res) => {
  requireJsonObject(req);
  const account = createAccount(req.body);
  res.status(201).json(account);
}));

router.get("/accounts/:id", handle((req, res) => {
  res.json(getAccount(req.params.id));
}));

router.all("/accounts/:id", (req, res, next) => {
  if (req.method === "PUT" || req.method === "PATCH" || req.method === "DELETE") {
    return methodNotAllowed("Accounts cannot be edited or deleted through the API.")(req, res);
  }
  next();
});

router.get("/accounts/:id/balance", handle((req, res) => {
  res.json(getAccountBalance(req.params.id));
}));

router.all("/accounts/:id/balance", (req, res, next) => {
  if (req.method !== "GET") {
    return methodNotAllowed(
      "Direct balance modification is not allowed. Balances are changed strictly via transactions.",
    )(req, res);
  }
  next();
});

router.post("/accounts/:id/transactions", handle((req, res) => {
  requireJsonObject(req);
  const transaction = createTransaction(req.params.id, req.body);
  res.status(201).json(transaction);
}));

router.get("/accounts/:id/transactions", handle((req, res) => {
  res.json(getTransactionHistory(req.params.id, req.query));
}));

router.get("/accounts/:id/transactions/:transactionId", handle((req, res) => {
  const txn = getTransaction(req.params.transactionId);
  if (txn.account_id !== req.params.id) {
    throw notFound(
      "TRANSACTION_NOT_FOUND",
      `Transaction '${req.params.transactionId}' does not belong to account '${req.params.id}'.`,
    );
  }
  res.json(txn);
}));

router.all("/accounts/:id/transactions/:transactionId", (req, res, next) => {
  if (req.method === "PUT" || req.method === "PATCH" || req.method === "DELETE") {
    return methodNotAllowed("Transactions are immutable and cannot be updated or deleted.")(req, res);
  }
  next();
});

router.post("/transactions", handle((req, res) => {
  requireJsonObject(req);
  const accountId =
    typeof req.body.account_id === "string" ? req.body.account_id.trim() : "";
  if (!accountId) {
    throw badRequest("INVALID_ACCOUNT_ID", "account_id is required.");
  }
  const transaction = createTransaction(accountId, req.body);
  res.status(201).json(transaction);
}));

router.get("/transactions", handle((req, res) => {
  const accountId =
    typeof req.query.account_id === "string" ? req.query.account_id.trim() : "";
  if (!accountId) {
    throw badRequest("INVALID_ACCOUNT_ID", "account_id query parameter is required.");
  }
  res.json(getTransactionHistory(accountId, req.query));
}));

router.get("/transactions/:id", handle((req, res) => {
  res.json(getTransaction(req.params.id));
}));

router.all("/transactions/:id", (req, res, next) => {
  if (req.method === "PUT" || req.method === "PATCH" || req.method === "DELETE") {
    return methodNotAllowed("Transactions are immutable and cannot be updated or deleted.")(req, res);
  }
  next();
});

router.post("/transfers", handle((req, res) => {
  requireJsonObject(req);
  const transfer = createTransfer(req.body);
  res.status(201).json(transfer);
}));

router.get("/transfers/:id", handle((req, res) => {
  res.json(getTransfer(req.params.id));
}));

router.all("/transfers/:id", (req, res, next) => {
  if (req.method === "PUT" || req.method === "PATCH" || req.method === "DELETE") {
    return methodNotAllowed("Transfers are immutable and cannot be updated or deleted.")(req, res);
  }
  next();
});

export default router;
