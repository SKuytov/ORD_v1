// frontend/procurement-workspace.js
// PartPulse Orders v3.1 — Full Procurement Dashboard + Lifecycle
// Dashboard: KPI Strip + Orders Pipeline + Lifecycle Panel + Document Hub
// Wizard: Create Quote (3-step) with AI supplier suggestions
// Lifecycle: 5-stage quote → PO → Invoice → Accounting
// Pure Vanilla JS — no frameworks

'use strict';

// ============================================================
// MODULE STATE
// ============================================================
const PW = {
    currentQuoteId: null,
    currentLifecycle: null,
    wizardState: {
        step: 1,
        selectedOrderIds: [],
        orders: [],
        selectedSupplierId: null,
        selectedSupplierName: '',
        currency: 'EUR',
        validUntil: '',
        notes: '',
        aiSuggestions: []
    },
    panelOpen: false,
    // Dashboard state
    dashboard: {
        initialized: false,
        kpis: null,
        orders: [],
        documents: [],
        selectedQuoteId: null,
        docTypeFilter: 'all',
        pipelineFilter: null
    }
};