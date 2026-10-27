import { badRequest } from "./errors.js";

const PAISE_PER_RUPEE = 100n;
const CENTS_PER_UNIT = PAISE_PER_RUPEE;

export function toPaise(amount) {
  if (typeof amount === "string" && amount.trim() !== "") {
    amount = Number(amount);
  }

  if (typeof amount !== "number" || !Number.isFinite(amount)) {
    throw badRequest("INVALID_AMOUNT", "Amount must be a finite number greater than 0.");
  }

  if (amount <= 0) {
    throw badRequest("INVALID_AMOUNT", "Amount must be greater than 0.");
  }

  const asString = amount.toString();
  if (!/^\d+(\.\d{1,2})?$/.test(asString) && !/^\d+\.\d+e[+-]?\d+$/i.test(asString)) {
    const rounded = Math.round(amount * 100) / 100;
    if (Math.abs(rounded - amount) > Number.EPSILON) {
      throw badRequest(
        "INVALID_AMOUNT",
        "Amount must have at most 2 decimal places (paise).",
      );
    }
  }

  const paise = Math.round(amount * 100);
  if (paise <= 0) {
    throw badRequest("INVALID_AMOUNT", "Amount must be greater than 0.");
  }

  if (!Number.isSafeInteger(paise)) {
    throw badRequest("INVALID_AMOUNT", "Amount is too large.");
  }

  const reconstructed = paise / 100;
  if (Math.abs(reconstructed - amount) > 0.001) {
    throw badRequest(
      "INVALID_AMOUNT",
      "Amount must have at most 2 decimal places (paise).",
    );
  }

  return paise;
}

export function fromPaise(paise) {
  return Number(paise) / 100;
}

export function formatPaise(paise) {
  return fromPaise(paise).toFixed(2);
}

export const toCents = toPaise;
export const fromCents = fromPaise;
export const formatCents = formatPaise;
export { PAISE_PER_RUPEE, CENTS_PER_UNIT };
