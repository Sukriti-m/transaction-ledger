async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(payload?.error?.message || "Request failed");
    error.code = payload?.error?.code;
    error.details = payload?.error?.details;
    error.status = response.status;
    throw error;
  }

  return payload;
}

export const api = {
  listAccounts() {
    return request("/api/accounts");
  },
  createAccount(name) {
    return request("/api/accounts", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  },
  getAccount(id) {
    return request(`/api/accounts/${id}`);
  },
  getBalance(id) {
    return request(`/api/accounts/${id}/balance`);
  },
  createTransaction(accountId, data) {
    return request(`/api/accounts/${accountId}/transactions`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  getTransactions(accountId, { type, page, limit }) {
    const params = new URLSearchParams();
    if (type) params.set("type", type);
    if (page) params.set("page", String(page));
    if (limit) params.set("limit", String(limit));
    const query = params.toString();
    return request(`/api/accounts/${accountId}/transactions${query ? `?${query}` : ""}`);
  },
  transfer(data) {
    return request("/api/transfers", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
};
