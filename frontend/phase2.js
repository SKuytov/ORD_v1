// frontend/phase2.js — Phase 2: Procurement Workflow & Collaboration
// Super Admin, User Management, Order Claiming, RFQ, CAD Workflow

(function() {
    'use strict';

    const API_BASE = '/api';

    // ====== HELPERS ======
    function getToken() { return localStorage.getItem('authToken'); }
    function getUser() { return window.currentUser; }
    function escHtml(s) { if (!s) return ''; return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c] || c)); }
    function fmtDate(d) { if (!d) return '-'; const dt = new Date(d); return isNaN(dt) ? d : dt.toLocaleDateString(); }
    function fmtDateTime(d) { if (!d) return '-'; const dt = new Date(d); return isNaN(dt) ? d : dt.toLocaleString(); }
    function timeAgo(d) {
        if (!d) return '';
        const diff = Date.now() - new Date(d).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 60) return `${mins}m ago`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs}h ago`;
        return `${Math.floor(hrs / 24)}d ago`;
    }

    async function apiFetch(path, opts = {}) {
        const res = await fetch(`${API_BASE}${path}`, {
            ...opts,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`,
                ...(opts.headers || {})
            }
        });
        return res.json();
    }
    async function apiGet(path) { return apiFetch(path); }
    async function apiPost(path, body) { return apiFetch(path, { method: 'POST', body: JSON.stringify(body) }); }

    function showToast(msg, type = 'success') {
        if (window.showToast) window.showToast(msg, type);
        else if (window.PartPulseToast) window.PartPulseToast.show(msg, type);
        else alert(msg);
    }

    function userHasRole(role) {
        const u = getUser();
        if (!u) return false;
        if (u.is_super_admin) return true;
        if (u.role === role) return true;
        if (u.roles && Array.isArray(u.roles) && u.roles.includes(role)) return true;
        return false;
    }

    function isSuperAdmin() { const u = getUser(); return u && u.is_super_admin; }
    function isProcurement() { return userHasRole('procurement') || userHasRole('admin'); }
    function isCadDesigner() { return userHasRole('cad_designer'); }

    // ====== ROLE CHIP COLORS ======
    const ROLE_COLORS = {
        procurement: { bg: '#3b82f6', text: '#fff' },
        cad_designer: { bg: '#8b5cf6', text: '#fff' },
        admin: { bg: '#f97316', text: '#fff' },
        manager: { bg: '#22c55e', text: '#fff' },
        technician: { bg: '#6b7280', text: '#fff' },
        requester: { bg: '#6b7280', text: '#fff' },
        super_admin: { bg: '#eab308', text: '#000' }
    };

    function roleChip(role) {
        const c = ROLE_COLORS[role] || ROLE_COLORS.requester;
        return `<span class="phase2-role-chip" style="background:${c.bg};color:${c.text};padding:2px 8px;border-radius:12px;font-size:0.75rem;font-weight:600;">${escHtml(role)}</span>`;
    }

    function crownIcon() {
        return '<span class="super-admin-crown" title="Super Admin" style="color:#eab308;font-size:1.1em;margin-right:2px;">&#x1F451;</span>';
    }

    // ====== SUPER ADMIN NAME DECORATION ======
    // Decorate user's name display with crown if super admin
    function decorateUserName() {
        const u = getUser();
        if (!u) return;
        const nameEl = document.getElementById('userName');
        if (nameEl && u.is_super_admin) {
            nameEl.innerHTML = crownIcon() + escHtml(u.name);
        }

        // Role badge update for multi-role
        const badge = document.getElementById('userRole');
        if (badge) {
            if (u.is_super_admin) {
                badge.innerHTML = crownIcon() + ' Super Admin';
                badge.style.background = '#eab308';
                badge.style.color = '#000';
            } else if (u.roles && u.roles.length > 1) {
                badge.textContent = u.roles.map(r => r.charAt(0).toUpperCase() + r.slice(1)).join(' / ');
            }
        }
    }

    // ====== SIDEBAR SETUP ======
    function setupPhase2Sidebar() {
        const u = getUser();
        if (!u) return;

        const sidebar = document.getElementById('sidebarNav');
        if (!sidebar) return;

        // Find the admin divider to insert before
        const adminDivider = document.getElementById('sidebarAdminDivider');

        // Procurement Board (for procurement/admin)
        if (isProcurement()) {
            if (!document.getElementById('sidebarProcBoardBtn')) {
                const btn = document.createElement('button');
                btn.className = 'nav-item';
                btn.id = 'sidebarProcBoardBtn';
                btn.dataset.tab = 'procBoardTab';
                btn.innerHTML = '<span class="nav-icon">&#x1F4CB;</span><span>Procurement Board</span>';
                // Insert after Parts Catalog
                const partsCat = document.getElementById('sidebarPartsCatalogBtn');
                if (partsCat && partsCat.nextSibling) {
                    sidebar.insertBefore(btn, partsCat.nextSibling);
                } else if (adminDivider) {
                    sidebar.insertBefore(btn, adminDivider);
                } else {
                    sidebar.appendChild(btn);
                }
            }

            // RFQ History
            if (!document.getElementById('sidebarRfqHistoryBtn')) {
                const btn = document.createElement('button');
                btn.className = 'nav-item';
                btn.id = 'sidebarRfqHistoryBtn';
                btn.dataset.tab = 'rfqHistoryTab';
                btn.innerHTML = '<span class="nav-icon">&#x1F4C4;</span><span>RFQ History</span>';
                const procBtn = document.getElementById('sidebarProcBoardBtn');
                if (procBtn && procBtn.nextSibling) {
                    sidebar.insertBefore(btn, procBtn.nextSibling);
                } else {
                    sidebar.appendChild(btn);
                }
            }
        }

        // CAD Tasks (for cad_designer)
        if (isCadDesigner()) {
            if (!document.getElementById('sidebarCadTasksBtn')) {
                const btn = document.createElement('button');
                btn.className = 'nav-item';
                btn.id = 'sidebarCadTasksBtn';
                btn.dataset.tab = 'cadTasksTab';
                btn.innerHTML = '<span class="nav-icon">&#x1F4D0;</span><span>CAD Tasks</span>';
                const partsCat = document.getElementById('sidebarPartsCatalogBtn');
                if (partsCat && partsCat.nextSibling) {
                    sidebar.insertBefore(btn, partsCat.nextSibling);
                } else {
                    sidebar.appendChild(btn);
                }
            }
        }

        // System Settings (Super Admin only)
        if (isSuperAdmin()) {
            if (!document.getElementById('sidebarSystemSettingsBtn')) {
                const btn = document.createElement('button');
                btn.className = 'nav-item';
                btn.id = 'sidebarSystemSettingsBtn';
                btn.dataset.tab = 'systemSettingsTab';
                btn.innerHTML = '<span class="nav-icon">&#x2699;&#xFE0F;</span><span>System Settings</span>';
                sidebar.appendChild(btn);
            }
        }

        // Re-attach click handlers for new sidebar items
        document.querySelectorAll('.sidebar-nav .nav-item[data-tab]').forEach(item => {
            item.onclick = () => {
                const tab = item.dataset.tab;
                if (typeof switchTab === 'function') switchTab(tab);
                document.querySelectorAll('.sidebar-nav .nav-item').forEach(n => n.classList.remove('active'));
                document.querySelectorAll(`[data-tab="${tab}"]`).forEach(n => n.classList.add('active'));
                // Load data for Phase 2 tabs
                if (tab === 'procBoardTab') loadProcurementBoard();
                if (tab === 'rfqHistoryTab') loadRfqHistory();
                if (tab === 'cadTasksTab') loadCadTasks();
                if (tab === 'systemSettingsTab') loadSystemSettings();
            };
        });
    }

    // ====== USER MANAGEMENT (Super Admin) ======
    async function loadUserManagement() {
        const container = document.getElementById('userManagementBody');
        if (!container) return;

        container.innerHTML = '<div style="padding:2rem;text-align:center;">Loading users...</div>';

        const data = await apiGet('/users');
        if (!data.success) {
            container.innerHTML = '<div style="padding:2rem;color:#ef4444;">Failed to load users</div>';
            return;
        }

        const users = data.users;

        let html = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
            <h3 style="margin:0;">User Management</h3>
            <button class="btn btn-primary btn-sm" onclick="Phase2.openInviteModal()">+ Generate Invite</button>
        </div>
        <table class="phase2-table">
            <thead>
                <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Roles</th>
                    <th>Status</th>
                    <th>Last Login</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>`;

        for (const u of users) {
            const rolesArr = u.roles || [];
            const isSuper = !!u.is_super_admin;
            const roleChips = isSuper ? roleChip('super_admin') + ' ' : '';
            const otherChips = rolesArr.map(r => roleChip(r)).join(' ') || roleChip(u.role);
            const statusBadge = u.active
                ? '<span style="color:#22c55e;font-weight:600;">Active</span>'
                : '<span style="color:#ef4444;font-weight:600;">Inactive</span>';
            const nameDisplay = isSuper ? crownIcon() + escHtml(u.name) : escHtml(u.name);

            html += `<tr>
                <td>${nameDisplay}</td>
                <td>${escHtml(u.email)}</td>
                <td>${roleChips}${otherChips}</td>
                <td>${statusBadge}</td>
                <td>${fmtDateTime(u.last_login_at)}</td>
                <td>
                    <button class="btn btn-sm btn-secondary" onclick="Phase2.openRoleEditor(${u.id})" ${isSuper ? 'disabled title="Cannot edit Super Admin roles"' : ''}>Edit Roles</button>
                    ${!isSuper && u.active ? `<button class="btn btn-sm" style="background:#ef4444;color:#fff;margin-left:4px;" onclick="Phase2.deactivateUser(${u.id})">Deactivate</button>` : ''}
                    ${!isSuper && !u.active ? `<button class="btn btn-sm" style="background:#22c55e;color:#fff;margin-left:4px;" onclick="Phase2.activateUser(${u.id})">Activate</button>` : ''}
                </td>
            </tr>`;
        }

        html += '</tbody></table>';
        container.innerHTML = html;
    }

    async function openRoleEditor(userId) {
        const data = await apiGet('/users');
        if (!data.success) return;
        const user = data.users.find(u => u.id === userId);
        if (!user) return;

        const rolesArr = user.roles || [];
        const allRoles = ['procurement', 'cad_designer', 'manager', 'admin', 'requester'];

        let html = `
        <div class="modal-overlay" id="roleEditorModal" style="display:flex;position:fixed;inset:0;z-index:9999;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);">
            <div class="modal-card" style="max-width:400px;background:var(--card-bg, #1e293b);border-radius:12px;padding:1.5rem;">
                <h3 style="margin-top:0;">Edit Roles: ${escHtml(user.name)}</h3>
                <div id="roleCheckboxes" style="display:flex;flex-direction:column;gap:0.5rem;margin:1rem 0;">
                    ${allRoles.map(r => `
                        <label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;">
                            <input type="checkbox" value="${r}" ${rolesArr.includes(r) || user.role === r ? 'checked' : ''}>
                            ${roleChip(r)} <span>${r}</span>
                        </label>
                    `).join('')}
                </div>
                <div style="display:flex;gap:0.5rem;justify-content:flex-end;">
                    <button class="btn btn-secondary btn-sm" onclick="document.getElementById('roleEditorModal').remove()">Cancel</button>
                    <button class="btn btn-primary btn-sm" onclick="Phase2.saveRoles(${userId})">Save</button>
                </div>
            </div>
        </div>`;

        document.body.insertAdjacentHTML('beforeend', html);
    }

    async function saveRoles(userId) {
        const modal = document.getElementById('roleEditorModal');
        if (!modal) return;
        const checks = modal.querySelectorAll('#roleCheckboxes input[type="checkbox"]:checked');
        const roles = Array.from(checks).map(c => c.value);

        const data = await apiPost(`/users/${userId}/roles`, { roles });
        if (data.success) {
            showToast('Roles updated');
            modal.remove();
            loadUserManagement();
        } else {
            showToast(data.message || 'Failed to update roles', 'error');
        }
    }

    async function deactivateUser(userId) {
        if (!confirm('Deactivate this user? They will no longer be able to log in.')) return;
        const data = await apiPost(`/users/${userId}/deactivate`, {});
        if (data.success) {
            showToast('User deactivated');
            loadUserManagement();
        } else {
            showToast(data.message || 'Failed', 'error');
        }
    }

    async function activateUser(userId) {
        const data = await apiPost(`/users/${userId}/activate`, {});
        if (data.success) {
            showToast('User activated');
            loadUserManagement();
        } else {
            showToast(data.message || 'Failed', 'error');
        }
    }

    async function openInviteModal() {
        let html = `
        <div class="modal-overlay" id="inviteModal" style="display:flex;position:fixed;inset:0;z-index:9999;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);">
            <div class="modal-card" style="max-width:420px;background:var(--card-bg, #1e293b);border-radius:12px;padding:1.5rem;">
                <h3 style="margin-top:0;">Generate Invite Link</h3>
                <div class="form-group"><label>Name *</label><input type="text" id="inviteName" class="form-control" required></div>
                <div class="form-group"><label>Email *</label><input type="email" id="inviteEmail" class="form-control" required></div>
                <div class="form-group"><label>Role</label>
                    <select id="inviteRole" class="form-control">
                        <option value="requester">Requester</option>
                        <option value="procurement">Procurement</option>
                        <option value="cad_designer">CAD Designer</option>
                        <option value="manager">Manager</option>
                        <option value="admin">Admin</option>
                    </select>
                </div>
                <div id="inviteResult" style="display:none;margin:1rem 0;padding:1rem;background:rgba(34,197,94,0.1);border:1px solid #22c55e;border-radius:8px;">
                </div>
                <div style="display:flex;gap:0.5rem;justify-content:flex-end;">
                    <button class="btn btn-secondary btn-sm" onclick="document.getElementById('inviteModal').remove()">Close</button>
                    <button class="btn btn-primary btn-sm" id="btnSendInvite" onclick="Phase2.sendInvite()">Generate</button>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', html);
    }

    async function sendInvite() {
        const name = document.getElementById('inviteName').value.trim();
        const email = document.getElementById('inviteEmail').value.trim();
        const role = document.getElementById('inviteRole').value;
        if (!name || !email) { showToast('Name and email required', 'error'); return; }

        const data = await apiPost('/users/invite', { name, email, role });
        if (data.success) {
            const resultDiv = document.getElementById('inviteResult');
            const link = window.location.origin + data.invite_link;
            resultDiv.innerHTML = `
                <strong>Invite generated!</strong><br>
                <div style="margin-top:0.5rem;">
                    <label style="font-size:0.8rem;color:#94a3b8;">Invite Link:</label>
                    <input type="text" class="form-control" value="${escHtml(link)}" readonly onclick="this.select()" style="font-size:0.85rem;">
                </div>
                <div style="margin-top:0.5rem;">
                    <label style="font-size:0.8rem;color:#94a3b8;">Temporary Password:</label>
                    <input type="text" class="form-control" value="${escHtml(data.temp_password)}" readonly onclick="this.select()" style="font-size:0.85rem;">
                </div>
                <p style="font-size:0.75rem;color:#94a3b8;margin-top:0.5rem;">Expires: ${fmtDateTime(data.expires_at)}</p>
            `;
            resultDiv.style.display = 'block';
            document.getElementById('btnSendInvite').disabled = true;
            loadUserManagement();
        } else {
            showToast(data.message || 'Failed to generate invite', 'error');
        }
    }

    // ====== ORDER CLAIMING ======

    function renderClaimBadge(order) {
        if (!order.claimed_by_user_id) return '';
        const name = order.claimed_by_name || order.claimed_by_username || 'Unknown';
        const isMe = getUser() && order.claimed_by_user_id === getUser().id;
        const bg = isMe ? '#eab308' : '#f59e0b';
        return `<span class="phase2-claim-badge" style="background:${bg};color:#000;padding:2px 8px;border-radius:12px;font-size:0.7rem;font-weight:600;white-space:nowrap;" title="Claimed ${timeAgo(order.claimed_at)}">&#x1F512; ${escHtml(name)}</span>`;
    }

    function renderHelpBadge(order) {
        if (!order.help_requested) return '';
        return `<span style="background:#ef4444;color:#fff;padding:2px 8px;border-radius:12px;font-size:0.7rem;font-weight:600;">&#x26A0; Help Needed</span>`;
    }

    function renderClaimButtons(order) {
        const u = getUser();
        if (!u) return '';
        if (!isProcurement()) return '';

        let html = '';
        if (!order.claimed_by_user_id) {
            html += `<button class="btn btn-primary btn-sm" onclick="Phase2.claimOrder(${order.id})" style="margin-right:4px;">Claim This Order</button>`;
        } else if (order.claimed_by_user_id === u.id) {
            html += `<button class="btn btn-secondary btn-sm" onclick="Phase2.releaseOrder(${order.id})" style="margin-right:4px;">Release Claim</button>`;
            if (!order.help_requested) {
                html += `<button class="btn btn-sm" style="background:#f59e0b;color:#000;" onclick="Phase2.requestHelp(${order.id})">Request Help</button>`;
            }
        } else {
            if (isSuperAdmin()) {
                html += `<button class="btn btn-sm" style="background:#ef4444;color:#fff;" onclick="Phase2.releaseOrder(${order.id})">Force Release</button>`;
            }
        }
        return html;
    }

    function renderClaimBanner(order) {
        const u = getUser();
        if (!order.claimed_by_user_id) return '';
        if (order.claimed_by_user_id === (u && u.id)) return '';

        const name = order.claimed_by_name || order.claimed_by_username || 'Unknown';
        return `<div style="background:#f59e0b;color:#000;padding:0.75rem 1rem;border-radius:8px;margin-bottom:1rem;font-weight:600;">
            &#x1F512; This order is being worked by ${escHtml(name)} since ${fmtDateTime(order.claimed_at)}. View only.
        </div>`;
    }

    function renderHelpBanner(order) {
        if (!order.help_requested) return '';
        return `<div style="background:#ef4444;color:#fff;padding:0.75rem 1rem;border-radius:8px;margin-bottom:1rem;">
            &#x26A0; <strong>Help Needed</strong>${order.help_request_note ? ': ' + escHtml(order.help_request_note) : ''}
        </div>`;
    }

    async function claimOrder(orderId) {
        const data = await apiPost(`/orders/${orderId}/claim`, {});
        if (data.success) {
            showToast('Order claimed');
            if (typeof loadOrders === 'function') loadOrders();
        } else {
            showToast(data.message || 'Failed to claim', 'error');
        }
    }

    async function releaseOrder(orderId) {
        const data = await apiPost(`/orders/${orderId}/release`, {});
        if (data.success) {
            showToast('Claim released');
            if (typeof loadOrders === 'function') loadOrders();
        } else {
            showToast(data.message || 'Failed to release', 'error');
        }
    }

    async function requestHelp(orderId) {
        const note = prompt('Describe what help you need (optional):');
        const data = await apiPost(`/orders/${orderId}/request-help`, { note: note || '' });
        if (data.success) {
            showToast('Help requested — managers and colleagues notified');
            if (typeof loadOrders === 'function') loadOrders();
        } else {
            showToast(data.message || 'Failed', 'error');
        }
    }

    // ====== PROCUREMENT BOARD (RFQ) ======

    async function loadProcurementBoard() {
        const container = document.getElementById('procBoardBody');
        if (!container) return;

        container.innerHTML = '<div style="padding:2rem;text-align:center;">Loading procurement board...</div>';

        const [unassigned, grouped, suppliers] = await Promise.all([
            apiGet('/procurement/unassigned'),
            apiGet('/procurement/grouped'),
            apiGet('/procurement/supplier-names')
        ]);

        let html = '<div class="phase2-proc-board">';

        // Panel 1: To Assign
        html += `<div class="phase2-panel">
            <div class="phase2-panel-header">
                <h3>&#x1F4E5; To Assign <span class="phase2-count-badge">${(unassigned.orders || []).length}</span></h3>
            </div>
            <div class="phase2-panel-body">`;

        if (!unassigned.orders || unassigned.orders.length === 0) {
            html += '<div style="padding:1rem;text-align:center;color:#94a3b8;">No unassigned orders</div>';
        } else {
            for (const order of unassigned.orders) {
                const priorityClass = (order.priority || 'Normal').toLowerCase();
                html += `
                <div class="phase2-order-card" data-order-id="${order.id}">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                        <div>
                            <strong>#${order.id}</strong> — ${escHtml(order.item_description ? order.item_description.substring(0, 80) : '')}
                            <div style="font-size:0.8rem;color:#94a3b8;margin-top:2px;">
                                Qty: ${order.quantity} | ${escHtml(order.requester_name)} | ${fmtDate(order.submission_date)}
                            </div>
                        </div>
                        <span class="priority-badge priority-${priorityClass}">${escHtml(order.priority || 'Normal')}</span>
                    </div>
                    ${order.current_supplier_name ? `<div style="font-size:0.75rem;color:#94a3b8;margin-top:4px;">Suggested: ${escHtml(order.current_supplier_name)}</div>` : ''}
                    <div style="margin-top:0.5rem;display:flex;gap:4px;align-items:center;">
                        <select class="form-control form-control-sm phase2-supplier-select" data-order-id="${order.id}" style="flex:1;font-size:0.8rem;">
                            <option value="">Select supplier...</option>
                            ${(suppliers.suppliers || []).map(s => `<option value="${escHtml(s.name)}" data-sid="${s.id}">${escHtml(s.name)}</option>`).join('')}
                        </select>
                        <button class="btn btn-primary btn-sm" onclick="Phase2.assignSupplierFromBoard(${order.id})" style="font-size:0.75rem;">Assign</button>
                    </div>
                </div>`;
            }
        }
        html += '</div></div>';

        // Panel 2: Ready for RFQ
        html += `<div class="phase2-panel">
            <div class="phase2-panel-header">
                <h3>&#x1F4CB; Ready for RFQ</h3>
            </div>
            <div class="phase2-panel-body">`;

        if (!grouped.groups || grouped.groups.length === 0) {
            html += '<div style="padding:1rem;text-align:center;color:#94a3b8;">No orders grouped for RFQ yet</div>';
        } else {
            for (const group of grouped.groups) {
                html += `
                <div class="phase2-supplier-group">
                    <div class="phase2-supplier-group-header" onclick="this.nextElementSibling.classList.toggle('hidden')">
                        <div>
                            <strong>${escHtml(group.supplier_name)}</strong>
                            <span class="phase2-count-badge">${group.order_count} orders</span>
                            ${group.total_est_value > 0 ? `<span style="font-size:0.8rem;color:#94a3b8;margin-left:8px;">Est: ${group.total_est_value.toFixed(2)}</span>` : ''}
                        </div>
                        <button class="btn btn-primary btn-sm" onclick="event.stopPropagation();Phase2.generateRFQ('${escHtml(group.supplier_name)}', ${group.supplier_id || 'null'})">Generate RFQ</button>
                    </div>
                    <div class="phase2-supplier-group-orders">`;

                for (const order of group.orders) {
                    const priorityClass = (order.priority || 'Normal').toLowerCase();
                    html += `
                    <div class="phase2-order-card-mini">
                        <span><strong>#${order.id}</strong> ${escHtml((order.item_description || '').substring(0, 60))}</span>
                        <span>Qty: ${order.quantity}</span>
                        <span class="priority-badge priority-${priorityClass}">${escHtml(order.priority || 'Normal')}</span>
                    </div>`;
                }

                html += '</div></div>';
            }
        }
        html += '</div></div></div>';

        container.innerHTML = html;
    }

    async function assignSupplierFromBoard(orderId) {
        const select = document.querySelector(`.phase2-supplier-select[data-order-id="${orderId}"]`);
        if (!select || !select.value) {
            showToast('Please select a supplier', 'error');
            return;
        }
        const supplierName = select.value;
        const supplierId = select.options[select.selectedIndex].dataset.sid || null;

        const data = await apiPost(`/procurement/orders/${orderId}/assign-supplier`, {
            supplier_name: supplierName,
            supplier_id: supplierId
        });

        if (data.success) {
            showToast(`Supplier "${supplierName}" assigned to Order #${orderId}`);
            loadProcurementBoard();
        } else {
            showToast(data.message || 'Failed', 'error');
        }
    }

    async function generateRFQ(supplierName, supplierId) {
        // Get all orders for this supplier
        const grouped = await apiGet('/procurement/grouped');
        if (!grouped.success) return;

        const group = grouped.groups.find(g => g.supplier_name === supplierName);
        if (!group || !group.orders.length) {
            showToast('No orders found for this supplier', 'error');
            return;
        }

        const orderIds = group.orders.map(o => o.id);

        // Ask for optional details
        const dueDate = prompt('Response due date (YYYY-MM-DD, optional):');
        const notes = prompt('Notes for supplier (optional):');

        const data = await apiPost('/procurement/create', {
            order_ids: orderIds,
            supplier_name: supplierName,
            supplier_id: supplierId,
            response_due_date: dueDate || null,
            notes: notes || null
        });

        if (data.success) {
            showToast(`RFQ ${data.rfq_number} created!`);
            loadProcurementBoard();
            // Open printable RFQ
            openRfqPrint(data.rfq_id);
        } else {
            showToast(data.message || 'Failed to create RFQ', 'error');
        }
    }

    // ====== RFQ PRINT VIEW ======

    async function openRfqPrint(rfqId) {
        const data = await apiGet(`/procurement/${rfqId}`);
        if (!data.success) { showToast('Failed to load RFQ', 'error'); return; }

        const rfq = data.rfq;
        const items = rfq.items || [];

        let mailBody = `RFQ: ${rfq.rfq_number}%0D%0ADate: ${fmtDate(rfq.created_at)}%0D%0A%0D%0APlease provide quotation for the following items:%0D%0A%0D%0A`;
        items.forEach((item, i) => {
            mailBody += `${i + 1}. ${item.item_description} - Qty: ${item.quantity}${item.part_number ? ' (PN: ' + item.part_number + ')' : ''}%0D%0A`;
        });
        if (rfq.response_due_date) mailBody += `%0D%0AResponse requested by: ${fmtDate(rfq.response_due_date)}`;
        const mailtoLink = `mailto:?subject=${encodeURIComponent(rfq.rfq_number + ' - Request for Quote')}&body=${mailBody}`;

        let html = `
        <div class="modal-overlay" id="rfqPrintModal" style="display:flex;position:fixed;inset:0;z-index:9999;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);">
            <div class="modal-card" style="max-width:800px;width:95%;max-height:90vh;overflow-y:auto;background:var(--card-bg, #1e293b);border-radius:12px;padding:2rem;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
                    <h2 style="margin:0;">RFQ Preview</h2>
                    <div style="display:flex;gap:0.5rem;">
                        <a href="${mailtoLink}" class="btn btn-secondary btn-sm" target="_blank">&#x1F4E7; Copy mailto</a>
                        <button class="btn btn-primary btn-sm" onclick="Phase2.printRfq()">&#x1F5A8; Print</button>
                        <button class="btn btn-secondary btn-sm" onclick="document.getElementById('rfqPrintModal').remove()">Close</button>
                    </div>
                </div>
                <div id="rfqPrintContent" style="background:#fff;color:#000;padding:2rem;border-radius:8px;">
                    <div style="text-align:center;border-bottom:2px solid #000;padding-bottom:1rem;margin-bottom:1rem;">
                        <h1 style="margin:0;font-size:1.5rem;">PartPulse / Septona</h1>
                        <h2 style="margin:0.5rem 0 0;font-size:1.2rem;">REQUEST FOR QUOTATION</h2>
                    </div>
                    <div style="display:flex;justify-content:space-between;margin-bottom:1.5rem;">
                        <div>
                            <strong>RFQ Number:</strong> ${escHtml(rfq.rfq_number)}<br>
                            <strong>Date:</strong> ${fmtDate(rfq.created_at)}<br>
                            <strong>Created by:</strong> ${escHtml(rfq.created_by_name || '')}
                        </div>
                        <div style="text-align:right;">
                            <strong>Supplier:</strong> ${escHtml(rfq.supplier_name)}<br>
                            ${rfq.response_due_date ? `<strong>Response Due:</strong> ${fmtDate(rfq.response_due_date)}<br>` : ''}
                        </div>
                    </div>
                    <table style="width:100%;border-collapse:collapse;margin-bottom:1.5rem;" border="1" cellpadding="8">
                        <thead style="background:#f1f5f9;">
                            <tr>
                                <th style="text-align:left;">#</th>
                                <th style="text-align:left;">Part Name</th>
                                <th style="text-align:left;">Part Number</th>
                                <th style="text-align:center;">Qty</th>
                                <th style="text-align:left;">Urgency</th>
                                <th style="text-align:left;">Required By</th>
                                <th style="text-align:left;">Notes</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${items.map((item, i) => `
                                <tr>
                                    <td>${i + 1}</td>
                                    <td>${escHtml(item.item_description || '')}</td>
                                    <td>${escHtml(item.part_number || '-')}</td>
                                    <td style="text-align:center;">${item.quantity}</td>
                                    <td>${escHtml(item.priority || 'Normal')}</td>
                                    <td>${fmtDate(item.date_needed)}</td>
                                    <td>${escHtml((item.notes || '').substring(0, 100))}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    ${rfq.notes ? `<div style="margin-bottom:1rem;"><strong>Notes:</strong> ${escHtml(rfq.notes)}</div>` : ''}
                    <div style="border-top:1px solid #ccc;padding-top:1rem;font-size:0.85rem;color:#666;">
                        <p>Please respond with pricing, availability, and estimated delivery for the items listed above.</p>
                        <p>Contact: procurement@septona.bg</p>
                    </div>
                </div>
            </div>
        </div>`;

        document.body.insertAdjacentHTML('beforeend', html);
    }

    function printRfq() {
        const content = document.getElementById('rfqPrintContent');
        if (!content) return;
        const w = window.open('', '_blank');
        w.document.write(`
            <html><head><title>RFQ Print</title><style>
                body { font-family: Arial, sans-serif; margin: 2rem; }
                table { width: 100%; border-collapse: collapse; }
                th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
                th { background: #f1f5f9; }
            </style></head><body>${content.innerHTML}</body></html>
        `);
        w.document.close();
        w.print();
    }

    // ====== RFQ HISTORY ======

    async function loadRfqHistory() {
        const container = document.getElementById('rfqHistoryBody');
        if (!container) return;

        container.innerHTML = '<div style="padding:2rem;text-align:center;">Loading RFQ history...</div>';

        const data = await apiGet('/procurement/list');
        if (!data.success) {
            container.innerHTML = '<div style="padding:2rem;color:#ef4444;">Failed to load RFQs</div>';
            return;
        }

        const rfqs = data.rfqs || [];

        let html = `<h3>RFQ History</h3>
        <table class="phase2-table">
            <thead>
                <tr>
                    <th>RFQ #</th>
                    <th>Supplier</th>
                    <th>Items</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Sent</th>
                    <th>Response Due</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>`;

        const statusColors = {
            draft: '#6b7280', sent: '#3b82f6', response_received: '#8b5cf6',
            accepted: '#22c55e', rejected: '#ef4444'
        };

        for (const rfq of rfqs) {
            const sc = statusColors[rfq.status] || '#6b7280';
            html += `<tr>
                <td><strong>${escHtml(rfq.rfq_number)}</strong></td>
                <td>${escHtml(rfq.supplier_name)}</td>
                <td>${rfq.item_count}</td>
                <td><span style="background:${sc};color:#fff;padding:2px 8px;border-radius:12px;font-size:0.75rem;">${escHtml(rfq.status)}</span></td>
                <td>${fmtDate(rfq.created_at)}</td>
                <td>${fmtDate(rfq.sent_at)}</td>
                <td>${fmtDate(rfq.response_due_date)}</td>
                <td>
                    <button class="btn btn-sm btn-secondary" onclick="Phase2.openRfqPrint(${rfq.id})">View</button>
                    <button class="btn btn-sm btn-secondary" onclick="Phase2.updateRfqStatus(${rfq.id})" style="margin-left:4px;">Update Status</button>
                </td>
            </tr>`;
        }

        html += '</tbody></table>';
        container.innerHTML = html;
    }

    async function updateRfqStatus(rfqId) {
        const status = prompt('New status (draft, sent, response_received, accepted, rejected):');
        if (!status) return;
        const notes = prompt('Response notes (optional):');
        const data = await apiPost(`/procurement/${rfqId}/status`, { status, response_notes: notes || null });
        if (data.success) {
            showToast('RFQ status updated');
            loadRfqHistory();
        } else {
            showToast(data.message || 'Failed', 'error');
        }
    }

    // ====== CAD WORKFLOW ======

    async function loadCadTasks() {
        const container = document.getElementById('cadTasksBody');
        if (!container) return;

        container.innerHTML = '<div style="padding:2rem;text-align:center;">Loading CAD tasks...</div>';

        const data = await apiGet('/cad/tasks');
        if (!data.success) {
            container.innerHTML = '<div style="padding:2rem;color:#ef4444;">Failed to load CAD tasks</div>';
            return;
        }

        const tasks = data.tasks || [];

        const statusColors = {
            not_started: '#6b7280', in_progress: '#3b82f6', review_needed: '#f59e0b',
            approved: '#22c55e', delivered: '#8b5cf6'
        };

        let html = `<h3>&#x1F4D0; My CAD Tasks</h3>`;

        if (tasks.length === 0) {
            html += '<div style="padding:2rem;text-align:center;color:#94a3b8;">No CAD tasks assigned to you</div>';
        } else {
            html += `<table class="phase2-table">
                <thead>
                    <tr>
                        <th>Order #</th>
                        <th>Part Name</th>
                        <th>Assigned</th>
                        <th>Status</th>
                        <th>Unanswered Q</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>`;

            for (const task of tasks) {
                const sc = statusColors[task.cad_status] || '#6b7280';
                const uqBadge = task.unanswered_questions > 0
                    ? `<span style="background:#ef4444;color:#fff;padding:2px 8px;border-radius:12px;font-size:0.7rem;">${task.unanswered_questions}</span>`
                    : '<span style="color:#94a3b8;">0</span>';
                html += `<tr>
                    <td><strong>#${task.id}</strong></td>
                    <td>${escHtml((task.item_description || '').substring(0, 60))}</td>
                    <td>${fmtDate(task.submission_date)}</td>
                    <td><span style="background:${sc};color:#fff;padding:2px 8px;border-radius:12px;font-size:0.75rem;">${escHtml(task.cad_status || 'not_started')}</span></td>
                    <td>${uqBadge}</td>
                    <td><button class="btn btn-primary btn-sm" onclick="Phase2.openCadTask(${task.id})">Open</button></td>
                </tr>`;
            }
            html += '</tbody></table>';
        }

        container.innerHTML = html;
    }

    async function openCadTask(orderId) {
        const [taskData, logData, designersData] = await Promise.all([
            apiGet(`/cad/tasks/${orderId}`),
            apiGet(`/cad/orders/${orderId}/log`),
            apiGet('/cad/designers')
        ]);

        if (!taskData.success) { showToast('Failed to load task', 'error'); return; }

        const task = taskData.task;
        const entries = logData.entries || [];
        const designers = designersData.users || [];

        const statusColors = {
            not_started: '#6b7280', in_progress: '#3b82f6', review_needed: '#f59e0b',
            approved: '#22c55e', delivered: '#8b5cf6'
        };

        // Unanswered questions at top
        const unanswered = entries.filter(e => e.entry_type === 'question' && !e.is_answered);

        let html = `
        <div class="modal-overlay" id="cadTaskModal" style="display:flex;position:fixed;inset:0;z-index:9999;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);">
            <div class="modal-card" style="max-width:800px;width:95%;max-height:90vh;overflow-y:auto;background:var(--card-bg, #1e293b);border-radius:12px;padding:2rem;">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <h2 style="margin:0;">CAD Task — Order #${orderId}</h2>
                    <button class="btn-icon" onclick="document.getElementById('cadTaskModal').remove()">&#x2715;</button>
                </div>

                <div style="margin:1rem 0;padding:1rem;background:rgba(148,163,184,0.1);border-radius:8px;">
                    <strong>${escHtml(task.item_description || '')}</strong><br>
                    <span style="font-size:0.85rem;color:#94a3b8;">
                        Part #: ${escHtml(task.part_number || '-')} | Qty: ${task.quantity} | ${escHtml(task.priority || 'Normal')} | Requester: ${escHtml(task.requester_name || '')}
                    </span>
                </div>

                <div style="display:flex;gap:0.5rem;align-items:center;margin-bottom:1rem;">
                    <label style="font-weight:600;">Status:</label>
                    <select id="cadStatusSelect" class="form-control" style="width:auto;">
                        ${['not_started','in_progress','review_needed','approved','delivered'].map(s =>
                            `<option value="${s}" ${task.cad_status === s ? 'selected' : ''}>${s.replace(/_/g,' ')}</option>`
                        ).join('')}
                    </select>
                    <button class="btn btn-primary btn-sm" onclick="Phase2.updateCadStatus(${orderId})">Update Status</button>
                </div>`;

        // Unanswered questions section
        if (unanswered.length > 0) {
            html += `<div style="background:rgba(239,68,68,0.1);border:1px solid #ef4444;border-radius:8px;padding:1rem;margin-bottom:1rem;">
                <h4 style="color:#ef4444;margin-top:0;">&#x2753; Unanswered Questions (${unanswered.length})</h4>`;
            for (const q of unanswered) {
                html += `<div style="margin-bottom:0.75rem;padding:0.5rem;background:rgba(148,163,184,0.1);border-radius:6px;">
                    <div><strong>${escHtml(q.user_name || '')}</strong> <span style="color:#94a3b8;font-size:0.8rem;">${fmtDateTime(q.created_at)}</span></div>
                    <div style="margin:4px 0;">${escHtml(q.content)}</div>
                    <button class="btn btn-sm btn-primary" onclick="Phase2.replyCadEntry(${q.id}, ${orderId})">Reply</button>
                </div>`;
            }
            html += '</div>';
        }

        // Activity log
        html += `<h4>Activity Log</h4>
        <div style="max-height:300px;overflow-y:auto;">`;

        const entryIcons = { progress: '&#x1F4DD;', question: '&#x2753;', reply: '&#x1F4AC;', status_change: '&#x2705;', file_ref: '&#x1F4C1;' };
        const entryColors = { progress: '#3b82f6', question: '#f59e0b', reply: '#22c55e', status_change: '#22c55e', file_ref: '#6b7280' };

        for (const entry of entries) {
            const icon = entryIcons[entry.entry_type] || '&#x1F4DD;';
            const color = entryColors[entry.entry_type] || '#6b7280';
            const answeredBadge = entry.entry_type === 'question'
                ? (entry.is_answered ? '<span style="color:#22c55e;font-size:0.75rem;"> (Answered)</span>' : '<span style="color:#ef4444;font-size:0.75rem;"> (Pending)</span>')
                : '';
            html += `
            <div style="border-left:3px solid ${color};padding:0.5rem 0.75rem;margin-bottom:0.5rem;background:rgba(148,163,184,0.05);border-radius:0 6px 6px 0;">
                <div style="display:flex;justify-content:space-between;">
                    <span>${icon} <strong>${escHtml(entry.user_name || '')}</strong> — ${escHtml(entry.entry_type)}${answeredBadge}</span>
                    <span style="font-size:0.75rem;color:#94a3b8;">${fmtDateTime(entry.created_at)}</span>
                </div>
                <div style="margin-top:4px;">${escHtml(entry.content)}</div>
                ${entry.entry_type === 'question' && !entry.is_answered ? `<button class="btn btn-sm btn-secondary" style="margin-top:4px;" onclick="Phase2.replyCadEntry(${entry.id}, ${orderId})">Reply</button>` : ''}
            </div>`;
        }

        html += '</div>';

        // Add entry form
        html += `
        <div style="margin-top:1rem;border-top:1px solid rgba(148,163,184,0.2);padding-top:1rem;">
            <h4>Add Entry</h4>
            <div style="display:flex;gap:0.5rem;align-items:center;margin-bottom:0.5rem;">
                <select id="cadEntryType" class="form-control" style="width:auto;">
                    <option value="progress">Progress Note</option>
                    <option value="question">Question</option>
                    <option value="file_ref">File Reference</option>
                </select>
                <select id="cadEntryAddressedTo" class="form-control" style="width:auto;display:none;">
                    <option value="">Address to...</option>
                    ${designers.map(u => `<option value="${u.id}">${escHtml(u.name)}</option>`).join('')}
                </select>
            </div>
            <textarea id="cadEntryContent" class="form-control" rows="3" placeholder="Type your entry..."></textarea>
            <button class="btn btn-primary btn-sm" style="margin-top:0.5rem;" onclick="Phase2.addCadEntry(${orderId})">Submit Entry</button>
        </div>`;

        html += '</div></div>';
        document.body.insertAdjacentHTML('beforeend', html);

        // Show/hide addressed_to based on entry type
        document.getElementById('cadEntryType').addEventListener('change', function() {
            document.getElementById('cadEntryAddressedTo').style.display = this.value === 'question' ? 'inline-block' : 'none';
        });
    }

    async function updateCadStatus(orderId) {
        const select = document.getElementById('cadStatusSelect');
        if (!select) return;
        const data = await apiPost(`/cad/orders/${orderId}/status`, { status: select.value });
        if (data.success) {
            showToast('CAD status updated');
            document.getElementById('cadTaskModal')?.remove();
            loadCadTasks();
        } else {
            showToast(data.message || 'Failed', 'error');
        }
    }

    async function addCadEntry(orderId) {
        const entryType = document.getElementById('cadEntryType').value;
        const content = document.getElementById('cadEntryContent').value.trim();
        const addressedTo = document.getElementById('cadEntryAddressedTo').value;

        if (!content) { showToast('Content is required', 'error'); return; }

        const data = await apiPost(`/cad/orders/${orderId}/log`, {
            entry_type: entryType,
            content,
            addressed_to_user_id: addressedTo || null
        });

        if (data.success) {
            showToast('Entry added');
            document.getElementById('cadTaskModal')?.remove();
            openCadTask(orderId);
        } else {
            showToast(data.message || 'Failed', 'error');
        }
    }

    async function replyCadEntry(entryId, orderId) {
        const content = prompt('Your reply:');
        if (!content) return;

        const data = await apiPost(`/cad/log/${entryId}/reply`, { content });
        if (data.success) {
            showToast('Reply added');
            document.getElementById('cadTaskModal')?.remove();
            openCadTask(orderId);
        } else {
            showToast(data.message || 'Failed', 'error');
        }
    }

    // ====== CAD SECTION IN ORDER DETAIL ======

    function renderCadSection(order) {
        if (!isProcurement() && !isCadDesigner() && !userHasRole('manager')) return '';

        const hasCad = order.requires_cad;
        const cadStatus = order.cad_status;
        const cadName = order.cad_assigned_to_name;

        const statusColors = {
            not_started: '#6b7280', in_progress: '#3b82f6', review_needed: '#f59e0b',
            approved: '#22c55e', delivered: '#8b5cf6'
        };

        let html = `<div class="phase2-cad-section" style="margin-top:1rem;padding:1rem;border:1px solid rgba(148,163,184,0.2);border-radius:8px;">
            <h4 style="margin-top:0;">&#x1F4D0; CAD Documentation</h4>`;

        if (!hasCad) {
            if (isProcurement()) {
                html += `<p style="color:#94a3b8;">No CAD required for this order.</p>
                <button class="btn btn-sm btn-secondary" onclick="Phase2.enableCad(${order.id})">Enable CAD Requirement</button>`;
            } else {
                html += `<p style="color:#94a3b8;">No CAD required.</p>`;
            }
        } else {
            const sc = statusColors[cadStatus] || '#6b7280';
            html += `
            <div style="display:flex;gap:1rem;flex-wrap:wrap;margin-bottom:0.5rem;">
                <div><strong>Status:</strong> <span style="background:${sc};color:#fff;padding:2px 8px;border-radius:12px;font-size:0.75rem;">${escHtml(cadStatus || 'not_started')}</span></div>
                <div><strong>Assigned to:</strong> ${cadName ? escHtml(cadName) : '<span style="color:#ef4444;">Not assigned</span>'}</div>
            </div>`;

            // Blocking message
            if (cadStatus && cadStatus !== 'delivered') {
                html += `<div style="background:rgba(245,158,11,0.1);border:1px solid #f59e0b;color:#f59e0b;padding:0.5rem 1rem;border-radius:8px;margin:0.5rem 0;font-size:0.85rem;">
                    &#x23F3; Awaiting CAD documentation${cadName ? ' — assigned to ' + escHtml(cadName) : ''}. Supplier selection blocked until CAD is delivered.
                </div>`;
            }

            if (isProcurement() && !order.cad_assigned_to_user_id) {
                html += `<button class="btn btn-primary btn-sm" onclick="Phase2.assignCadFromDetail(${order.id})" style="margin-top:0.5rem;">Assign CAD Designer</button>`;
            }

            // View log button
            html += `<button class="btn btn-sm btn-secondary" onclick="Phase2.openCadTask(${order.id})" style="margin-top:0.5rem;margin-left:4px;">View CAD Log</button>`;
        }

        html += '</div>';
        return html;
    }

    async function enableCad(orderId) {
        const data = await apiFetch(`/orders/${orderId}`, {
            method: 'PUT',
            body: JSON.stringify({ requires_cad: true })
        });
        if (data.success) {
            showToast('CAD requirement enabled');
            if (typeof loadOrders === 'function') loadOrders();
        } else {
            showToast('Failed', 'error');
        }
    }

    async function assignCadFromDetail(orderId) {
        const designers = await apiGet('/cad/designers');
        if (!designers.success || !designers.users.length) {
            showToast('No CAD designers available', 'error');
            return;
        }

        const options = designers.users.map(u => `${u.id}: ${u.name}`).join('\n');
        const choice = prompt(`Select CAD designer (enter ID):\n${options}`);
        if (!choice) return;

        const userId = parseInt(choice, 10);
        if (isNaN(userId)) { showToast('Invalid selection', 'error'); return; }

        const data = await apiPost(`/cad/orders/${orderId}/assign`, { user_id: userId });
        if (data.success) {
            showToast('CAD designer assigned');
            if (typeof loadOrders === 'function') loadOrders();
        } else {
            showToast(data.message || 'Failed', 'error');
        }
    }

    // ====== SYSTEM SETTINGS (Super Admin placeholder) ======

    function loadSystemSettings() {
        const container = document.getElementById('systemSettingsBody');
        if (!container) return;
        container.innerHTML = `
            <h3>&#x2699;&#xFE0F; System Settings</h3>
            <div style="padding:2rem;text-align:center;color:#94a3b8;">
                <p>System settings panel for Super Admin.</p>
                <p>Configure auto-release hours, notification preferences, and other system-wide settings.</p>
                <p style="font-size:0.85rem;">This section is available only to the Super Admin (&#x1F451;).</p>
            </div>
        `;
    }

    // ====== INIT ======

    function init() {
        const u = getUser();
        if (!u) return;

        decorateUserName();
        setupPhase2Sidebar();

        // Load user management if admin tab is visible
        if (isSuperAdmin()) {
            loadUserManagement();
        }
    }

    // Expose globally
    window.Phase2 = {
        init,
        // User management
        loadUserManagement,
        openRoleEditor,
        saveRoles,
        deactivateUser,
        activateUser,
        openInviteModal,
        sendInvite,
        // Claiming
        renderClaimBadge,
        renderHelpBadge,
        renderClaimButtons,
        renderClaimBanner,
        renderHelpBanner,
        claimOrder,
        releaseOrder,
        requestHelp,
        // RFQ / Procurement Board
        loadProcurementBoard,
        assignSupplierFromBoard,
        generateRFQ,
        openRfqPrint,
        printRfq,
        loadRfqHistory,
        updateRfqStatus,
        // CAD
        loadCadTasks,
        openCadTask,
        updateCadStatus,
        addCadEntry,
        replyCadEntry,
        renderCadSection,
        enableCad,
        assignCadFromDetail,
        // System
        loadSystemSettings,
        // Utilities
        userHasRole,
        isSuperAdmin,
        isProcurement,
        isCadDesigner,
        crownIcon,
        roleChip,
        decorateUserName
    };
})();
