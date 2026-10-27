import { describe, it, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import app from "../src/app.js";

function dispatch(method, url, body, headers = {}) {
  const urlObj = new URL(url, "http://localhost");
  return new Promise((resolve) => {
    let statusCode = 200;
    let responseBody = null;
    let finished = false;

    function done() {
      if (!finished) {
        finished = true;
        resolve({ status: statusCode, body: responseBody });
      }
    }

    const req = {
      method,
      url: urlObj.pathname + urlObj.search,
      headers: {
        "content-type": "application/json",
        ...headers,
      },
      query: Object.fromEntries(urlObj.searchParams),
      params: {},
      ...(body !== undefined ? { body } : {}),
    };

    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        responseBody = data;
        done();
        return this;
      },
      send(data) {
        responseBody = data;
        done();
        return this;
      },
      end() {
        done();
        return this;
      },
      setHeader() {
        return this;
      },
      getHeader() {
        return null;
      },
    };

    app.handle(req, res, (err) => {
      if (err) {
        statusCode = err.status || 500;
        responseBody = {
          error: {
            code: err.code || "INTERNAL_ERROR",
            message: err.message,
            ...(err.details ? { details: err.details } : {}),
          },
        };
      }
      done();
    });
  });
}

describe("Transaction Ledger System", () => {
  describe("Health & System Endpoints", () => {
    it("returns health ok", async () => {
      const res = await dispatch("GET", "/api/health");
      assert.equal(res.status, 200);
      assert.deepEqual(res.body, { status: "ok" });
    });

    it("returns 404 for unknown routes in standard error format", async () => {
      const res = await dispatch("GET", "/api/non-existent-route");
      assert.equal(res.status, 404);
      assert.equal(res.body.error.code, "NOT_FOUND");
    });
  });

  describe("1. Create Account", () => {
    it("creates a new account with balance 0 and system generated id and created_at", async () => {
      const res = await dispatch("POST", "/api/accounts", { name: "Alice Wonderland" });
      assert.equal(res.status, 201);
      assert.ok(res.body.id, "Account id should exist");
      assert.equal(res.body.name, "Alice Wonderland");
      assert.equal(res.body.balance, 0);
      assert.ok(res.body.created_at, "created_at should exist");
      assert.ok(!Number.isNaN(Date.parse(res.body.created_at)), "created_at must be valid date");
    });

    it("rejects creation if name is missing or empty or whitespace-only", async () => {
      const missingName = await dispatch("POST", "/api/accounts", {});
      assert.equal(missingName.status, 400);
      assert.equal(missingName.body.error.code, "INVALID_ACCOUNT_NAME");

      const emptyName = await dispatch("POST", "/api/accounts", { name: "   " });
      assert.equal(emptyName.status, 400);
      assert.equal(emptyName.body.error.code, "INVALID_ACCOUNT_NAME");

      const nonStringName = await dispatch("POST", "/api/accounts", { name: 12345 });
      assert.equal(nonStringName.status, 400);
      assert.equal(nonStringName.body.error.code, "INVALID_ACCOUNT_NAME");
    });

    it("rejects client attempts to set initial balance", async () => {
      const positiveBal = await dispatch("POST", "/api/accounts", { name: "Hacker", balance: 500 });
      assert.equal(positiveBal.status, 400);
      assert.equal(positiveBal.body.error.code, "INITIAL_BALANCE_NOT_ALLOWED");

      const zeroBal = await dispatch("POST", "/api/accounts", { name: "Hacker", balance: 0 });
      assert.equal(zeroBal.status, 400);
      assert.equal(zeroBal.body.error.code, "INITIAL_BALANCE_NOT_ALLOWED");

      const centsBal = await dispatch("POST", "/api/accounts", { name: "Hacker", balance_cents: 0 });
      assert.equal(centsBal.status, 400);
      assert.equal(centsBal.body.error.code, "INITIAL_BALANCE_NOT_ALLOWED");
    });

    it("rejects client attempts to set read-only fields (id, created_at)", async () => {
      const customId = await dispatch("POST", "/api/accounts", { name: "Bob", id: "custom-id" });
      assert.equal(customId.status, 400);
      assert.equal(customId.body.error.code, "READ_ONLY_FIELD");

      const customTime = await dispatch("POST", "/api/accounts", {
        name: "Bob",
        created_at: new Date().toISOString(),
      });
      assert.equal(customTime.status, 400);
      assert.equal(customTime.body.error.code, "READ_ONLY_FIELD");
    });

    it("rejects non-object request bodies", async () => {
      const arr = await dispatch("POST", "/api/accounts", ["not an object"]);
      assert.equal(arr.status, 400);
      assert.equal(arr.body.error.code, "INVALID_REQUEST_BODY");

      const str = await dispatch("POST", "/api/accounts", "raw string");
      assert.equal(str.status, 400);
      assert.equal(str.body.error.code, "INVALID_REQUEST_BODY");
    });
  });

  describe("2 & 3. Account Balance and Immutability", () => {
    it("fetches account balance and details", async () => {
      const created = await dispatch("POST", "/api/accounts", { name: "Charlie" });
      const accountId = created.body.id;

      const accRes = await dispatch("GET", `/api/accounts/${accountId}`);
      assert.equal(accRes.status, 200);
      assert.equal(accRes.body.id, accountId);
      assert.equal(accRes.body.balance, 0);

      const balRes = await dispatch("GET", `/api/accounts/${accountId}/balance`);
      assert.equal(balRes.status, 200);
      assert.equal(balRes.body.account_id, accountId);
      assert.equal(balRes.body.balance, 0);
    });

    it("returns 404 ACCOUNT_NOT_FOUND for non-existent account", async () => {
      const res = await dispatch("GET", "/api/accounts/00000000-0000-0000-0000-000000000000/balance");
      assert.equal(res.status, 404);
      assert.equal(res.body.error.code, "ACCOUNT_NOT_FOUND");
    });

    it("returns 405 METHOD_NOT_ALLOWED on direct balance modification or account deletion", async () => {
      const created = await dispatch("POST", "/api/accounts", { name: "Diana" });
      const accountId = created.body.id;

      const putBal = await dispatch("PUT", `/api/accounts/${accountId}/balance`, { balance: 1000 });
      assert.equal(putBal.status, 405);
      assert.equal(putBal.body.error.code, "METHOD_NOT_ALLOWED");

      const postBal = await dispatch("POST", `/api/accounts/${accountId}/balance`, { balance: 1000 });
      assert.equal(postBal.status, 405);
      assert.equal(postBal.body.error.code, "METHOD_NOT_ALLOWED");

      const delAcc = await dispatch("DELETE", `/api/accounts/${accountId}`);
      assert.equal(delAcc.status, 405);
      assert.equal(delAcc.body.error.code, "METHOD_NOT_ALLOWED");
    });
  });

  describe("4. Add Transaction (Credit, Debit, Idempotency, Validations)", () => {
    let testAccount;

    before(async () => {
      const res = await dispatch("POST", "/api/accounts", { name: "Test Trader" });
      testAccount = res.body.id;
    });

    it("credits an account and increases balance", async () => {
      const res = await dispatch("POST", `/api/accounts/${testAccount}/transactions`, {
        type: "credit",
        amount: 100,
        description: "Initial deposit",
        reference_id: "tx-credit-1",
      });

      assert.equal(res.status, 201);
      assert.ok(res.body.id);
      assert.equal(res.body.account_id, testAccount);
      assert.equal(res.body.type, "credit");
      assert.equal(res.body.amount, 100);
      assert.equal(res.body.description, "Initial deposit");
      assert.equal(res.body.reference_id, "tx-credit-1");
      assert.ok(res.body.created_at);

      const bal = await dispatch("GET", `/api/accounts/${testAccount}/balance`);
      assert.equal(bal.body.balance, 100);
    });

    it("accumulates multiple credits", async () => {
      const res = await dispatch("POST", `/api/accounts/${testAccount}/transactions`, {
        type: "credit",
        amount: 50.25,
        description: "Second deposit",
        reference_id: "tx-credit-2",
      });
      assert.equal(res.status, 201);

      const bal = await dispatch("GET", `/api/accounts/${testAccount}/balance`);
      assert.equal(bal.body.balance, 150.25);
    });

    it("debits an account and decreases balance", async () => {
      const res = await dispatch("POST", `/api/accounts/${testAccount}/transactions`, {
        type: "debit",
        amount: 30.25,
        description: "Coffee & groceries",
        reference_id: "tx-debit-1",
      });
      assert.equal(res.status, 201);
      assert.equal(res.body.type, "debit");
      assert.equal(res.body.amount, 30.25);

      const bal = await dispatch("GET", `/api/accounts/${testAccount}/balance`);
      assert.equal(bal.body.balance, 120);
    });

    it("rejects debit if insufficient balance and preserves balance", async () => {
      const current = await dispatch("GET", `/api/accounts/${testAccount}/balance`);
      const currentBal = current.body.balance;

      const res = await dispatch("POST", `/api/accounts/${testAccount}/transactions`, {
        type: "debit",
        amount: 9999,
        description: "Huge overdraw",
        reference_id: "tx-overdraw-1",
      });

      assert.equal(res.status, 422);
      assert.equal(res.body.error.code, "INSUFFICIENT_BALANCE");

      const after = await dispatch("GET", `/api/accounts/${testAccount}/balance`);
      assert.equal(after.body.balance, currentBal, "Balance must not change on rejected debit");
    });

    it("handles duplicate reference_id for same account (409, balance unchanged, no new transaction)", async () => {
      const balBefore = await dispatch("GET", `/api/accounts/${testAccount}/balance`);

      const dup = await dispatch("POST", `/api/accounts/${testAccount}/transactions`, {
        type: "credit",
        amount: 500,
        reference_id: "tx-credit-1", // Already used
      });

      assert.equal(dup.status, 409);
      assert.equal(dup.body.error.code, "DUPLICATE_TRANSACTION");
      assert.ok(dup.body.error.details.transaction, "Should return existing transaction details");
      assert.equal(dup.body.error.details.transaction.reference_id, "tx-credit-1");

      const balAfter = await dispatch("GET", `/api/accounts/${testAccount}/balance`);
      assert.equal(balAfter.body.balance, balBefore.body.balance, "Balance must remain unchanged");
    });

    it("allows the same reference_id on a different account", async () => {
      const anotherAcc = await dispatch("POST", "/api/accounts", { name: "Another Person" });
      const otherId = anotherAcc.body.id;

      const res = await dispatch("POST", `/api/accounts/${otherId}/transactions`, {
        type: "credit",
        amount: 25,
        reference_id: "tx-credit-1", // Same ref used on testAccount
      });

      assert.equal(res.status, 201);
      assert.equal(res.body.reference_id, "tx-credit-1");
      assert.equal(res.body.account_id, otherId);
    });

    it("supports flat /transactions endpoint with account_id in body", async () => {
      const res = await dispatch("POST", "/api/transactions", {
        account_id: testAccount,
        type: "credit",
        amount: 10,
        reference_id: "tx-flat-endpoint",
      });
      assert.equal(res.status, 201);
      assert.equal(res.body.reference_id, "tx-flat-endpoint");
      assert.equal(res.body.account_id, testAccount);
    });

    it("validates transaction type, amount, reference_id, and read-only fields", async () => {
      // Invalid type
      const badType = await dispatch("POST", `/api/accounts/${testAccount}/transactions`, {
        type: "interest",
        amount: 10,
        reference_id: "val-1",
      });
      assert.equal(badType.status, 400);
      assert.equal(badType.body.error.code, "INVALID_TRANSACTION_TYPE");

      // Zero amount
      const zeroAmt = await dispatch("POST", `/api/accounts/${testAccount}/transactions`, {
        type: "credit",
        amount: 0,
        reference_id: "val-2",
      });
      assert.equal(zeroAmt.status, 400);
      assert.equal(zeroAmt.body.error.code, "INVALID_AMOUNT");

      // Negative amount
      const negAmt = await dispatch("POST", `/api/accounts/${testAccount}/transactions`, {
        type: "credit",
        amount: -10,
        reference_id: "val-3",
      });
      assert.equal(negAmt.status, 400);
      assert.equal(negAmt.body.error.code, "INVALID_AMOUNT");

      // More than 2 decimal places
      const preciseAmt = await dispatch("POST", `/api/accounts/${testAccount}/transactions`, {
        type: "credit",
        amount: 10.999,
        reference_id: "val-4",
      });
      assert.equal(preciseAmt.status, 400);
      assert.equal(preciseAmt.body.error.code, "INVALID_AMOUNT");

      // Missing reference_id
      const noRef = await dispatch("POST", `/api/accounts/${testAccount}/transactions`, {
        type: "credit",
        amount: 10,
      });
      assert.equal(noRef.status, 400);
      assert.equal(noRef.body.error.code, "INVALID_REFERENCE_ID");

      // Read-only id passed
      const withId = await dispatch("POST", `/api/accounts/${testAccount}/transactions`, {
        id: "injected-id",
        type: "credit",
        amount: 10,
        reference_id: "val-5",
      });
      assert.equal(withId.status, 400);
      assert.equal(withId.body.error.code, "READ_ONLY_FIELD");
    });

    it("enforces transaction immutability (405 METHOD_NOT_ALLOWED)", async () => {
      const res = await dispatch("POST", `/api/accounts/${testAccount}/transactions`, {
        type: "credit",
        amount: 5,
        reference_id: "imm-1",
      });
      const txnId = res.body.id;

      const putRes = await dispatch("PUT", `/api/transactions/${txnId}`, { amount: 100 });
      assert.equal(putRes.status, 405);
      assert.equal(putRes.body.error.code, "METHOD_NOT_ALLOWED");

      const delRes = await dispatch("DELETE", `/api/transactions/${txnId}`);
      assert.equal(delRes.status, 405);
      assert.equal(delRes.body.error.code, "METHOD_NOT_ALLOWED");
    });
  });

  describe("5. Transaction History (Filtering, Pagination, Sorting)", () => {
    let histAccount;

    before(async () => {
      const acc = await dispatch("POST", "/api/accounts", { name: "History Holder" });
      histAccount = acc.body.id;

      // Post sequential transactions: 3 credits, 2 debits
      await dispatch("POST", `/api/accounts/${histAccount}/transactions`, {
        type: "credit",
        amount: 100,
        reference_id: "h-c1",
        description: "First credit",
      });
      await dispatch("POST", `/api/accounts/${histAccount}/transactions`, {
        type: "credit",
        amount: 50,
        reference_id: "h-c2",
        description: "Second credit",
      });
      await dispatch("POST", `/api/accounts/${histAccount}/transactions`, {
        type: "debit",
        amount: 30,
        reference_id: "h-d1",
        description: "First debit",
      });
      await dispatch("POST", `/api/accounts/${histAccount}/transactions`, {
        type: "credit",
        amount: 25,
        reference_id: "h-c3",
        description: "Third credit",
      });
      await dispatch("POST", `/api/accounts/${histAccount}/transactions`, {
        type: "debit",
        amount: 15,
        reference_id: "h-d2",
        description: "Second debit",
      });
    });

    it("returns transactions sorted in latest-first order", async () => {
      const res = await dispatch("GET", `/api/accounts/${histAccount}/transactions`);
      assert.equal(res.status, 200);
      assert.equal(res.body.data.length, 5);
      assert.equal(res.body.data[0].reference_id, "h-d2", "Most recent should be first");
      assert.equal(res.body.data[4].reference_id, "h-c1", "Oldest should be last");
    });

    it("filters transactions by type=credit", async () => {
      const res = await dispatch("GET", `/api/accounts/${histAccount}/transactions?type=credit`);
      assert.equal(res.status, 200);
      assert.equal(res.body.data.length, 3);
      assert.ok(res.body.data.every((t) => t.type === "credit"));
      assert.equal(res.body.pagination.total_records, 3);
    });

    it("filters transactions by type=debit", async () => {
      const res = await dispatch("GET", `/api/accounts/${histAccount}/transactions?type=debit`);
      assert.equal(res.status, 200);
      assert.equal(res.body.data.length, 2);
      assert.ok(res.body.data.every((t) => t.type === "debit"));
      assert.equal(res.body.pagination.total_records, 2);
    });

    it("paginates history correctly", async () => {
      const page1 = await dispatch("GET", `/api/accounts/${histAccount}/transactions?page=1&limit=2`);
      assert.equal(page1.status, 200);
      assert.equal(page1.body.data.length, 2);
      assert.equal(page1.body.pagination.page, 1);
      assert.equal(page1.body.pagination.current_page, 1);
      assert.equal(page1.body.pagination.limit, 2);
      assert.equal(page1.body.pagination.page_size, 2);
      assert.equal(page1.body.pagination.total_records, 5);
      assert.equal(page1.body.pagination.total_pages, 3);

      const page2 = await dispatch("GET", `/api/accounts/${histAccount}/transactions?page=2&limit=2`);
      assert.equal(page2.status, 200);
      assert.equal(page2.body.data.length, 2);
      assert.equal(page2.body.pagination.page, 2);

      // Verify no overlap between page 1 and page 2
      const page1Ids = page1.body.data.map((t) => t.id);
      const page2Ids = page2.body.data.map((t) => t.id);
      assert.ok(!page1Ids.some((id) => page2Ids.includes(id)));

      const page3 = await dispatch("GET", `/api/accounts/${histAccount}/transactions?page=3&limit=2`);
      assert.equal(page3.status, 200);
      assert.equal(page3.body.data.length, 1);
    });

    it("rejects invalid pagination parameters", async () => {
      const badPage = await dispatch("GET", `/api/accounts/${histAccount}/transactions?page=0`);
      assert.equal(badPage.status, 400);
      assert.equal(badPage.body.error.code, "INVALID_PAGINATION");

      const negLimit = await dispatch("GET", `/api/accounts/${histAccount}/transactions?limit=-5`);
      assert.equal(negLimit.status, 400);
      assert.equal(negLimit.body.error.code, "INVALID_PAGINATION");

      const hugeLimit = await dispatch("GET", `/api/accounts/${histAccount}/transactions?limit=101`);
      assert.equal(hugeLimit.status, 400);
      assert.equal(hugeLimit.body.error.code, "INVALID_PAGINATION");
    });
  });

  describe("6. Money Transfer (Bonus)", () => {
    let accA, accB;

    beforeEach(async () => {
      const a = await dispatch("POST", "/api/accounts", { name: "Sender A" });
      const b = await dispatch("POST", "/api/accounts", { name: "Receiver B" });
      accA = a.body.id;
      accB = b.body.id;

      // Fund A with 100, B with 50
      await dispatch("POST", `/api/accounts/${accA}/transactions`, {
        type: "credit",
        amount: 100,
        reference_id: `fund-a-${Date.now()}-${Math.random()}`,
      });
      await dispatch("POST", `/api/accounts/${accB}/transactions`, {
        type: "credit",
        amount: 50,
        reference_id: `fund-b-${Date.now()}-${Math.random()}`,
      });
    });

    it("transfers money atomically from A to B", async () => {
      const res = await dispatch("POST", "/api/transfers", {
        from_account_id: accA,
        to_account_id: accB,
        amount: 30,
        description: "Shared lunch",
        reference_id: `xfer-success-${Date.now()}`,
      });

      assert.equal(res.status, 201);
      assert.equal(res.body.from_account_id, accA);
      assert.equal(res.body.to_account_id, accB);
      assert.equal(res.body.amount, 30);
      assert.ok(res.body.debit_transaction_id);
      assert.ok(res.body.credit_transaction_id);

      const balA = await dispatch("GET", `/api/accounts/${accA}/balance`);
      const balB = await dispatch("GET", `/api/accounts/${accB}/balance`);
      assert.equal(balA.body.balance, 70);
      assert.equal(balB.body.balance, 80);
    });

    it("rejects transfer when source account has insufficient balance and leaves both balances unchanged", async () => {
      const res = await dispatch("POST", "/api/transfers", {
        from_account_id: accA,
        to_account_id: accB,
        amount: 150, // A only has 100
        reference_id: `xfer-insufficient-${Date.now()}`,
      });

      assert.equal(res.status, 422);
      assert.equal(res.body.error.code, "INSUFFICIENT_BALANCE");

      const balA = await dispatch("GET", `/api/accounts/${accA}/balance`);
      const balB = await dispatch("GET", `/api/accounts/${accB}/balance`);
      assert.equal(balA.body.balance, 100, "Sender balance must not change");
      assert.equal(balB.body.balance, 50, "Receiver balance must not change");
    });

    it("rejects transfer when destination account does not exist and leaves source balance unchanged", async () => {
      const res = await dispatch("POST", "/api/transfers", {
        from_account_id: accA,
        to_account_id: "00000000-0000-0000-0000-000000000000",
        amount: 30,
        reference_id: `xfer-missing-dest-${Date.now()}`,
      });

      assert.equal(res.status, 404);
      assert.equal(res.body.error.code, "ACCOUNT_NOT_FOUND");

      const balA = await dispatch("GET", `/api/accounts/${accA}/balance`);
      assert.equal(balA.body.balance, 100, "Sender balance must not change");
    });

    it("rejects transfer to the same account", async () => {
      const res = await dispatch("POST", "/api/transfers", {
        from_account_id: accA,
        to_account_id: accA,
        amount: 10,
        reference_id: `xfer-self-${Date.now()}`,
      });

      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, "INVALID_TRANSFER");
    });

    it("rejects duplicate transfer reference_id (409 DUPLICATE_TRANSFER)", async () => {
      const refId = `xfer-dup-${Date.now()}`;
      await dispatch("POST", "/api/transfers", {
        from_account_id: accA,
        to_account_id: accB,
        amount: 20,
        reference_id: refId,
      });

      const dup = await dispatch("POST", "/api/transfers", {
        from_account_id: accA,
        to_account_id: accB,
        amount: 20,
        reference_id: refId,
      });

      assert.equal(dup.status, 409);
      assert.equal(dup.body.error.code, "DUPLICATE_TRANSFER");

      const balA = await dispatch("GET", `/api/accounts/${accA}/balance`);
      const balB = await dispatch("GET", `/api/accounts/${accB}/balance`);
      assert.equal(balA.body.balance, 80);
      assert.equal(balB.body.balance, 70);
    });
  });

  describe("7. Balance Consistency Verification", () => {
    it("guarantees balance strictly equals sum(credits) - sum(debits)", async () => {
      const acc = await dispatch("POST", "/api/accounts", { name: "Audit Account" });
      const accId = acc.body.id;

      // Initial: 0
      // Credit: 100
      // Credit: 50
      // Debit: 30
      // Debit: 20
      // Expected Final: 100
      await dispatch("POST", `/api/accounts/${accId}/transactions`, {
        type: "credit",
        amount: 100,
        reference_id: "audit-1",
      });
      await dispatch("POST", `/api/accounts/${accId}/transactions`, {
        type: "credit",
        amount: 50,
        reference_id: "audit-2",
      });
      await dispatch("POST", `/api/accounts/${accId}/transactions`, {
        type: "debit",
        amount: 30,
        reference_id: "audit-3",
      });
      await dispatch("POST", `/api/accounts/${accId}/transactions`, {
        type: "debit",
        amount: 20,
        reference_id: "audit-4",
      });

      const finalBal = await dispatch("GET", `/api/accounts/${accId}/balance`);
      assert.equal(finalBal.body.balance, 100);

      // Verify against raw transaction sum
      const history = await dispatch("GET", `/api/accounts/${accId}/transactions?limit=100`);
      let computed = 0;
      for (const t of history.body.data) {
        if (t.type === "credit") computed += t.amount;
        if (t.type === "debit") computed -= t.amount;
      }
      assert.equal(computed, finalBal.body.balance);
    });
  });
});
