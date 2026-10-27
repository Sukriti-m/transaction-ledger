import { fromPaise } from "./money.js";

export function serializeAccount(row) {
  const paise = row.balance_paise !== undefined ? row.balance_paise : row.balance_cents;
  return {
    id: row.id,
    name: row.name,
    balance: fromPaise(paise ?? 0),
    created_at: row.created_at,
  };
}

export function serializeBalance(row) {
  const paise = row.balance_paise !== undefined ? row.balance_paise : row.balance_cents;
  return {
    account_id: row.id,
    balance: fromPaise(paise ?? 0),
  };
}

export function serializeTransaction(row) {
  const paise = row.amount_paise !== undefined ? row.amount_paise : row.amount_cents;
  return {
    id: row.id,
    account_id: row.account_id,
    type: row.type,
    amount: fromPaise(paise ?? 0),
    description: row.description,
    reference_id: row.reference_id,
    created_at: row.created_at,
  };
}

export function serializeTransfer(row) {
  const paise = row.amount_paise !== undefined ? row.amount_paise : row.amount_cents;
  return {
    id: row.id,
    from_account_id: row.from_account_id,
    to_account_id: row.to_account_id,
    amount: fromPaise(paise ?? 0),
    description: row.description,
    reference_id: row.reference_id,
    debit_transaction_id: row.debit_transaction_id,
    credit_transaction_id: row.credit_transaction_id,
    created_at: row.created_at,
  };
}
