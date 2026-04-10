// frontend/export-manager.js - Export to CSV/PDF
// PartPulse Orders v3.0

(function() {
    'use strict';

    function exportCSV() {
        const orders = window.filteredOrders || window.ordersState || [];
        if (!orders.length) {
            if (window.Toast) window.Toast.show('No orders to export', 'warning');
            return;
        }

        const isAdmin = window.currentUser && window.currentUser.role !== 'requester';

        const headers = ['ID', 'Item Description', 'Part Number', 'Category', 'Quantity', 'Status', 'Priority', 'Building', 'Cost Center', 'Date Needed', 'Expected Delivery', 'Requester'];
        if (isAdmin) {
            headers.push('Supplier', 'Unit Price', 'Total Price');
        }

        const rows = orders.map(o => {
            const row = [
                o.id,
                csvEscape(o.item_description || ''),
                csvEscape(o.part_number || ''),
                csvEscape(o.category || ''),
                o.quantity,
                o.status,
                o.priority || 'Normal',
                o.building || '',
                o.cost_center_code || '',
                formatDateForExport(o.date_needed),
                formatDateForExport(o.expected_delivery_date),
                csvEscape(o.requester_name || '')
            ];
            if (isAdmin) {
                row.push(
                    csvEscape(o.supplier_name || ''),
                    o.unit_price || '',
                    o.total_price || ''
                );
            }
            return row;
        });

        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        downloadFile(csvContent, `partpulse_orders_${getTimestamp()}.csv`, 'text/csv');

        if (window.Toast) window.Toast.show(`Exported ${orders.length} orders to CSV`, 'success');
    }

    function exportDetailPDF(orderId) {
        // Create a printable view of order detail
        const order = (window.ordersState || []).find(o => o.id === orderId);
        if (!order) return;

        const isAdmin = window.currentUser && window.currentUser.role !== 'requester';

        let html = `<!DOCTYPE html><html><head>
            <title>Order #${order.id}</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 2rem; color: #1a1a1a; }
                h1 { font-size: 1.5rem; border-bottom: 2px solid #38bdf8; padding-bottom: 0.5rem; }
                .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem 2rem; margin: 1rem 0; }
                .label { font-weight: bold; color: #555; font-size: 0.85rem; }
                .value { font-size: 0.9rem; }
                .section { margin-top: 1.5rem; }
                .section h2 { font-size: 1.1rem; border-bottom: 1px solid #ddd; padding-bottom: 0.3rem; }
                .badge { display: inline-block; padding: 0.15rem 0.5rem; border-radius: 4px; font-size: 0.8rem; }
                .status { background: #dbeafe; color: #1d4ed8; }
                .priority { background: #fef3c7; color: #92400e; }
                @media print { body { padding: 0; } }
            </style>
        </head><body>`;

        html += `<h1>PartPulse Order #${order.id}</h1>`;
        html += `<div class="grid">
            <div><div class="label">Status</div><div class="value"><span class="badge status">${order.status}</span></div></div>
            <div><div class="label">Priority</div><div class="value"><span class="badge priority">${order.priority || 'Normal'}</span></div></div>
            <div><div class="label">Building</div><div class="value">${escapeHtml(order.building || '')}</div></div>
            <div><div class="label">Cost Center</div><div class="value">${escapeHtml(order.cost_center_code || '-')}</div></div>
            <div><div class="label">Quantity</div><div class="value">${order.quantity}</div></div>
            <div><div class="label">Date Needed</div><div class="value">${formatDateForExport(order.date_needed)}</div></div>
            <div><div class="label">Requester</div><div class="value">${escapeHtml(order.requester_name || '')}</div></div>
            <div><div class="label">Expected Delivery</div><div class="value">${formatDateForExport(order.expected_delivery_date)}</div></div>`;

        if (isAdmin) {
            html += `<div><div class="label">Supplier</div><div class="value">${escapeHtml(order.supplier_name || '-')}</div></div>
                <div><div class="label">Unit Price</div><div class="value">${order.unit_price || '-'}</div></div>
                <div><div class="label">Total Price</div><div class="value">${order.total_price || '-'}</div></div>`;
        }
        html += `</div>`;

        html += `<div class="section"><h2>Item Description</h2><p>${escapeHtml(order.item_description || '')}</p></div>`;

        if (order.part_number) {
            html += `<div class="section"><h2>Part Number</h2><p>${escapeHtml(order.part_number)}</p></div>`;
        }
        if (order.notes) {
            html += `<div class="section"><h2>Notes</h2><p>${escapeHtml(order.notes)}</p></div>`;
        }

        html += `<div style="margin-top:2rem;font-size:0.75rem;color:#999;">
            Generated by PartPulse Orders on ${new Date().toLocaleString()}
        </div></body></html>`;

        const printWin = window.open('', '_blank');
        printWin.document.write(html);
        printWin.document.close();
        printWin.focus();
        setTimeout(() => printWin.print(), 300);
    }

    function exportListPDF() {
        const orders = window.filteredOrders || window.ordersState || [];
        if (!orders.length) {
            if (window.Toast) window.Toast.show('No orders to export', 'warning');
            return;
        }

        const isAdmin = window.currentUser && window.currentUser.role !== 'requester';

        let html = `<!DOCTYPE html><html><head>
            <title>PartPulse Orders Report</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 1rem; color: #1a1a1a; }
                h1 { font-size: 1.3rem; }
                table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
                th, td { border: 1px solid #ddd; padding: 0.3rem 0.5rem; text-align: left; }
                th { background: #f5f5f5; font-weight: 600; }
                .badge { display: inline-block; padding: 0.1rem 0.4rem; border-radius: 3px; font-size: 0.7rem; }
                @media print { body { padding: 0; } }
            </style>
        </head><body>`;

        html += `<h1>PartPulse Orders Report</h1>`;
        html += `<p style="color:#666;font-size:0.85rem;">Generated: ${new Date().toLocaleString()} | ${orders.length} orders</p>`;

        html += `<table><thead><tr>
            <th>ID</th><th>Item</th><th>Status</th><th>Priority</th><th>Qty</th><th>Building</th><th>Requester</th><th>Date Needed</th>`;
        if (isAdmin) html += `<th>Supplier</th><th>Total</th>`;
        html += `</tr></thead><tbody>`;

        orders.forEach(o => {
            html += `<tr>
                <td>#${o.id}</td>
                <td>${escapeHtml((o.item_description || '').substring(0, 50))}</td>
                <td>${o.status}</td>
                <td>${o.priority || 'Normal'}</td>
                <td>${o.quantity}</td>
                <td>${o.building || ''}</td>
                <td>${escapeHtml(o.requester_name || '')}</td>
                <td>${formatDateForExport(o.date_needed)}</td>`;
            if (isAdmin) {
                html += `<td>${escapeHtml(o.supplier_name || '-')}</td>
                    <td>${o.total_price || '-'}</td>`;
            }
            html += `</tr>`;
        });

        html += `</tbody></table></body></html>`;

        const printWin = window.open('', '_blank');
        printWin.document.write(html);
        printWin.document.close();
        printWin.focus();
        setTimeout(() => printWin.print(), 300);
    }

    function csvEscape(val) {
        if (!val) return '';
        const str = String(val);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
    }

    function formatDateForExport(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleDateString('en-GB');
    }

    function getTimestamp() {
        const d = new Date();
        return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
    }

    function downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    window.ExportManager = {
        exportCSV,
        exportDetailPDF,
        exportListPDF
    };
})();
