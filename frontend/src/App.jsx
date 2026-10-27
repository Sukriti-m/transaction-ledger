import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./api.js";

function money(value) {
  return Number(value).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function generateRef(prefix = "ref") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function Field({ label, action, children }) {
  return (
    <label className="field">
      <div className="field-label-row">
        <span>{label}</span>
        {action}
      </div>
      {children}
    </label>
  );
}

function Notice({ notice, onDismiss }) {
  if (!notice) return null;
  return (
    <div className={`notice ${notice.kind}`} role="status">
      <p>{notice.text}</p>
      <button type="button" onClick={onDismiss} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}

export default function App() {
  const [accounts, setAccounts] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [account, setAccount] = useState(null);
  const [history, setHistory] = useState({
    data: [],
    pagination: { page: 1, limit: 10, total_records: 0, total_pages: 0 },
  });
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const [newName, setNewName] = useState("");
  const [txn, setTxn] = useState({
    type: "credit",
    amount: "",
    description: "",
    reference_id: "",
  });
  const [transfer, setTransfer] = useState({
    to_account_id: "",
    amount: "",
    description: "",
    reference_id: "",
  });

  const showError = (error) => {
    setNotice({ kind: "error", text: error.message || "Something went wrong." });
  };

  const showSuccess = (text) => {
    setNotice({ kind: "success", text });
  };

  const refreshAccounts = useCallback(async () => {
    const result = await api.listAccounts();
    setAccounts(result.data);
    return result.data;
  }, []);

  const loadAccountView = useCallback(
    async (id, targetPage = page, targetFilter = filter) => {
      if (!id) {
        setAccount(null);
        setHistory({
          data: [],
          pagination: { page: 1, limit: 10, total_records: 0, total_pages: 0 },
        });
        return;
      }

      setLoading(true);
      try {
        const [accountData, historyData] = await Promise.all([
          api.getAccount(id),
          api.getTransactions(id, { type: targetFilter, page: targetPage, limit: 10 }),
        ]);
        setAccount(accountData);
        setHistory(historyData);
      } catch (error) {
        showError(error);
      } finally {
        setLoading(false);
      }
    },
    [filter, page],
  );

  useEffect(() => {
    refreshAccounts().catch(showError);
  }, [refreshAccounts]);

  useEffect(() => {
    loadAccountView(selectedId, page, filter);
  }, [selectedId, page, filter, loadAccountView]);

  const otherAccounts = useMemo(
    () => accounts.filter((item) => item.id !== selectedId),
    [accounts, selectedId],
  );

  async function handleCreateAccount(event) {
    event.preventDefault();
    try {
      const created = await api.createAccount(newName);
      setNewName("");
      const list = await refreshAccounts();
      if (!selectedId && list.length) {
        setSelectedId(created.id);
      }
      showSuccess(`Account created for ${created.name}. Opening balance is ₹0.00.`);
    } catch (error) {
      showError(error);
    }
  }

  async function handleAddTransaction(event) {
    event.preventDefault();
    if (!selectedId) return;
    try {
      const created = await api.createTransaction(selectedId, {
        type: txn.type,
        amount: Number(txn.amount),
        description: txn.description,
        reference_id: txn.reference_id,
      });
      setTxn({ type: txn.type, amount: "", description: "", reference_id: "" });
      await refreshAccounts();
      await loadAccountView(selectedId, 1, filter);
      setPage(1);
      showSuccess(
        `${created.type === "credit" ? "Credit" : "Debit"} of ₹${money(created.amount)} successfully posted.`,
      );
    } catch (error) {
      if (error.code === "DUPLICATE_TRANSACTION") {
        setNotice({
          kind: "warning",
          text: "Duplicate reference ID detected. A transaction with this reference already exists for this account. Balance was not changed.",
        });
        await loadAccountView(selectedId, page, filter);
        return;
      }
      showError(error);
    }
  }

  async function handleTransfer(event) {
    event.preventDefault();
    if (!selectedId) return;
    try {
      const result = await api.transfer({
        from_account_id: selectedId,
        to_account_id: transfer.to_account_id,
        amount: Number(transfer.amount),
        description: transfer.description,
        reference_id: transfer.reference_id,
      });
      setTransfer({ to_account_id: "", amount: "", description: "", reference_id: "" });
      await refreshAccounts();
      await loadAccountView(selectedId, 1, filter);
      setPage(1);
      showSuccess(`Transferred ₹${money(result.amount)} successfully.`);
    } catch (error) {
      if (error.code === "DUPLICATE_TRANSFER") {
        setNotice({
          kind: "warning",
          text: "This transfer reference ID already exists. Balances were not changed.",
        });
        return;
      }
      showError(error);
    }
  }

  function copyAccountId() {
    if (account?.id) {
      navigator.clipboard?.writeText(account.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  const pagination = history.pagination;

  return (
    <div className="page">
      <header className="hero">
        <div>
          <h1>Transaction Ledger</h1>
        </div>
      </header>

      <Notice notice={notice} onDismiss={() => setNotice(null)} />

      <section className="layout">
        <aside className="panel">
          <div className="panel-header">
            <h2>Accounts</h2>
            <span className="badge">{accounts.length}</span>
          </div>

          <form className="stack" onSubmit={handleCreateAccount}>
            <Field label="Account holder name">
              <input
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="Ada Lovelace"
                required
              />
            </Field>
            <button type="submit">Create account</button>
          </form>

          <ul className="account-list">
            {accounts.length === 0 ? <li className="muted">No accounts yet.</li> : null}
            {accounts.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={item.id === selectedId ? "account-card selected" : "account-card"}
                  onClick={() => {
                    setSelectedId(item.id);
                    setPage(1);
                  }}
                >
                  <div>
                    <strong>{item.name}</strong>
                    <div className="account-card-date">
                      {new Date(item.created_at).toLocaleDateString("en-IN")}
                    </div>
                  </div>
                  <span className="account-card-balance">₹{money(item.balance)}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <main className="panel main-panel">
          {!account ? (
            <div className="empty">
              <h2>Select an account</h2>
              <p>Choose an account from the left panel or create a new one to begin.</p>
            </div>
          ) : (
            <>
              <div className="balance-card">
                <div>
                  <p className="eyebrow">Active Account</p>
                  <h2>{account.name}</h2>
                  <div className="account-id-row">
                    <span className="account-id">{account.id}</span>
                    <button
                      type="button"
                      className="text-btn"
                      onClick={copyAccountId}
                      title="Copy account ID"
                    >
                      {copied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                </div>
                <div className="balance-box">
                  <span className="balance-label">Current balance</span>
                  <p className="balance">₹{money(account.balance)}</p>
                </div>
              </div>

              <div className="grid">
                <form className="stack card-form" onSubmit={handleAddTransaction}>
                  <div className="form-title-row">
                    <h3>Add transaction</h3>
                    <div className="quick-buttons">
                      <button
                        type="button"
                        className="chip"
                        onClick={() =>
                          setTxn({
                            type: "credit",
                            amount: "100.00",
                            reference_id: generateRef("dep"),
                            description: "Test deposit",
                          })
                        }
                      >
                        + Credit ₹100
                      </button>
                      <button
                        type="button"
                        className="chip"
                        onClick={() =>
                          setTxn({
                            type: "debit",
                            amount: "30.00",
                            reference_id: generateRef("wdr"),
                            description: "Test debit",
                          })
                        }
                      >
                        - Debit ₹30
                      </button>
                    </div>
                  </div>

                  <Field label="Type">
                    <select
                      value={txn.type}
                      onChange={(event) =>
                        setTxn((current) => ({ ...current, type: event.target.value }))
                      }
                    >
                      <option value="credit">Credit (Deposit)</option>
                      <option value="debit">Debit (Withdrawal)</option>
                    </select>
                  </Field>

                  <Field label="Amount (₹ Rs.)">
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={txn.amount}
                      onChange={(event) =>
                        setTxn((current) => ({ ...current, amount: event.target.value }))
                      }
                      placeholder="0.00"
                      required
                    />
                  </Field>

                  <Field
                    label="Reference ID"
                    action={
                      <button
                        type="button"
                        className="text-btn"
                        onClick={() =>
                          setTxn((current) => ({
                            ...current,
                            reference_id: generateRef("txn"),
                          }))
                        }
                      >
                        Auto-generate
                      </button>
                    }
                  >
                    <input
                      value={txn.reference_id}
                      onChange={(event) =>
                        setTxn((current) => ({
                          ...current,
                          reference_id: event.target.value,
                        }))
                      }
                      placeholder="e.g. invoice-1042"
                      required
                    />
                  </Field>

                  <Field label="Description (optional)">
                    <input
                      value={txn.description}
                      onChange={(event) =>
                        setTxn((current) => ({
                          ...current,
                          description: event.target.value,
                        }))
                      }
                      placeholder="e.g. Vendor payment"
                    />
                  </Field>

                  <button type="submit">Post Transaction</button>
                </form>

                <form className="stack card-form" onSubmit={handleTransfer}>
                  <div className="form-title-row">
                    <h3>Money transfer</h3>
                    <span className="badge">Atomic</span>
                  </div>

                  <Field label="Destination account">
                    <select
                      value={transfer.to_account_id}
                      onChange={(event) =>
                        setTransfer((current) => ({
                          ...current,
                          to_account_id: event.target.value,
                        }))
                      }
                      required
                    >
                      <option value="">Select recipient</option>
                      {otherAccounts.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} (₹{money(item.balance)})
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Amount (₹ Rs.)">
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={transfer.amount}
                      onChange={(event) =>
                        setTransfer((current) => ({
                          ...current,
                          amount: event.target.value,
                        }))
                      }
                      placeholder="0.00"
                      required
                    />
                  </Field>

                  <Field
                    label="Reference ID"
                    action={
                      <button
                        type="button"
                        className="text-btn"
                        onClick={() =>
                          setTransfer((current) => ({
                            ...current,
                            reference_id: generateRef("xfer"),
                          }))
                        }
                      >
                        Auto-generate
                      </button>
                    }
                  >
                    <input
                      value={transfer.reference_id}
                      onChange={(event) =>
                        setTransfer((current) => ({
                          ...current,
                          reference_id: event.target.value,
                        }))
                      }
                      placeholder="e.g. xfer-001"
                      required
                    />
                  </Field>

                  <Field label="Description (optional)">
                    <input
                      value={transfer.description}
                      onChange={(event) =>
                        setTransfer((current) => ({
                          ...current,
                          description: event.target.value,
                        }))
                      }
                      placeholder="e.g. Split rent"
                    />
                  </Field>

                  <button
                    type="submit"
                    disabled={otherAccounts.length === 0}
                    title={
                      otherAccounts.length === 0
                        ? "Need at least one other account to transfer"
                        : ""
                    }
                  >
                    Transfer Funds
                  </button>
                </form>
              </div>

              <section className="history">
                <div className="history-header">
                  <div>
                    <h3>Transaction history</h3>
                    <p className="history-subtitle">
                      Chronological ledger entries (latest first)
                    </p>
                  </div>
                  <div className="filters">
                    <select
                      value={filter}
                      onChange={(event) => {
                        setFilter(event.target.value);
                        setPage(1);
                      }}
                    >
                      <option value="">All transaction types</option>
                      <option value="credit">Credit only</option>
                      <option value="debit">Debit only</option>
                    </select>
                  </div>
                </div>

                {loading ? <p className="muted loading-indicator">Refreshing data…</p> : null}

                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>Date & Time</th>
                        <th>Type</th>
                        <th>Amount</th>
                        <th>Reference ID</th>
                        <th>Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.data.length === 0 ? (
                        <tr>
                          <td colSpan="5" className="muted empty-cell">
                            No transactions recorded on this page.
                          </td>
                        </tr>
                      ) : (
                        history.data.map((item) => (
                          <tr key={item.id}>
                            <td className="time-cell">
                              {new Date(item.created_at).toLocaleString("en-IN")}
                            </td>
                            <td>
                              <span className={`pill ${item.type}`}>
                                {item.type === "credit" ? "+ Credit" : "- Debit"}
                              </span>
                            </td>
                            <td className={`amount-cell ${item.type}`}>
                              {item.type === "credit" ? "+" : "-"} ₹{money(item.amount)}
                            </td>
                            <td className="mono-cell">{item.reference_id}</td>
                            <td>{item.description || "—"}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="pager">
                  <p>
                    Page {pagination.page} of {pagination.total_pages || 1} ·{" "}
                    <strong>{pagination.total_records}</strong> transactions · page size{" "}
                    {pagination.limit}
                  </p>
                  <div className="pager-buttons">
                    <button
                      type="button"
                      disabled={pagination.page <= 1}
                      onClick={() => setPage((current) => Math.max(1, current - 1))}
                    >
                      ← Previous
                    </button>
                    <button
                      type="button"
                      disabled={
                        pagination.total_pages === 0 || pagination.page >= pagination.total_pages
                      }
                      onClick={() => setPage((current) => current + 1)}
                    >
                      Next →
                    </button>
                  </div>
                </div>
              </section>
            </>
          )}
        </main>
      </section>
    </div>
  );
}
