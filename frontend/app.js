/**
 * app.js
 * ------
 * Shared client-side logic for the Medical Supplies CRM.
 *
 * Contains:
 *  - API_BASE_URL config
 *  - Session management (JWT stored in localStorage)
 *  - Generic authenticated fetch helper
 *  - Login handler used by index.html
 *  - Sales rep dashboard logic (dashboard.html)
 *  - Manager dashboard logic + AI chatbot (admin_dashboard.html)
 *
 * Exposed globally as `window.MedCRM` so each page's inline <script> can call
 * only the pieces it needs.
 */

// Replace this with your actual production backend URL after deployment
const PROD_API_URL = "";
const API_BASE_URL = (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost") 
    ? "http://127.0.0.1:8000" 
    : PROD_API_URL;
const SESSION_KEY = "medcrm_session";

// ---------------------------------------------------------------------------
// Session helpers
// ---------------------------------------------------------------------------

function getSession() {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function setSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

/**
 * Guards a page so only users with the given role can view it.
 * Redirects to `redirectTo` (usually the login page) otherwise.
 */
function requireRole(role, redirectTo) {
  const session = getSession();
  if (!session || !session.access_token) {
    window.location.href = redirectTo;
    return;
  }
  if (session.role !== role) {
    // Logged in, but wrong role -> send them to their correct dashboard
    // instead of the login page.
    window.location.href = session.role === "admin" ? "admin_dashboard.html" : "dashboard.html";
    return;
  }
  document.addEventListener("DOMContentLoaded", () => {
    const welcome = document.getElementById("welcome-text");
    if (welcome) welcome.textContent = `Signed in as ${session.username}`;
    const logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn) logoutBtn.addEventListener("click", logout);
  });
}

function logout() {
  clearSession();
  window.location.href = "index.html";
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

/**
 * Authenticated fetch wrapper. Automatically attaches the JWT and parses
 * JSON, throwing an Error with the backend's `detail` message on failure.
 */
async function apiFetch(path, options = {}) {
  const session = getSession();
  const headers = Object.assign({}, options.headers || {});

  if (!(options.body instanceof URLSearchParams)) {
    headers["Content-Type"] = "application/json";
  }
  if (session && session.access_token) {
    headers["Authorization"] = `Bearer ${session.access_token}`;
  }

  const resp = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });

  if (resp.status === 401) {
    clearSession();
    window.location.href = "index.html";
    throw new Error("Session expired. Please log in again.");
  }

  let data = null;
  try {
    data = await resp.json();
  } catch {
    /* no JSON body */
  }

  if (!resp.ok) {
    const message = (data && (data.detail || data.message)) || `Request failed (${resp.status})`;
    throw new Error(typeof message === "string" ? message : JSON.stringify(message));
  }

  return data;
}

async function login(username, password) {
  const body = new URLSearchParams();
  body.set("username", username);
  body.set("password", password);

  const resp = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = await resp.json().catch(() => null);

  if (!resp.ok) {
    throw new Error((data && data.detail) || "Invalid username or password");
  }

  setSession(data);
  return data;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatCurrency(amount) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount || 0);
}

function formatDateTime(isoString) {
  try {
    return new Date(isoString).toLocaleString();
  } catch {
    return isoString;
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// ---------------------------------------------------------------------------
// Sales Rep Dashboard (dashboard.html)
// ---------------------------------------------------------------------------

function initRepDashboard() {
  document.addEventListener("DOMContentLoaded", () => {
    loadRepLeads();

    document.getElementById("lead-form").addEventListener("submit", handleAddLead);
    document.getElementById("call-log-form").addEventListener("submit", handleLogCall);
  });
}

async function loadRepLeads() {
  const container = document.getElementById("leads-container");
  const countBadge = document.getElementById("lead-count-badge");

  try {
    const leads = await apiFetch("/leads/");
    countBadge.textContent = `${leads.length} lead${leads.length === 1 ? "" : "s"}`;

    if (leads.length === 0) {
      container.innerHTML = `<div class="text-muted small">No leads yet. Add your first lead using the form.</div>`;
      return;
    }

    container.innerHTML = leads.map(renderLeadCard).join("");

    // Wire up "Log Call" buttons
    container.querySelectorAll("[data-log-call]").forEach((btn) => {
      btn.addEventListener("click", () => openCallModal(btn.dataset.leadId, btn.dataset.leadName));
    });
  } catch (err) {
    container.innerHTML = `<div class="alert alert-danger py-2">${escapeHtml(err.message)}</div>`;
  }
}

function renderLeadCard(lead) {
  return `
    <div class="lead-card">
      <div class="lead-card-main">
        <div class="lead-card-name">${escapeHtml(lead.name)}</div>
        <div class="lead-card-meta">
          <span class="badge bg-light text-dark border">${escapeHtml(lead.facility_type)}</span>
          <span class="text-muted small ms-2">${escapeHtml(lead.phone)}</span>
        </div>
        ${lead.notes ? `<div class="lead-card-notes">${escapeHtml(lead.notes)}</div>` : ""}
      </div>
      <div class="lead-card-actions">
        <a class="btn btn-sm btn-whatsapp" href="${lead.whatsapp_link}" target="_blank" rel="noopener">WhatsApp</a>
        <a class="btn btn-sm btn-call" href="${lead.call_link}">Call</a>
        <button class="btn btn-sm btn-outline-secondary" data-log-call data-lead-id="${lead.id}" data-lead-name="${escapeHtml(lead.name)}">
          Log Call
        </button>
      </div>
    </div>
  `;
}

async function handleAddLead(e) {
  e.preventDefault();
  const alertBox = document.getElementById("lead-form-alert");
  alertBox.classList.add("d-none");

  const payload = {
    name: document.getElementById("lead-name").value.trim(),
    phone: document.getElementById("lead-phone").value.trim(),
    facility_type: document.getElementById("lead-facility-type").value,
    notes: document.getElementById("lead-notes").value.trim() || null,
  };

  try {
    await apiFetch("/leads/", { method: "POST", body: JSON.stringify(payload) });
    document.getElementById("lead-form").reset();
    await loadRepLeads();
  } catch (err) {
    alertBox.textContent = err.message;
    alertBox.classList.remove("d-none");
  }
}

function openCallModal(leadId, leadName) {
  document.getElementById("call-lead-id").value = leadId;
  document.getElementById("call-lead-name").textContent = leadName;
  document.getElementById("call-log-form").reset();
  document.getElementById("call-lead-id").value = leadId; // reset() clears hidden input too, so set again
  document.getElementById("call-form-alert").classList.add("d-none");

  const modal = new bootstrap.Modal(document.getElementById("callModal"));
  modal.show();
}

async function handleLogCall(e) {
  e.preventDefault();
  const alertBox = document.getElementById("call-form-alert");
  alertBox.classList.add("d-none");

  const payload = {
    lead_id: parseInt(document.getElementById("call-lead-id").value, 10),
    call_result: document.getElementById("call-result").value,
    sales_amount: parseFloat(document.getElementById("call-amount").value || "0"),
    notes: document.getElementById("call-notes").value.trim() || null,
  };

  try {
    await apiFetch("/call-logs/", { method: "POST", body: JSON.stringify(payload) });
    bootstrap.Modal.getInstance(document.getElementById("callModal")).hide();
    await loadRepLeads();
  } catch (err) {
    alertBox.textContent = err.message;
    alertBox.classList.remove("d-none");
  }
}

// ---------------------------------------------------------------------------
// Manager / Admin Dashboard (admin_dashboard.html)
// ---------------------------------------------------------------------------

function initAdminDashboard() {
  document.addEventListener("DOMContentLoaded", () => {
    loadAdminData();
    document.getElementById("chat-form").addEventListener("submit", handleChatSubmit);
  });
}

async function loadAdminData() {
  const leadsBody = document.getElementById("admin-leads-tbody");
  const callsBody = document.getElementById("admin-calls-tbody");

  try {
    const [leads, calls] = await Promise.all([apiFetch("/leads/"), apiFetch("/call-logs/")]);

    // KPIs
    document.getElementById("kpi-leads").textContent = leads.length;
    document.getElementById("kpi-calls").textContent = calls.length;
    const totalSales = calls.reduce((sum, c) => sum + (c.sales_amount || 0), 0);
    document.getElementById("kpi-sales").textContent = formatCurrency(totalSales);

    // Leads table (team-wide - no role filter applied by admin)
    leadsBody.innerHTML = leads.length
      ? leads.map(renderAdminLeadRow).join("")
      : `<tr><td colspan="5" class="text-muted small">No leads yet.</td></tr>`;

    // Calls table
    callsBody.innerHTML = calls.length
      ? calls.map(renderAdminCallRow).join("")
      : `<tr><td colspan="5" class="text-muted small">No call logs yet.</td></tr>`;

    // Analytics charts
    if (typeof Chart !== "undefined") {
      renderAnalytics(leads, calls);
    }
  } catch (err) {
    leadsBody.innerHTML = `<tr><td colspan="5"><div class="alert alert-danger py-2 mb-0">${escapeHtml(err.message)}</div></td></tr>`;
  }
}

function renderAdminLeadRow(lead) {
  return `
    <tr>
      <td>
        <div class="fw-semibold">${escapeHtml(lead.name)}</div>
        ${lead.notes ? `<div class="text-muted small">${escapeHtml(lead.notes)}</div>` : ""}
      </td>
      <td>${escapeHtml(lead.facility_type)}</td>
      <td><span class="badge bg-light text-dark border">${escapeHtml(lead.assigned_rep_username || "—")}</span></td>
      <td>${escapeHtml(lead.phone)}</td>
      <td>
        <a class="btn btn-sm btn-whatsapp" href="${lead.whatsapp_link}" target="_blank" rel="noopener">WhatsApp</a>
        <a class="btn btn-sm btn-call" href="${lead.call_link}">Call</a>
      </td>
    </tr>
  `;
}

function renderAdminCallRow(call) {
  const resultClass = call.call_result === "Sold" ? "text-success fw-semibold" : "";
  return `
    <tr>
      <td class="text-muted small">${formatDateTime(call.timestamp)}</td>
      <td>${escapeHtml(call.rep_username || "—")}</td>
      <td>${escapeHtml(call.lead_name || "—")}</td>
      <td class="${resultClass}">${escapeHtml(call.call_result)}</td>
      <td>${formatCurrency(call.sales_amount)}</td>
    </tr>
  `;
}

// --- Analytics ---

let chartSalesInstance = null;
let chartOutcomesInstance = null;
let chartFacilitiesInstance = null;

function renderAnalytics(leads, calls) {
  const salesByRep = {};
  calls.forEach(c => {
    const rep = c.rep_username || "Unassigned";
    salesByRep[rep] = (salesByRep[rep] || 0) + (c.sales_amount || 0);
  });

  const outcomes = {};
  calls.forEach(c => {
    const res = c.call_result || "Unknown";
    outcomes[res] = (outcomes[res] || 0) + 1;
  });

  const facilities = {};
  leads.forEach(l => {
    const type = l.facility_type || "Unknown";
    facilities[type] = (facilities[type] || 0) + 1;
  });

  const maintainOpts = { maintainAspectRatio: false, responsive: true };

  if (chartSalesInstance) chartSalesInstance.destroy();
  if (chartOutcomesInstance) chartOutcomesInstance.destroy();
  if (chartFacilitiesInstance) chartFacilitiesInstance.destroy();

  const ctxSales = document.getElementById("chart-sales");
  if (ctxSales) {
    chartSalesInstance = new Chart(ctxSales, {
      type: 'bar',
      data: {
        labels: Object.keys(salesByRep),
        datasets: [{
          label: 'Total Sales ($)',
          data: Object.values(salesByRep),
          backgroundColor: '#4361ee',
          borderRadius: 4
        }]
      },
      options: maintainOpts
    });
  }

  const ctxOutcomes = document.getElementById("chart-outcomes");
  if (ctxOutcomes) {
    chartOutcomesInstance = new Chart(ctxOutcomes, {
      type: 'doughnut',
      data: {
        labels: Object.keys(outcomes),
        datasets: [{
          data: Object.values(outcomes),
          backgroundColor: ['#4cc9f0', '#f72585', '#3a0ca3', '#7209b7', '#4895ef']
        }]
      },
      options: maintainOpts
    });
  }

  const ctxFacilities = document.getElementById("chart-facilities");
  if (ctxFacilities) {
    chartFacilitiesInstance = new Chart(ctxFacilities, {
      type: 'pie',
      data: {
        labels: Object.keys(facilities),
        datasets: [{
          data: Object.values(facilities),
          backgroundColor: ['#f8961e', '#f9c74f', '#90be6d', '#43aa8b', '#577590']
        }]
      },
      options: maintainOpts
    });
  }
}

// --- AI Chatbot ---

async function handleChatSubmit(e) {
  e.preventDefault();
  const input = document.getElementById("chat-input");
  const sendBtn = document.getElementById("chat-send-btn");
  const prompt = input.value.trim();
  if (!prompt) return;

  appendChatMessage(prompt, "user");
  input.value = "";
  sendBtn.disabled = true;

  const typingEl = appendChatMessage("Analyzing team performance…", "bot", true);

  try {
    const data = await apiFetch("/api/manager-chat", {
      method: "POST",
      body: JSON.stringify({ prompt }),
    });
    typingEl.remove();
    appendChatMessage(data.reply, "bot");
  } catch (err) {
    typingEl.remove();
    appendChatMessage(`⚠️ ${err.message}`, "bot");
  } finally {
    sendBtn.disabled = false;
  }
}

function appendChatMessage(text, sender, isTyping = false) {
  const chatWindow = document.getElementById("chat-window");
  const msg = document.createElement("div");
  msg.className = `chat-msg chat-msg-${sender}${isTyping ? " chat-msg-typing" : ""}`;
  msg.textContent = text;
  chatWindow.appendChild(msg);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return msg;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

window.MedCRM = {
  getSession,
  setSession,
  clearSession,
  requireRole,
  logout,
  apiFetch,
  login,
  initRepDashboard,
  initAdminDashboard,
};
