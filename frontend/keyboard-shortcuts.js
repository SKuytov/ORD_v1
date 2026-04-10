// frontend/keyboard-shortcuts.js - Keyboard Shortcuts System
// PartPulse Orders v3.0

(function() {
    'use strict';

    const shortcuts = [
        { keys: ['Ctrl+K', 'Cmd+K'], desc: 'Global Search', handler: () => window.GlobalSearch && window.GlobalSearch.open() },
        { keys: ['/'], desc: 'Focus Search', handler: () => window.GlobalSearch && window.GlobalSearch.open() },
        { keys: ['?'], desc: 'Show Keyboard Shortcuts', handler: toggleShortcutsPanel },
        { keys: ['N'], desc: 'New Order', handler: () => {
            const btn = document.getElementById('btnProcurementCreateOrder');
            if (btn && !btn.hidden) btn.click();
        }},
        { keys: ['Escape'], desc: 'Close Panel / Modal', handler: closeAll },
        { keys: ['1'], desc: 'Go to Orders', handler: () => typeof switchTab === 'function' && switchTab('ordersTab') },
        { keys: ['2'], desc: 'Go to Quotes', handler: () => typeof switchTab === 'function' && switchTab('quotesTab') },
        { keys: ['3'], desc: 'Go to Suppliers', handler: () => typeof switchTab === 'function' && switchTab('suppliersTab') },
        { keys: ['4'], desc: 'Go to Analytics', handler: () => typeof switchTab === 'function' && switchTab('analyticsTab') },
        { keys: ['E'], desc: 'Export Current View', handler: () => window.ExportManager && window.ExportManager.exportCSV() }
    ];

    function init() {
        createShortcutsPanel();
        document.addEventListener('keydown', handleKeydown);
    }

    function isInputFocused() {
        const a = document.activeElement;
        return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable);
    }

    function handleKeydown(e) {
        // Don't handle if in input (except Escape and Ctrl/Cmd combos)
        if (isInputFocused() && !e.ctrlKey && !e.metaKey && e.key !== 'Escape') return;

        if (e.key === '?' && !e.ctrlKey && !e.metaKey && !isInputFocused()) {
            e.preventDefault();
            toggleShortcutsPanel();
        }
    }

    function closeAll() {
        // Close search overlay
        if (window.GlobalSearch) window.GlobalSearch.close();
        // Close shortcuts panel
        const panel = document.getElementById('shortcutsOverlay');
        if (panel && !panel.classList.contains('hidden')) {
            panel.classList.add('hidden');
            return;
        }
        // Close order detail
        const detailPanel = document.getElementById('orderDetailPanel');
        if (detailPanel && !detailPanel.classList.contains('hidden')) {
            detailPanel.classList.add('hidden');
            return;
        }
        // Close modals
        document.querySelectorAll('.modal-overlay:not(.hidden)').forEach(m => m.classList.add('hidden'));
    }

    function createShortcutsPanel() {
        const overlay = document.createElement('div');
        overlay.className = 'shortcuts-overlay hidden';
        overlay.id = 'shortcutsOverlay';

        let rows = '';
        shortcuts.forEach(s => {
            const keysHtml = s.keys.map(k => `<kbd>${k}</kbd>`).join(' / ');
            rows += `<div class="shortcut-row">
                <span class="shortcut-desc">${s.desc}</span>
                <span>${keysHtml}</span>
            </div>`;
        });

        overlay.innerHTML = `
            <div class="shortcuts-panel">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
                    <h3>Keyboard Shortcuts</h3>
                    <button class="btn-close" id="closeShortcuts">&times;</button>
                </div>
                ${rows}
            </div>
        `;

        document.body.appendChild(overlay);

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.classList.add('hidden');
        });

        document.getElementById('closeShortcuts').addEventListener('click', () => {
            overlay.classList.add('hidden');
        });
    }

    function toggleShortcutsPanel() {
        const panel = document.getElementById('shortcutsOverlay');
        if (panel) panel.classList.toggle('hidden');
    }

    window.KeyboardShortcuts = { toggle: toggleShortcutsPanel };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
