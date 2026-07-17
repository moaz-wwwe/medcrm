// Base API URL (Update this if backend is hosted elsewhere)
const API_BASE = "https://medcrm-zeta.vercel.app";

// -------------------------------------------------------------
// UI Utilities (Toasts, Modals, Skeleton)
// -------------------------------------------------------------
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    // Add icon based on type
    let icon = '';
    if(type === 'success') {
        icon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
    } else {
        icon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
    }
    
    // Handle array/object errors (like FastAPI validation errors)
    let displayMessage = message;
    if (typeof message === 'object') {
        if (Array.isArray(message) && message.length > 0 && message[0].msg) {
            displayMessage = message[0].msg; // Extract the first Pydantic error message
        } else {
            displayMessage = JSON.stringify(message);
        }
    }

    toast.innerHTML = `${icon} <span>${displayMessage}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s forwards cubic-bezier(0.175, 0.885, 0.32, 1.275)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function openModal(id) {
    const modal = document.getElementById(id);
    if(modal) modal.classList.add('active');
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if(modal) modal.classList.remove('active');
}

// Close modals when clicking outside
document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
        if(e.target === overlay) overlay.classList.remove('active');
    });
});

// Setup close buttons
document.querySelectorAll('.close-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const modal = e.target.closest('.modal-overlay');
        if(modal) modal.classList.remove('active');
    });
});

// -------------------------------------------------------------
// Authentication
// -------------------------------------------------------------
function getAuthHeaders() {
    const token = localStorage.getItem('token');
    return token ? { "Authorization": `Bearer ${token}` } : {};
}

function checkAuthAndRole() {
    const token = localStorage.getItem('token');
    const role = localStorage.getItem('role');
    const currentPage = window.location.pathname.split('/').pop();

    if (!token && currentPage !== 'index.html' && currentPage !== '') {
        window.location.href = 'index.html';
        return;
    }
    
    // We intentionally removed the auto-redirect from index.html if token exists
    // based on user request, so they can access the login page manually via the link.

    // Show/Hide admin specific elements
    if (role === 'admin') {
        document.querySelectorAll('.admin-only').forEach(el => {
            el.classList.remove('admin-only');
        });
    }

    // Set Welcome message
    const welcomeMsg = document.getElementById('welcomeMessage');
    const username = localStorage.getItem('username');
    if (welcomeMsg && username) {
        welcomeMsg.innerText = `Logged in as ${username}`;
    }
}

// Run auth check on load
document.addEventListener("DOMContentLoaded", checkAuthAndRole);

// Logout
const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
        localStorage.clear();
        window.location.href = "index.html";
    });
}

// Login Form Submit
const loginForm = document.getElementById("loginForm");
if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const btn = loginForm.querySelector('button');
        const originalText = btn.innerHTML;
        btn.innerHTML = `<span class="skeleton skeleton-avatar" style="width:20px;height:20px;margin-right:8px;display:inline-block;"></span> Loading...`;
        btn.disabled = true;

        const formData = new URLSearchParams();
        formData.append('username', document.getElementById("username").value);
        formData.append('password', document.getElementById("password").value);

        try {
            const res = await fetch(`${API_BASE}/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: formData
            });
            const data = await res.json();
            if (res.ok) {
                localStorage.setItem("token", data.access_token);
                
                // Fetch user profile to get role
                const profileRes = await fetch(`${API_BASE}/auth/me`, {
                    headers: { "Authorization": `Bearer ${data.access_token}` }
                });
                const profile = await profileRes.json();
                
                localStorage.setItem("role", profile.role);
                localStorage.setItem("username", profile.username);
                
                showToast('Login successful!');
                setTimeout(() => {
                    if (profile.role === 'admin') {
                        window.location.href = "admin_dashboard.html";
                    } else {
                        window.location.href = "dashboard.html";
                    }
                }, 500);
            } else {
                showToast(data.detail || "Invalid credentials", "error");
            }
        } catch (error) {
            showToast("Server connection failed", "error");
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    });
}

// -------------------------------------------------------------
// Dashboard (Leads & Call Logs)
// -------------------------------------------------------------

// Fetch Leads (Dashboard)
async function fetchLeads() {
    const leadsList = document.getElementById("leadsList");
    if (!leadsList) return;

    try {
        const res = await fetch(`${API_BASE}/leads/`, {
            headers: getAuthHeaders()
        });
        
        if (res.status === 401) {
            localStorage.clear();
            window.location.href = "index.html";
            return;
        }

        const data = await res.json();
        
        if (data.length === 0) {
            leadsList.innerHTML = `<div class="glass-panel" style="padding:40px; text-align:center; color:var(--text-muted);">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" style="margin-bottom:10px;"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                <p>No leads found. Start adding some!</p>
            </div>`;
            return;
        }

        leadsList.innerHTML = "";
        data.forEach(lead => {
            const card = document.createElement("div");
            card.className = "lead-card glass-panel";
            card.innerHTML = `
                <div class="lead-card-header">
                    <div>
                        <div class="lead-name">${lead.name}</div>
                        <div class="lead-meta">
                            <span class="badge ${lead.notes ? 'contacted' : 'new'}">${lead.facility_type}</span>
                            <span>Rep: ${lead.assigned_rep_username || 'N/A'}</span>
                        </div>
                    </div>
                    <button onclick="prepareLogActivity(${lead.id})" class="btn btn-secondary" style="padding:4px 8px; font-size:0.75rem;">Process Lead</button>
                </div>
                <p style="font-size:0.875rem; margin-bottom:0;"><strong>Phone:</strong> ${lead.phone}</p>
                <p style="font-size:0.875rem;"><strong>Notes:</strong> ${lead.notes || 'No notes'}</p>
                <div class="lead-actions">
                    <a href="${lead.call_link}" class="action-btn call">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                        Call
                    </a>
                    <a href="${lead.whatsapp_link}" target="_blank" class="action-btn whatsapp">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
                        WhatsApp
                    </a>
                </div>
            `;
            leadsList.appendChild(card);
        });
    } catch (error) {
        showToast("Error loading leads", "error");
    }
}

// Add Lead Modal Logic
const addLeadFab = document.getElementById("addLeadFab");
if (addLeadFab) {
    addLeadFab.addEventListener('click', () => openModal('addLeadModal'));
}

const addLeadForm = document.getElementById("addLeadForm");
if (addLeadForm) {
    addLeadForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        
        const payload = {
            name: document.getElementById("leadName").value,
            phone: document.getElementById("leadPhone").value,
            facility_type: document.getElementById("leadFacility").value,
            notes: document.getElementById("leadNotes").value,
            assigned_to: document.getElementById("leadAssignedTo") ? parseInt(document.getElementById("leadAssignedTo").value) || 0 : 0
        };

        try {
            const res = await fetch(`${API_BASE}/leads/`, {
                method: "POST",
                headers: {
                    ...getAuthHeaders(),
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (res.ok) {
                showToast("Lead added successfully!");
                closeModal('addLeadModal');
                addLeadForm.reset();
                fetchLeads();
                if(document.getElementById('adminLeadsTable')) fetchAdminData();
            } else {
                showToast(data.detail[0]?.msg || data.detail || "Error adding lead", "error");
            }
        } catch (error) {
            showToast("Network error", "error");
        }
    });
}

// Log Activity Logic
window.prepareLogActivity = function(leadId) {
    document.getElementById("logLeadId").value = leadId;
    openModal('addLogModal');
}

const addLogForm = document.getElementById("addLogForm");
if (addLogForm) {
    addLogForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const payload = {
            lead_id: parseInt(document.getElementById("logLeadId").value),
            call_result: document.getElementById("logResult").value,
            sales_amount: parseFloat(document.getElementById("logSales").value) || 0.0,
            notes: document.getElementById("logNotes").value
        };

        try {
            const res = await fetch(`${API_BASE}/call-logs/`, {
                method: "POST",
                headers: {
                    ...getAuthHeaders(),
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                showToast("Lead processed successfully!");
                closeModal('addLogModal');
                
                // Refresh leads queue to remove the processed lead and pull a new one
                fetchLeads();
                
                // Also refresh recent activity if on dashboard
                if (typeof fetchRecentActivity === 'function') {
                    fetchRecentActivity();
                }
                
                addLogForm.reset();
                if(document.getElementById('adminLogsTable')) fetchAdminData();
            } else {
                const data = await res.json();
                showToast(data.detail || "Error logging activity", "error");
            }
        } catch (error) {
            showToast("Network error", "error");
        }
    });
}

// -------------------------------------------------------------
// Admin Dashboard
// -------------------------------------------------------------
async function fetchAdminData() {
    const leadsTbody = document.getElementById("adminLeadsTable");
    const logsTbody = document.getElementById("adminLogsTable");
    
    if (!leadsTbody || !logsTbody) return;

    try {
        // Fetch Leads
        const leadsRes = await fetch(`${API_BASE}/leads/`, { headers: getAuthHeaders() });
        if (leadsRes.ok) {
            const leads = await leadsRes.json();
            let html = "";
            
            // Limit to 200 leads to prevent browser from freezing on huge datasets
            const displayLeads = leads.slice(0, 200);
            
            displayLeads.forEach(l => {
                html += `
                    <tr>
                        <td>${l.id}</td>
                        <td><strong>${l.name}</strong></td>
                        <td><span class="badge new">${l.facility_type}</span></td>
                        <td>${l.phone}</td>
                        <td>${l.assigned_rep_username || 'N/A'}</td>
                        <td style="color:var(--text-muted); font-size:0.8rem;">${new Date(l.created_at).toLocaleDateString()}</td>
                    </tr>
                `;
            });
            
            if (leads.length > 200) {
                html += `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); font-style:italic;">Showing latest 200 of ${leads.length} total leads.</td></tr>`;
            }
            
            leadsTbody.innerHTML = html;
        }

        // Fetch Logs
        const logsRes = await fetch(`${API_BASE}/call-logs/`, { headers: getAuthHeaders() });
        if (logsRes.ok) {
            const logs = await logsRes.json();
            let html = "";
            
            const displayLogs = logs.slice(0, 200);
            
            displayLogs.forEach(l => {
                html += `
                    <tr>
                        <td style="color:var(--text-muted); font-size:0.8rem;">${new Date(l.timestamp).toLocaleString()}</td>
                        <td><strong>${l.rep_username || 'N/A'}</strong></td>
                        <td>${l.lead_name || l.lead_id}</td>
                        <td><span class="badge contacted">${l.call_result}</span></td>
                        <td style="color:var(--accent-green); font-weight:bold;">$${l.sales_amount.toFixed(2)}</td>
                        <td>${l.notes || '-'}</td>
                    </tr>
                `;
            });
            
            if (logs.length > 200) {
                html += `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); font-style:italic;">Showing latest 200 of ${logs.length} logs.</td></tr>`;
            }
            
            logsTbody.innerHTML = html;
        }
    } catch(err) {
        showToast("Error loading admin data", "error");
    }
}

// Admin: Create User
const createUserForm = document.getElementById("createUserForm");
if (createUserForm) {
    createUserForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const payload = {
            username: document.getElementById("newUsername").value,
            password: document.getElementById("newPassword").value,
            full_name: document.getElementById("newFullName").value,
            role: document.getElementById("newRole").value
        };

        try {
            const res = await fetch(`${API_BASE}/auth/register`, {
                method: "POST",
                headers: {
                    ...getAuthHeaders(),
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (res.ok) {
                showToast("User created successfully!");
                createUserForm.reset();
            } else {
                showToast(data.detail || "Error creating user", "error");
            }
        } catch (error) {
            showToast("Network error", "error");
        }
    });
}

// Trigger Daily Report manually
const triggerReportBtn = document.getElementById("triggerReportBtn");
if (triggerReportBtn) {
    triggerReportBtn.addEventListener("click", async () => {
        const originalText = triggerReportBtn.innerHTML;
        triggerReportBtn.innerHTML = `<span class="skeleton skeleton-avatar" style="width:16px;height:16px;margin-right:4px;display:inline-block;"></span> Sending...`;
        triggerReportBtn.disabled = true;

        try {
            // We use default_secret here to trigger it manually, matching our vercel.json
            const res = await fetch(`${API_BASE}/api/cron/daily-report?token=default_secret`);
            if (res.ok) {
                showToast("Report generated and sent to Telegram!", "success");
            } else {
                showToast("Failed to trigger report.", "error");
            }
        } catch (error) {
            showToast("Network error triggering report", "error");
        } finally {
            triggerReportBtn.innerHTML = originalText;
            triggerReportBtn.disabled = false;
        }
    });
}

// Bulk Upload CSV
const uploadCsvBtn = document.getElementById("uploadCsvBtn");
const csvFileInput = document.getElementById("csvFileInput");
if (uploadCsvBtn && csvFileInput) {
    uploadCsvBtn.addEventListener("click", () => csvFileInput.click());

    csvFileInput.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const originalText = uploadCsvBtn.innerHTML;
        uploadCsvBtn.innerHTML = `<span class="skeleton skeleton-avatar" style="width:16px;height:16px;margin-right:4px;display:inline-block;"></span> Uploading...`;
        uploadCsvBtn.disabled = true;

        const formData = new FormData();
        formData.append("file", file);

        try {
            const res = await fetch(`${API_BASE}/leads/bulk-upload`, {
                method: "POST",
                headers: getAuthHeaders(),
                body: formData
            });
            const data = await res.json();
            if (res.ok) {
                showToast(data.message, "success");
                fetchAdminData(); // Refresh the tables
            } else {
                showToast(data.detail || "Error uploading CSV", "error");
            }
        } catch (error) {
            showToast("Network error during upload", "error");
        } finally {
            uploadCsvBtn.innerHTML = originalText;
            uploadCsvBtn.disabled = false;
            csvFileInput.value = ""; // Reset input
        }
    });
}

// -------------------------------------------------------------
// AI Manager Chat
// -------------------------------------------------------------
const navManagerChat = document.getElementById("navManagerChat");
if (navManagerChat) {
    navManagerChat.addEventListener("click", () => openModal('aiManagerModal'));
}

const aiChatForm = document.getElementById("aiChatForm");
if (aiChatForm) {
    aiChatForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const input = document.getElementById("aiMessageInput");
        const msgText = input.value.trim();
        if (!msgText) return;

        const chatWindow = document.getElementById("aiChatWindow");
        
        // Add user msg
        const userDiv = document.createElement("div");
        userDiv.className = "chat-msg user";
        userDiv.setAttribute("dir", "auto");
        userDiv.innerText = msgText;
        chatWindow.appendChild(userDiv);
        input.value = "";
        
        // Add loading state
        const loadingDiv = document.createElement("div");
        loadingDiv.className = "chat-msg ai";
        loadingDiv.innerHTML = `<span class="skeleton skeleton-text short" style="margin:0;"></span>`;
        chatWindow.appendChild(loadingDiv);
        chatWindow.scrollTop = chatWindow.scrollHeight;

        try {
            const res = await fetch(`${API_BASE}/api/manager-chat`, {
                method: "POST",
                headers: {
                    ...getAuthHeaders(),
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ prompt: msgText })
            });
            
            loadingDiv.remove();
            
            if (res.ok) {
                const data = await res.json();
                const aiDiv = document.createElement("div");
                aiDiv.className = "chat-msg ai";
                aiDiv.setAttribute("dir", "auto");
                // Convert markdown simple formatting (e.g., bold) to html for better display
                let htmlText = data.reply.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                htmlText = htmlText.replace(/\n/g, '<br>');
                aiDiv.innerHTML = htmlText;
                chatWindow.appendChild(aiDiv);
            } else {
                const data = await res.json();
                showToast(data.detail || "AI is currently unavailable", "error");
            }
        } catch (error) {
            loadingDiv.remove();
            showToast("Network error connecting to AI", "error");
        }
        
        chatWindow.scrollTop = chatWindow.scrollHeight;
    });
}

// Initialize on page load
document.addEventListener("DOMContentLoaded", () => {
    if (document.getElementById("leadsList")) {
        fetchLeads();
    }
    if (document.getElementById("adminLeadsTable")) {
        fetchAdminData();
    }
});
