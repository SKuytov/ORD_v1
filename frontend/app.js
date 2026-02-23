[PARTIAL FILE UPDATE - Adding at end before switchTab function]

function switchTab(tabId) {
    if (currentTab === tabId) return;
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
    document.getElementById(tabId).classList.remove('hidden');
    currentTab = tabId;
    
    // ⭐ NEW: Show brand training UI for admins in Suppliers tab
    if (tabId === 'suppliersTab' && currentUser.role === 'admin') {
        const brandTrainingCard = document.getElementById('brandTrainingCard');
        if (brandTrainingCard) {
            brandTrainingCard.hidden = false;
            // Load brand training UI if function exists
            if (typeof loadBrandTrainingUI === 'function') {
                loadBrandTrainingUI();
            }
        }
    }
}
