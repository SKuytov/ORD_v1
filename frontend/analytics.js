// frontend/analytics.js - Financial & Analytics Module — PartPulse v3.0
(function () {
    'use strict';

    const COLORS = ['#38bdf8', '#22c55e', '#eab308', '#a78bfa', '#fb923c', '#2dd4bf', '#f472b6', '#ef4444', '#84cc16', '#f97316'];

    const STATUS_COLORS = {
        'New': '#3b82f6',
        'Pending': '#eab308',
        'Quote Requested': '#a78bfa',
        'Quote Received': '#8b5cf6',
        'Quote Under Approval': '#fb923c',
        'Approved': '#22c55e',
        'Ordered': '#38bdf8',
        'In Transit': '#2dd4bf',
        'Partially Delivered': '#06b6d4',
        'Delivered': '#16a34a',
        'Cancelled': '#ef4444',
        'On Hold': '#6b7280'
    };

    // Language helper — reads app's current language (BG default per user requirement)
    function getLang() {
        return (window.i18n && typeof window.i18n.getCurrentLanguage === 'function')
            ? window.i18n.getCurrentLanguage()
            : (localStorage.getItem('appLanguage') || 'bg');
    }
    function t(bg, en) { return getLang() === 'en' ? en : bg; }

    let currentPeriod = 'all';
    let chartsRegistry = {};
    let initialized = false;
    let customDateFrom = null;
    let customDateTo = null;
    let drillModalListenersAttached = false;
    let lastData = {};
    let currentDrillData = [];
    let drillFilters = { status: '', supplier: '', building: '' };
    let lastRefreshTime = null;
    let comparisonMode = false;
    var _apiCache = {};
    var _apiCacheTTL = 5 * 60 * 1000; // 5 minutes

    function getMonthsParam() {
        switch (currentPeriod) {
            case 'month': return 1;
            case '3months': return 3;
            case '6months': return 6;
            case 'year': return 12;
            default: return null;
        }
    }

    function buildQuery(params) {
        const q = new URLSearchParams();
        if (currentPeriod === 'custom') {
            if (customDateFrom) q.set('dateFrom', customDateFrom);
            if (customDateTo) q.set('dateTo', customDateTo);
        } else {
            const months = getMonthsParam();
            if (months) q.set('months', months);
        }
        if (params) {
            Object.entries(params).forEach(([k, v]) => { if (v != null) q.set(k, v); });
        }
        const str = q.toString();
        return str ? '?' + str : '';
    }

    async function apiFetch(endpoint, params) {
        var url = (typeof API_BASE !== 'undefined' ? API_BASE : '/api') + '/analytics/' + endpoint + buildQuery(params);
        var token = typeof authToken !== 'undefined' ? authToken : localStorage.getItem('token');
        var cacheKey = url;
        var cached = _apiCache[cacheKey];
        if (cached && (Date.now() - cached.ts < _apiCacheTTL)) {
            return cached.data;
        }
        var resp = await fetch(url, { headers: { 'Authorization': 'Bearer ' + token } });
        if (!resp.ok) {
            // BUG FIX: gracefully handle non-200 instead of silent crash
            let errMsg = 'API error: ' + resp.status;
            try { const body = await resp.json(); errMsg = body.message || errMsg; } catch(e) {}
            throw new Error(errMsg);
        }
        var data = await resp.json();
        _apiCache[cacheKey] = { data: data, ts: Date.now() };
        return data;
    }

    function fmtMoney(val) {
        const n = parseFloat(val);
        if (isNaN(n)) return '0,00 EUR';
        return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' EUR';
    }

    function fmtNum(val) {
        const n = parseFloat(val);
        if (isNaN(n)) return '0';
        return n.toLocaleString('de-DE');
    }

    function fmtPct(val) {
        const n = parseFloat(val);
        if (isNaN(n)) return '0%';
        return n.toFixed(1) + '%';
    }

    function formatPeriodLabel(period) {
        const [year, month] = period.split('-');
        const months = ['Януари','Февруари','Март','Април','Май','Юни',
                        'Юли','Август','Септември','Октомври','Ноември','Декември'];
        return (months[parseInt(month) - 1] || month) + ' ' + year;
    }

    function destroyChart(key) {
        if (chartsRegistry[key]) {
            chartsRegistry[key].destroy();
            delete chartsRegistry[key];
        }
    }

    function destroyAllCharts() {
        Object.keys(chartsRegistry).forEach(destroyChart);
    }

    function getContainer() {
        return document.getElementById('analyticsTabContent');
    }

    function showError(msg) {
        const c = getContainer();
        if (!c) return;
        c.innerHTML = '<div class="analytics-error"><div>' + (msg || 'Грешка при зареждане на аналитичните данни.') +
            '</div><button class="retry-btn" onclick="window.AnalyticsModule.refresh()">Опитай отново</button></div>';
    }

    function esc(str) {
        if (!str) return '';
        return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
    }

    function getPeriodLabel() {
        if (currentPeriod === 'month') return 'Този Месец';
        if (currentPeriod === '3months') return 'Последните 3 Месеца';
        if (currentPeriod === '6months') return 'Последните 6 Месеца';
        if (currentPeriod === 'year') return 'Тази Година';
        if (currentPeriod === 'custom') return (customDateFrom || '') + ' до ' + (customDateTo || '');
        return 'Всички Времена';
    }

    // ── Widget Preferences ────────────────────────────────────────
    function loadWidgetPrefs() {
        try { return JSON.parse(localStorage.getItem('analyticsWidgetPrefs') || '{}'); } catch(e) { return {}; }
    }
    function saveWidgetPrefs(prefs) {
        try { localStorage.setItem('analyticsWidgetPrefs', JSON.stringify(prefs)); } catch(e) {}
    }

    function applyWidgetVisibility() {
        var prefs = loadWidgetPrefs();
        document.querySelectorAll('#analyticsCustomizePanel input[type=checkbox]').forEach(function(cb) {
            var key = cb.dataset.widget;
            var visible = prefs[key] !== false;
            cb.checked = visible;
            var targetEl = findWidgetEl(key);
            if (targetEl) targetEl.style.display = visible ? '' : 'none';
        });
    }

    function findWidgetEl(key) {
        var map = {
            'spendOverTime': document.getElementById('chartSpendOverTime')?.closest('.chart-card'),
            'forecastCard': document.getElementById('forecastCard'),
            'orderStatus': document.getElementById('chartOrderStatus')?.closest('.chart-card'),
            'spendBuilding': document.getElementById('chartSpendBuilding')?.closest('.chart-card'),
            'spendSupplier': document.getElementById('chartSpendSupplier')?.closest('.chart-card'),
            'categorySection': document.querySelector('.chart-card.full-width'),
            'supplierPerfTableWrapper': document.getElementById('supplierPerfTableWrapper'),
            'topPartsTableWrapper': document.getElementById('topPartsTableWrapper'),
            'slaBreachPanel': document.getElementById('slaBreachPanel'),
            'aiStatsPanel': document.getElementById('aiStatsPanel'),
            'recurringItemsPanel': document.getElementById('recurringItemsPanel'),
            'concentrationPanel': document.getElementById('concentrationPanel')
        };
        return map[key] || null;
    }

    // ── Drill-Down Modal ──────────────────────────────────────────

    async function openDrillDown(type, value, displayLabel) {
        const modal = document.getElementById('analyticsDrillModal');
        const titleEl = document.getElementById('analyticsDrillTitle');
        const summaryEl = document.getElementById('analyticsDrillSummary');
        const bodyEl = document.getElementById('analyticsDrillBody');
        if (!modal) return;

        titleEl.textContent = displayLabel || 'Поръчки';
        summaryEl.textContent = '';
        bodyEl.innerHTML = '<div class="analytics-loading"><div class="spinner"></div><div>Зареждане...</div></div>';
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';

        try {
            const q = new URLSearchParams();
            q.set('type', type);
            q.set('value', String(value));
            if (currentPeriod === 'custom') {
                if (customDateFrom) q.set('dateFrom', customDateFrom);
                if (customDateTo) q.set('dateTo', customDateTo);
            } else {
                const months = getMonthsParam();
                if (months) q.set('months', months);
            }
            const token = typeof authToken !== 'undefined' ? authToken : localStorage.getItem('token');
            const base = typeof API_BASE !== 'undefined' ? API_BASE : '/api';
            const resp = await fetch(base + '/analytics/drill-down?' + q.toString(), {
                headers: { 'Authorization': 'Bearer ' + token }
            });
            if (!resp.ok) throw new Error('Грешка ' + resp.status);
            const data = await resp.json();

            titleEl.textContent = data.title || displayLabel;
            currentDrillData = data.orders;
            drillFilters = { status: '', supplier: '', building: '' };
            renderDrillContent();
        } catch (err) {
            bodyEl.innerHTML = '<div class="analytics-error">Неуспешно зареждане: ' + esc(err.message) + '</div>';
        }
    }

    function closeDrillDown() {
        const modal = document.getElementById('analyticsDrillModal');
        if (modal) modal.classList.add('hidden');
        document.body.style.overflow = '';
    }

    function renderDrillTable(orders) {
        if (!orders || orders.length === 0) {
            return '<p style="color:var(--color-text-secondary);padding:2rem;text-align:center;">Няма намерени поръчки.</p>';
        }

        const statusColors = {
            'Delivered': '#16a34a', 'Cancelled': '#ef4444', 'On Hold': '#6b7280',
            'New': '#3b82f6', 'Ordered': '#38bdf8', 'In Transit': '#2dd4bf',
            'Approved': '#22c55e', 'Pending': '#eab308'
        };
        const priorityColors = {
            'Urgent': 'background:#ef4444;color:#fff',
            'High': 'background:#fb923c;color:#fff',
            'Normal': 'background:#1e293b;color:#9ca3af',
            'Low': 'background:#1e293b;color:#6b7280'
        };

        let html = '<table class="drill-table"><thead><tr>' +
            '<th>#</th><th>Артикул</th><th>Сграда</th><th>ЦР</th>' +
            '<th>Доставчик</th><th>Кол.</th><th>Ед. Цена</th>' +
            '<th>Общо</th><th>Статус</th><th>Приоритет</th><th>Дата</th><th>Заявител</th>' +
            '</tr></thead><tbody>';

        orders.forEach(function(o) {
            const sc = statusColors[o.status] || '#6b7280';
            const pc = priorityColors[o.priority] || '';
            const total = parseFloat(o.totalPrice);
            const unit = parseFloat(o.unitPrice);
            html += '<tr>' +
                '<td><button class="drill-order-id-btn" data-order-id="' + o.id + '">#' + o.id + '</button></td>' +
                '<td class="drill-item-col" title="' + esc(o.itemDescription) + '">' + esc(o.itemDescription) + '</td>' +
                '<td>' + esc(o.building) + '</td>' +
                '<td>' + esc(o.costCenterName) + '</td>' +
                '<td>' + esc(o.supplierName) + '</td>' +
                '<td style="text-align:right;">' + o.quantity + '</td>' +
                '<td style="text-align:right;">' + (unit > 0 ? fmtMoney(unit) : '\u2014') + '</td>' +
                '<td style="text-align:right;color:' + (total > 0 ? 'var(--color-accent)' : 'var(--color-text-secondary)') + ';">' + (total > 0 ? fmtMoney(total) : '\u2014') + '</td>' +
                '<td><span class="drill-status-badge" style="background:' + sc + '22;color:' + sc + ';">' + esc(o.status) + '</span></td>' +
                '<td><span class="drill-priority-badge" style="' + pc + '">' + esc(o.priority) + '</span></td>' +
                '<td style="white-space:nowrap;">' + (o.submissionDate || '') + '</td>' +
                '<td>' + esc(o.requesterName) + '</td>' +
                '</tr>';
        });

        html += '</tbody></table>';
        return html;
    }

    function renderDrillContent() {
        const bodyEl = document.getElementById('analyticsDrillBody');
        if (!bodyEl) return;

        var filtered = currentDrillData.filter(function(o) {
            if (drillFilters.status && o.status !== drillFilters.status) return false;
            if (drillFilters.supplier && o.supplierName !== drillFilters.supplier) return false;
            if (drillFilters.building && o.building !== drillFilters.building) return false;
            return true;
        });

        var statusSet = {};
        currentDrillData.forEach(function(o) { if (o.status) statusSet[o.status] = true; });
        var uniqueStatuses = Object.keys(statusSet).sort();

        var buildingSet = {};
        currentDrillData.forEach(function(o) { if (o.building) buildingSet[o.building] = true; });
        var uniqueBuildings = Object.keys(buildingSet).sort();

        var supplierSet = {};
        currentDrillData.forEach(function(o) { if (o.supplierName) supplierSet[o.supplierName] = true; });
        var uniqueSuppliers = Object.keys(supplierSet).sort();

        var summaryEl = document.getElementById('analyticsDrillSummary');
        if (summaryEl) {
            var totalSpend = filtered.reduce(function(s, o) { return s + (parseFloat(o.totalPrice) || 0); }, 0);
            summaryEl.textContent = filtered.length + (filtered.length < currentDrillData.length ? '/' + currentDrillData.length : '') + ' поръчки \u00b7 ' + fmtMoney(totalSpend);
        }

        var html = '';

        if (currentDrillData.length > 0) {
            html += '<div class="drill-filters">';

            if (uniqueStatuses.length > 1) {
                html += '<div class="drill-filter-group"><span class="drill-filter-label">Статус:</span>';
                uniqueStatuses.forEach(function(s) {
                    var active = drillFilters.status === s;
                    html += '<button class="drill-chip' + (active ? ' active' : '') + '" data-filter-type="status" data-filter-val="' + esc(s) + '">' + esc(s) + '</button>';
                });
                if (drillFilters.status) html += '<button class="drill-chip-clear" data-filter-type="status">\u2715</button>';
                html += '</div>';
            }

            if (uniqueBuildings.length > 1) {
                html += '<div class="drill-filter-group"><span class="drill-filter-label">Сграда:</span>';
                uniqueBuildings.forEach(function(b) {
                    var active = drillFilters.building === b;
                    html += '<button class="drill-chip' + (active ? ' active' : '') + '" data-filter-type="building" data-filter-val="' + esc(b) + '">' + esc(b) + '</button>';
                });
                if (drillFilters.building) html += '<button class="drill-chip-clear" data-filter-type="building">\u2715</button>';
                html += '</div>';
            }

            if (uniqueSuppliers.length > 1) {
                html += '<div class="drill-filter-group"><span class="drill-filter-label">Доставчик:</span><div class="drill-chips-scroll">';
                uniqueSuppliers.forEach(function(s) {
                    var active = drillFilters.supplier === s;
                    html += '<button class="drill-chip' + (active ? ' active' : '') + '" data-filter-type="supplier" data-filter-val="' + esc(s) + '">' + esc(s) + '</button>';
                });
                html += '</div>';
                if (drillFilters.supplier) html += '<button class="drill-chip-clear" data-filter-type="supplier">\u2715</button>';
                html += '</div>';
            }

            html += '</div>';
        }

        html += renderDrillTable(filtered);
        bodyEl.innerHTML = html;

        bodyEl.querySelectorAll('.drill-chip').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var type = this.dataset.filterType;
                var val = this.dataset.filterVal;
                drillFilters[type] = drillFilters[type] === val ? '' : val;
                renderDrillContent();
            });
        });
        bodyEl.querySelectorAll('.drill-chip-clear').forEach(function(btn) {
            btn.addEventListener('click', function() {
                drillFilters[this.dataset.filterType] = '';
                renderDrillContent();
            });
        });

        bodyEl.querySelectorAll('.drill-order-id-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var orderId = parseInt(this.dataset.orderId);
                closeDrillDown();
                var ordersTab = document.querySelector('[data-tab="ordersTab"]');
                if (ordersTab) ordersTab.click();
                setTimeout(function() {
                    if (typeof openOrderDetail === 'function') {
                        openOrderDetail(orderId);
                    }
                }, 200);
            });
        });
    }

    // ── Skeleton / Layout ─────────────────────────────────────────

    function renderSkeleton() {
        const c = getContainer();
        if (!c) return;

        c.innerHTML = `
        <div class="analytics-container">
            <div class="analytics-top-bar">
                <div class="period-filter" id="analyticsPeriodFilter">
                    <button class="period-btn${currentPeriod === 'month' ? ' active' : ''}" data-period="month">Месец</button>
                    <button class="period-btn${currentPeriod === '3months' ? ' active' : ''}" data-period="3months">3М</button>
                    <button class="period-btn${currentPeriod === '6months' ? ' active' : ''}" data-period="6months">6М</button>
                    <button class="period-btn${currentPeriod === 'year' ? ' active' : ''}" data-period="year">Годишно</button>
                    <button class="period-btn${currentPeriod === 'all' ? ' active' : ''}" data-period="all">Всички</button>
                    <button class="period-btn${currentPeriod === 'custom' ? ' active' : ''}" data-period="custom">По избор</button>
                </div>
                <div class="analytics-export-btns">
                    <button class="export-btn" id="btnExportXLSX" title="Експорт в Excel">📥 Excel</button>
                    <button class="export-btn" id="btnExportPDF" title="Експорт в PDF">📄 PDF</button>
                    <button class="export-btn" id="btnExportCSV" title="Експорт в CSV">📊 CSV</button>
                    <button class="export-btn" id="btnExportJSON" title="Сурови данни JSON">📦 JSON</button>
                    <button class="export-btn" id="btnPrintReport" title="Принтиране">🖨️ Принт</button>
                    <button class="export-btn" id="btnToggleComparison" title="Сравни периоди">📊 Сравни</button>
                    <button class="export-btn" id="btnCustomize" title="Персонализиране">⚙ Настройки</button>
                </div>
                <div class="analytics-refresh-ctrl" id="analyticsRefreshCtrl">
                    <button class="analytics-refresh-btn" id="analyticsRefreshBtn" title="Обнови данните">
                        <svg class="refresh-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
                            <polyline points="23 4 23 10 17 10"></polyline>
                            <polyline points="1 20 1 14 7 14"></polyline>
                            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                        </svg>
                        Обнови
                    </button>
                    <span class="analytics-last-updated" id="analyticsLastUpdated"></span>
                </div>
            </div>
            <div id="analyticsCustomRange" class="custom-range-picker" style="${currentPeriod === 'custom' ? '' : 'display:none;'}">
                <label>От: <input type="date" id="analyticsDateFrom" value="${customDateFrom || ''}"></label>
                <label>До: <input type="date" id="analyticsDateTo" value="${customDateTo || ''}"></label>
                <button class="btn-apply-range" id="btnApplyRange">Приложи</button>
            </div>
            <div class="analytics-customize-panel hidden" id="analyticsCustomizePanel">
                <div class="customize-panel-inner">
                    <strong>Видими секции</strong>
                    <label><input type="checkbox" data-widget="spendOverTime" checked> Разходи във времето</label>
                    <label><input type="checkbox" data-widget="forecastCard" checked> Прогноза</label>
                    <label><input type="checkbox" data-widget="orderStatus" checked> Поръчки по статус</label>
                    <label><input type="checkbox" data-widget="spendBuilding" checked> Разходи по сграда</label>
                    <label><input type="checkbox" data-widget="spendSupplier" checked> Топ доставчици</label>
                    <label><input type="checkbox" data-widget="categorySection" checked> Разходи по категория</label>
                    <label><input type="checkbox" data-widget="supplierPerfTableWrapper" checked> Ефективност на доставчиците</label>
                    <label><input type="checkbox" data-widget="topPartsTableWrapper" checked> Топ части</label>
                    <label><input type="checkbox" data-widget="slaBreachPanel" checked> SLA нарушения</label>
                    <label><input type="checkbox" data-widget="aiStatsPanel" checked> AI статистики</label>
                    <label><input type="checkbox" data-widget="recurringItemsPanel" checked> Повтарящи се артикули</label>
                    <label><input type="checkbox" data-widget="concentrationPanel" checked> Концентрация доставчици</label>
                </div>
            </div>
            <div class="kpi-grid" id="analyticsKpiGrid"></div>
            <div class="charts-grid">
                <div class="chart-card" title="Кликнете на бар за детайли">
                    <div class="chart-card-header">
                        <h3>Разходи Във Времето</h3>
                        <button class="chart-download-btn" data-chart-id="chartSpendOverTime" title="Изтегли като PNG">⬇</button>
                    </div>
                    <canvas id="chartSpendOverTime"></canvas>
                </div>
                <div class="chart-card" title="Кликнете на сегмент за детайли">
                    <div class="chart-card-header">
                        <h3>Поръчки по Статус</h3>
                        <button class="chart-download-btn" data-chart-id="chartOrderStatus" title="Изтегли като PNG">⬇</button>
                    </div>
                    <canvas id="chartOrderStatus"></canvas>
                </div>
            </div>
            <div class="charts-grid">
                <div class="chart-card full-width" id="forecastCard">
                    <div class="chart-card-header">
                        <h3>📈 Прогноза на Разходите</h3>
                        <button class="chart-download-btn" data-chart-id="chartSpendForecast" title="Изтегли като PNG">⬇</button>
                    </div>
                    <canvas id="chartSpendForecast"></canvas>
                    <div class="forecast-note" id="forecastNote"></div>
                </div>
            </div>
            <div class="charts-grid">
                <div class="chart-card" title="Кликнете на бар за детайли">
                    <div class="chart-card-header">
                        <h3>Разходи по Сграда</h3>
                        <button class="chart-download-btn" data-chart-id="chartSpendBuilding" title="Изтегли като PNG">⬇</button>
                    </div>
                    <canvas id="chartSpendBuilding"></canvas>
                </div>
                <div class="chart-card" title="Кликнете на бар за детайли">
                    <div class="chart-card-header">
                        <h3>Топ 10 Доставчика</h3>
                        <button class="chart-download-btn" data-chart-id="chartSpendSupplier" title="Изтегли като PNG">⬇</button>
                    </div>
                    <canvas id="chartSpendSupplier"></canvas>
                </div>
            </div>
            <div class="charts-grid">
                <div class="chart-card full-width" title="Кликнете за детайли"><h3>Разходи по Категория</h3></div>
            </div>
            <div class="analytics-table-wrapper" id="supplierPerfTableWrapper">
                <h3>Ефективност на Доставчиците</h3>
                <div id="supplierPerfTableBody"></div>
            </div>
            <div class="analytics-table-wrapper" id="topPartsTableWrapper">
                <h3>Топ Поръчвани Части</h3>
                <div id="topPartsTableBody"></div>
            </div>

            <!-- SLA BREACH PANEL -->
            <div class="analytics-table-wrapper" id="slaBreachPanel">
                <div class="analytics-panel-header">
                    <h3>⚠️ SLA Нарушения</h3>
                    <span class="analytics-panel-badge" id="slaBreachBadge" style="display:none;"></span>
                </div>
                <div id="slaBreachBody"><div class="analytics-loading"><div class="spinner"></div><div>Зареждане...</div></div></div>
            </div>

            <!-- AI STATS PANEL -->
            <div class="analytics-table-wrapper" id="aiStatsPanel">
                <h3>🤖 AI Статистики — Предложения за Доставчик</h3>
                <div id="aiStatsBody"><div class="analytics-loading"><div class="spinner"></div><div>Зареждане...</div></div></div>
            </div>

            <!-- RECURRING ITEMS PANEL -->
            <div class="analytics-table-wrapper" id="recurringItemsPanel">
                <h3>🔁 Повтарящи се Артикули</h3>
                <p style="color:var(--color-text-secondary);font-size:0.82rem;margin:0 0 0.75rem;">Артикули, поръчвани 3+ пъти — кандидати за бланкетни поръчки.</p>
                <div id="recurringItemsBody"><div class="analytics-loading"><div class="spinner"></div><div>Зареждане...</div></div></div>
            </div>

            <!-- SUPPLIER CONCENTRATION PANEL -->
            <div class="analytics-table-wrapper" id="concentrationPanel">
                <h3>📊 Концентрация на Доставчиците</h3>
                <div id="concentrationBody"><div class="analytics-loading"><div class="spinner"></div><div>Зареждане...</div></div></div>
            </div>

            <!-- INSIGHTS PANEL -->
            <div class="insights-section">
                <h3>💡 Препоръки за Спестявания</h3>
                <div id="analyticsInsightsPanel">
                    <div class="analytics-loading"><div class="spinner"></div><div>Анализ...</div></div>
                </div>
            </div>

            <!-- FORECAST PANEL -->
            <div class="chart-card" style="margin-bottom:1.25rem;">
                <h3>📈 3-Месечна Прогноза</h3>
                <div id="analyticsForecastPanel"></div>
                <div style="position:relative;height:240px;margin-top:1rem;">
                    <canvas id="chartForecast"></canvas>
                </div>
            </div>

        </div>`;

        // Bind period filter
        const filterEl = document.getElementById('analyticsPeriodFilter');
        if (filterEl) {
            filterEl.addEventListener('click', function (e) {
                const btn = e.target.closest('.period-btn');
                if (!btn) return;
                currentPeriod = btn.dataset.period;
                filterEl.querySelectorAll('.period-btn').forEach(b => b.classList.toggle('active', b.dataset.period === currentPeriod));
                const customRange = document.getElementById('analyticsCustomRange');
                if (customRange) customRange.style.display = currentPeriod === 'custom' ? '' : 'none';
                if (currentPeriod !== 'custom') loadData();
            });
        }

        // Bind custom date range
        const btnApply = document.getElementById('btnApplyRange');
        if (btnApply) {
            btnApply.addEventListener('click', function () {
                const from = document.getElementById('analyticsDateFrom');
                const to = document.getElementById('analyticsDateTo');
                customDateFrom = from ? from.value || null : null;
                customDateTo = to ? to.value || null : null;
                loadData();
            });
        }

        // Bind export buttons
        document.getElementById('btnExportXLSX')?.addEventListener('click', exportToXLSX);
        document.getElementById('btnExportPDF')?.addEventListener('click', exportToPDF);
        document.getElementById('btnExportCSV')?.addEventListener('click', function() {
            if (window.AnalyticsExport && lastData) window.AnalyticsExport.exportCSV(lastData, getPeriodLabel());
        });
        document.getElementById('btnExportJSON')?.addEventListener('click', function() {
            if (window.AnalyticsExport && lastData) window.AnalyticsExport.exportJSON(lastData, getPeriodLabel());
        });
        document.getElementById('btnPrintReport')?.addEventListener('click', function() {
            if (window.AnalyticsExport) window.AnalyticsExport.printReport(getPeriodLabel());
        });

        // Comparison toggle
        document.getElementById('btnToggleComparison')?.addEventListener('click', function() {
            comparisonMode = !comparisonMode;
            this.classList.toggle('active', comparisonMode);
            this.textContent = comparisonMode ? '📊 Сравнявам' : '📊 Сравни';
            if (lastData.spendTime) renderSpendOverTime(lastData.spendTime);
        });

        // Refresh button
        var refreshBtn = document.getElementById('analyticsRefreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', function() {
                this.classList.add('spinning');
                var me = this;
                loadData().finally(function() {
                    me.classList.remove('spinning');
                    lastRefreshTime = Date.now();
                    var el = document.getElementById('analyticsLastUpdated');
                    if (el) el.textContent = 'Обновено сега';
                });
            });
        }

        // Customize panel
        var btnCustomize = document.getElementById('btnCustomize');
        if (btnCustomize) {
            btnCustomize.addEventListener('click', function() {
                var panel = document.getElementById('analyticsCustomizePanel');
                if (panel) panel.classList.toggle('hidden');
            });
        }
        document.getElementById('analyticsCustomizePanel')?.addEventListener('change', function(e) {
            var cb = e.target;
            if (!cb.matches('input[type=checkbox]')) return;
            var prefs = loadWidgetPrefs();
            prefs[cb.dataset.widget] = cb.checked;
            saveWidgetPrefs(prefs);
            var el = findWidgetEl(cb.dataset.widget);
            if (el) el.style.display = cb.checked ? '' : 'none';
        });

        // Chart PNG download
        getContainer()?.addEventListener('click', function(e) {
            var btn = e.target.closest('.chart-download-btn');
            if (!btn) return;
            var chartId = btn.dataset.chartId;
            var canvas = document.getElementById(chartId);
            if (!canvas) return;
            var link = document.createElement('a');
            link.download = 'PartPulse_' + chartId + '_' + new Date().toISOString().slice(0,10) + '.png';
            link.href = canvas.toDataURL('image/png');
            link.click();
        });

        // Modal close
        document.getElementById('analyticsDrillClose')?.addEventListener('click', closeDrillDown);
        document.getElementById('analyticsDrillBackdrop')?.addEventListener('click', closeDrillDown);
        if (!drillModalListenersAttached) {
            document.addEventListener('keydown', function (e) {
                if (e.key === 'Escape') closeDrillDown();
            });
            drillModalListenersAttached = true;
        }
    }

    async function loadData() {
        try {
            destroyAllCharts();

            if (typeof Chart !== 'undefined') {
                Chart.defaults.color = '#9ca3af';
                Chart.defaults.borderColor = 'rgba(148,163,184,0.15)';
            }

            // BUG FIX: load all endpoints in parallel including new ones
            const [summary, spendTime, statusDist, buildingSpend, supplierSpend, categorySpend, supplierPerf, topParts,
                   slaData, aiStats, recurringItems, concentrationData] =
                await Promise.all([
                    apiFetch('summary'),
                    apiFetch('spend-over-time', currentPeriod !== 'custom' && !getMonthsParam() ? { months: 24 } : null),
                    apiFetch('order-status-distribution'),
                    apiFetch('spend-by-building'),
                    apiFetch('spend-by-supplier', { limit: 10 }),
                    apiFetch('spend-by-category'),
                    apiFetch('supplier-performance', { limit: 10 }),
                    apiFetch('top-parts', { limit: 20 }),
                    // New endpoints — graceful fallback if they fail
                    apiFetch('sla-breach').catch(() => ({ orders: [], summary: { totalBreached: 0 } })),
                    apiFetch('ai-acceptance-rate').catch(() => null),
                    apiFetch('recurring-items').catch(() => []),
                    apiFetch('supplier-concentration').catch(() => null)
                ]);

            // BUG FIX: store all data under consistent keys
            lastData = {
                summary, spendTime, statusDist, buildingSpend, supplierSpend, categorySpend,
                supplierPerf, topParts, slaData, aiStats, recurringItems, concentrationData,
                // Legacy aliases for export modules
                bySupplier: supplierSpend,
                supplierPerformance: supplierPerf,
                spendOverTime: spendTime
            };

            renderKPIs(summary);
            renderSpendOverTime(spendTime);
            renderSpendForecast(spendTime);
            detectAndShowAnomalies(spendTime);
            renderOrderStatus(statusDist);
            renderSpendByBuilding(buildingSpend);
            renderSpendBySupplier(supplierSpend);
            renderSpendByCategory(categorySpend);
            renderSupplierPerformance(supplierPerf);
            renderTopParts(topParts);

            // New panels
            renderSLABreach(slaData);
            renderAIStats(aiStats);
            renderRecurringItems(recurringItems);
            renderConcentrationPanel(concentrationData);

            // BUG FIX: wire insights + forecast into loadData (not just refresh)
            await loadInsightsAndForecast(lastData);

            applyWidgetVisibility();

            lastRefreshTime = Date.now();
            var updatedEl = document.getElementById('analyticsLastUpdated');
            if (updatedEl) {
                updatedEl.textContent = 'Обновено сега';
                if (!window._analyticsRefreshTimer) {
                    window._analyticsRefreshTimer = setInterval(function() {
                        var el2 = document.getElementById('analyticsLastUpdated');
                        if (!el2) return;
                        var secs = lastRefreshTime ? Math.round((Date.now() - lastRefreshTime) / 1000) : 0;
                        el2.textContent = secs < 60 ? 'Обновено сега' : secs < 3600 ? `Обновено преди ${Math.floor(secs/60)} мин.` : `Обновено преди ${Math.floor(secs/3600)} ч.`;
                    }, 30000);
                }
            }
        } catch (err) {
            console.error('Analytics load error:', err);
            showError('Грешка при зареждане на данните. ' + err.message);
        }
    }

    function renderKPIs(d) {
        const grid = document.getElementById('analyticsKpiGrid');
        if (!grid) return;

        function trendBadge(current, previous, isLowerBetter) {
            if (previous == null || previous === 0 || current == null) return '';
            const pct = ((current - previous) / previous * 100);
            const isUp = pct > 0;
            const isGood = isLowerBetter ? !isUp : isUp;
            const arrow = isUp ? '▲' : '▼';
            const color = isGood ? '#22c55e' : '#ef4444';
            const bg = isGood ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)';
            return `<div class="kpi-trend-badge" style="color:${color};background:${bg};">${arrow} ${Math.abs(pct).toFixed(1)}% спрямо предишен период</div>`;
        }

        const prev = d.previousPeriod || {};
        const cards = [
            { icon: '💰', rawVal: parseFloat(d.totalSpend)||0, value: fmtMoney(d.totalSpend), label: t('Общи Разходи','Total Spend'), trend: trendBadge(parseFloat(d.totalSpend), prev.totalSpend, false), isFloat: true },
            { icon: '📦', rawVal: parseInt(d.totalOrders)||0, value: fmtNum(d.totalOrders), label: t('Общо Поръчки','Total Orders'), trend: trendBadge(parseInt(d.totalOrders), prev.totalOrders, false), isFloat: false },
            { icon: '📊', rawVal: parseFloat(d.avgOrderValue)||0, value: fmtMoney(d.avgOrderValue), label: t('Средна Стойност','Avg Order Value'), trend: trendBadge(parseFloat(d.avgOrderValue), prev.avgOrderValue, false), isFloat: true },
            { icon: '⏱', rawVal: parseFloat(d.avgLeadTimeDays)||0, value: (parseFloat(d.avgLeadTimeDays)||0).toFixed(1)+(getLang()==='en'?' days':' дни'), label: t('Средно Изпълнение','Avg Lead Time'), trend: '', isFloat: true },
            { icon: '✅', rawVal: parseFloat(d.deliveryRate)||0, value: fmtPct(d.deliveryRate), label: t('Доставени','Delivered'), trend: '', isFloat: true },
            { icon: '🎯', rawVal: parseFloat(d.onTimeRate)||0, value: fmtPct(d.onTimeRate), label: t('Навреме','On Time'), trend: '', isFloat: true },
            { icon: '🏭', rawVal: parseInt(d.activeSuppliers)||0, value: fmtNum(d.activeSuppliers), label: t('Активни Доставчици','Active Suppliers'), trend: '', isFloat: false },
            { icon: '🔄', rawVal: parseInt(d.ordersInProgress)||0, value: fmtNum(d.ordersInProgress), label: t('В Процес','In Progress'), trend: '', isFloat: false }
        ];

        grid.innerHTML = cards.map((c, i) => {
            // Auto-shrink font size for long values (e.g. 163.255,09 EUR)
            var valLen = String(c.value).length;
            var fontSize = valLen > 14 ? '1.05rem' : valLen > 11 ? '1.25rem' : '';
            var styleAttr = fontSize ? ` style="font-size:${fontSize};"` : '';
            return `
            <div class="kpi-card kpi-card--hoverable">
                <div class="kpi-icon">${c.icon}</div>
                <div class="kpi-value" data-target="${c.rawVal}" data-float="${c.isFloat}" data-display="${c.value}"${styleAttr}>0</div>
                <div class="kpi-label">${c.label}</div>
                ${c.trend}
            </div>`;
        }).join('');

        // Animate counters
        grid.querySelectorAll('.kpi-value[data-target]').forEach(function(el) {
            const target = parseFloat(el.dataset.target) || 0;
            const isFloat = el.dataset.float === 'true';
            const displayVal = el.dataset.display;
            const duration = 900;
            const start = performance.now();
            function tick(now) {
                const elapsed = Math.min(now - start, duration);
                const progress = elapsed / duration;
                const ease = 1 - Math.pow(1 - progress, 3);
                const current = target * ease;
                if (isFloat && target > 100) {
                    el.textContent = current.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' EUR';
                } else if (isFloat) {
                    el.textContent = current.toFixed(1) + (displayVal.includes('%') ? '%' : displayVal.includes('дни') ? ' дни' : '');
                } else {
                    el.textContent = Math.round(current).toLocaleString('de-DE');
                }
                if (progress < 1) requestAnimationFrame(tick);
                else el.textContent = displayVal;
            }
            requestAnimationFrame(tick);
        });
    }

    function renderSpendOverTime(data) {
        const canvas = document.getElementById('chartSpendOverTime');
        if (!canvas || typeof Chart === 'undefined') return;
        destroyChart('spendOverTime');

        const ctx2d = canvas.getContext('2d');
        const gradient = ctx2d.createLinearGradient(0, 0, 0, 320);
        gradient.addColorStop(0, 'rgba(56,189,248,0.85)');
        gradient.addColorStop(1, 'rgba(56,189,248,0.2)');

        var datasets = [{
            label: 'Разходи (EUR)',
            data: data.map(function(d) { return d.total; }),
            backgroundColor: gradient,
            borderRadius: 4,
            maxBarThickness: 40
        }];

        if (comparisonMode && data.length >= 2) {
            var compData = [null].concat(data.slice(0, data.length - 1).map(function(d) { return d.total; }));
            datasets.push({
                label: 'Предишен Период',
                data: compData,
                backgroundColor: 'rgba(167,139,250,0.45)',
                borderRadius: 4,
                maxBarThickness: 30
            });
        }

        chartsRegistry['spendOverTime'] = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: data.map(d => formatPeriodLabel(d.period)),
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                animation: { duration: 800, easing: 'easeInOutQuart' },
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: comparisonMode },
                    tooltip: {
                        backgroundColor: 'rgba(15,23,42,0.97)',
                        titleColor: '#38bdf8',
                        bodyColor: '#cbd5e1',
                        borderColor: 'rgba(56,189,248,0.4)',
                        borderWidth: 1,
                        padding: 10,
                        cornerRadius: 8,
                        callbacks: { label: ctx => '  ' + fmtMoney(ctx.raw) }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { callback: v => v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v }
                    }
                },
                onHover: (evt) => { if (evt.native) evt.native.target.style.cursor = 'pointer'; },
                onClick: (evt, elements) => {
                    if (!elements.length) return;
                    const idx = elements[0].index;
                    const period = data[idx].period;
                    openDrillDown('period', period, 'Поръчки \u2014 ' + formatPeriodLabel(period));
                }
            }
        });
    }

    function renderSpendForecast(spendTime) {
        var canvas = document.getElementById('chartSpendForecast');
        if (!canvas || typeof Chart === 'undefined') return;
        destroyChart('spendForecast');

        if (!spendTime || spendTime.length < 3) {
            var note = document.getElementById('forecastNote');
            if (note) note.textContent = 'Нужни са минимум 3 месеца данни за прогноза.';
            return;
        }

        var n = spendTime.length;
        var x = spendTime.map(function(_, i) { return i; });
        var y = spendTime.map(function(d) { return parseFloat(d.total) || 0; });
        var sumX = x.reduce(function(a, b) { return a + b; }, 0);
        var sumY = y.reduce(function(a, b) { return a + b; }, 0);
        var sumXY = x.reduce(function(acc, xi, i) { return acc + xi * y[i]; }, 0);
        var sumX2 = x.reduce(function(acc, xi) { return acc + xi * xi; }, 0);
        var slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        var intercept = (sumY - slope * sumX) / n;

        var meanY = sumY / n;
        var ssTotal = y.reduce(function(acc, yi) { return acc + Math.pow(yi - meanY, 2); }, 0);
        var ssRes = y.reduce(function(acc, yi, i) { return acc + Math.pow(yi - (slope * i + intercept), 2); }, 0);
        var rSquared = ssTotal > 0 ? Math.max(0, 1 - ssRes / ssTotal) : 0;

        var lastPeriod = spendTime[spendTime.length - 1].period;
        function addMonths(periodStr, m) {
            var parts = periodStr.split('-');
            var d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1 + m, 1);
            return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        }
        var forecastPeriods = [1, 2, 3].map(function(m) { return addMonths(lastPeriod, m); });
        var forecastValues = [0, 1, 2].map(function(i) { return Math.max(0, slope * (n + i) + intercept); });

        var allLabels = spendTime.map(function(d) { return formatPeriodLabel(d.period); }).concat(forecastPeriods.map(formatPeriodLabel));
        var actualData = y.concat([null, null, null]);
        var forecastData = new Array(n - 1).fill(null).concat([y[n - 1]]).concat(forecastValues);

        var ctx2d = canvas.getContext('2d');
        var gradActual = ctx2d.createLinearGradient(0, 0, 0, 300);
        gradActual.addColorStop(0, 'rgba(56,189,248,0.7)');
        gradActual.addColorStop(1, 'rgba(56,189,248,0.1)');

        chartsRegistry['spendForecast'] = new Chart(canvas, {
            type: 'line',
            data: {
                labels: allLabels,
                datasets: [
                    {
                        label: 'Реални Разходи',
                        data: actualData,
                        borderColor: '#38bdf8',
                        backgroundColor: gradActual,
                        borderWidth: 2.5,
                        tension: 0.3,
                        pointRadius: 4,
                        pointHoverRadius: 6,
                        fill: true,
                        spanGaps: false
                    },
                    {
                        label: 'Прогноза',
                        data: forecastData,
                        borderColor: '#a78bfa',
                        backgroundColor: 'rgba(167,139,250,0.08)',
                        borderWidth: 2,
                        borderDash: [6, 4],
                        tension: 0.3,
                        pointRadius: 5,
                        pointStyle: 'rectRot',
                        pointBackgroundColor: '#a78bfa',
                        fill: false,
                        spanGaps: false
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                animation: { duration: 900, easing: 'easeInOutQuart' },
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: true, position: 'top', labels: { color: '#cbd5e1', usePointStyle: true, padding: 12, font: { size: 11 } } },
                    tooltip: {
                        backgroundColor: 'rgba(15,23,42,0.97)',
                        titleColor: '#38bdf8',
                        bodyColor: '#cbd5e1',
                        borderColor: 'rgba(56,189,248,0.4)',
                        borderWidth: 1,
                        padding: 10,
                        callbacks: { label: function(ctx) { return ctx.dataset.label + ': ' + (ctx.raw != null ? fmtMoney(ctx.raw) : 'N/A'); } }
                    }
                },
                scales: {
                    x: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { display: false } },
                    y: {
                        beginAtZero: false,
                        ticks: { color: '#94a3b8', callback: function(v) { return v >= 1000 ? (v/1000).toFixed(0)+'k EUR' : v; } },
                        grid: { color: 'rgba(148,163,184,0.08)' }
                    }
                }
            }
        });

        var note = document.getElementById('forecastNote');
        if (note) {
            note.textContent = 'Линейна прогноза — R² коефициент: ' + (rSquared * 100).toFixed(0) + '%. Индикативна стойност.';
        }
    }

    function detectAndShowAnomalies(spendTime) {
        var existing = document.querySelector('.analytics-anomaly-banner');
        if (existing) existing.remove();

        if (!spendTime || spendTime.length < 4) return;
        var values = spendTime.map(function(d) { return parseFloat(d.total) || 0; });
        var n = values.length;
        var mean = values.reduce(function(a, b) { return a + b; }) / n;
        var variance = values.reduce(function(acc, v) { return acc + Math.pow(v - mean, 2); }, 0) / n;
        var stdDev = Math.sqrt(variance);
        if (stdDev === 0) return;

        var threshold = 2.0;
        var anomalies = [];
        values.forEach(function(v, i) {
            var z = Math.abs((v - mean) / stdDev);
            if (z > threshold) {
                anomalies.push({
                    period: spendTime[i].period,
                    value: v,
                    direction: v > mean ? 'spike' : 'drop',
                    pct: Math.abs((v - mean) / mean * 100).toFixed(1)
                });
            }
        });

        if (anomalies.length === 0) return;

        var latest = anomalies[anomalies.length - 1];
        var icon = latest.direction === 'spike' ? '🚨' : '📉';
        var msg = latest.direction === 'spike'
            ? `Скок на разходите в ${formatPeriodLabel(latest.period)}: ${latest.pct}% над средното (${fmtMoney(latest.value)})`
            : `Спад на разходите в ${formatPeriodLabel(latest.period)}: ${latest.pct}% под средното (${fmtMoney(latest.value)})`;

        var banner = document.createElement('div');
        banner.className = 'analytics-anomaly-banner';
        banner.innerHTML = icon + ' <strong>Открита Аномалия:</strong> ' + msg +
            ' <button class="anomaly-dismiss">Затвори</button>';
        banner.querySelector('.anomaly-dismiss').addEventListener('click', function() { banner.remove(); });

        var kpiGrid = document.getElementById('analyticsKpiGrid');
        if (kpiGrid) kpiGrid.parentNode.insertBefore(banner, kpiGrid);
    }

    function renderOrderStatus(data) {
        const canvas = document.getElementById('chartOrderStatus');
        if (!canvas || typeof Chart === 'undefined') return;
        destroyChart('orderStatus');

        chartsRegistry['orderStatus'] = new Chart(canvas, {
            type: 'doughnut',
            data: {
                labels: data.map(d => d.status),
                datasets: [{
                    data: data.map(d => d.count),
                    backgroundColor: data.map(d => STATUS_COLORS[d.status] || '#6b7280'),
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                cutout: '55%',
                plugins: {
                    legend: { position: 'right', labels: { boxWidth: 12, padding: 8, font: { size: 11 } } },
                    tooltip: {
                        backgroundColor: 'rgba(15,23,42,0.97)',
                        titleColor: '#38bdf8',
                        bodyColor: '#cbd5e1',
                        borderColor: 'rgba(56,189,248,0.4)',
                        borderWidth: 1,
                        padding: 10,
                        cornerRadius: 8,
                        callbacks: { label: ctx => ctx.label + ': ' + ctx.raw + ' (' + fmtPct(data[ctx.dataIndex].percent) + ')' }
                    }
                },
                onHover: (evt) => { if (evt.native) evt.native.target.style.cursor = 'pointer'; },
                onClick: (evt, elements) => {
                    if (!elements.length) return;
                    const idx = elements[0].index;
                    openDrillDown('status', data[idx].status, 'Поръчки \u2014 ' + data[idx].status);
                }
            }
        });
    }

    function renderSpendByBuilding(data) {
        const canvas = document.getElementById('chartSpendBuilding');
        if (!canvas || typeof Chart === 'undefined') return;
        destroyChart('spendBuilding');

        chartsRegistry['spendBuilding'] = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: data.map(d => d.building + (d.buildingName !== d.building ? ' - ' + d.buildingName : '')),
                datasets: [{
                    label: 'Разходи (EUR)',
                    data: data.map(d => d.total),
                    backgroundColor: COLORS.slice(0, data.length),
                    borderRadius: 4,
                    maxBarThickness: 28
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                indexAxis: 'y',
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(15,23,42,0.97)',
                        titleColor: '#38bdf8',
                        bodyColor: '#cbd5e1',
                        borderColor: 'rgba(56,189,248,0.4)',
                        borderWidth: 1,
                        padding: 10,
                        cornerRadius: 8,
                        callbacks: { label: ctx => fmtMoney(ctx.raw) + ' (' + fmtPct(data[ctx.dataIndex].percent) + ')' }
                    }
                },
                scales: { x: { beginAtZero: true, ticks: { callback: v => v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v } } },
                onHover: (evt) => { if (evt.native) evt.native.target.style.cursor = 'pointer'; },
                onClick: (evt, elements) => {
                    if (!elements.length) return;
                    const idx = elements[0].index;
                    openDrillDown('building', data[idx].building, 'Поръчки \u2014 ' + data[idx].buildingName);
                }
            }
        });
    }

    function renderSpendBySupplier(data) {
        const canvas = document.getElementById('chartSpendSupplier');
        if (!canvas || typeof Chart === 'undefined') return;
        destroyChart('spendSupplier');

        chartsRegistry['spendSupplier'] = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: data.map(d => d.supplierName),
                datasets: [{
                    label: 'Разходи (EUR)',
                    data: data.map(d => d.total),
                    backgroundColor: COLORS.slice(0, data.length),
                    borderRadius: 4,
                    maxBarThickness: 28
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                indexAxis: 'y',
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(15,23,42,0.97)',
                        titleColor: '#38bdf8',
                        bodyColor: '#cbd5e1',
                        borderColor: 'rgba(56,189,248,0.4)',
                        borderWidth: 1,
                        padding: 10,
                        cornerRadius: 8,
                        callbacks: { label: ctx => fmtMoney(ctx.raw) + ' (' + data[ctx.dataIndex].orderCount + ' поръчки)' }
                    }
                },
                scales: { x: { beginAtZero: true, ticks: { callback: v => v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v } } },
                onHover: (evt) => { if (evt.native) evt.native.target.style.cursor = 'pointer'; },
                onClick: (evt, elements) => {
                    if (!elements.length) return;
                    const idx = elements[0].index;
                    openDrillDown('supplier', data[idx].supplierId, 'Поръчки \u2014 ' + data[idx].supplierName);
                }
            }
        });
    }

    function renderSpendByCategory(data) {
        var cards = document.querySelectorAll('.chart-card.full-width');
        var cardEl = null;
        cards.forEach(function(c) {
            var h = c.querySelector('h3');
            if (h && h.textContent.trim().toLowerCase().indexOf('категория') !== -1) cardEl = c;
        });
        if (!cardEl || typeof Chart === 'undefined') return;
        destroyChart('spendCategory');

        var existingCanvas = cardEl.querySelector('canvas');
        if (existingCanvas) existingCanvas.remove();
        var existingHybrid = cardEl.querySelector('.category-hybrid');
        if (existingHybrid) existingHybrid.remove();

        var hybrid = document.createElement('div');
        hybrid.className = 'category-hybrid';
        hybrid.innerHTML =
            '<div class="category-chart-side">' +
                '<canvas id="chartSpendCategory"></canvas>' +
                '<div class="category-legend" id="categoryLegend"></div>' +
            '</div>' +
            '<div class="category-table-side">' +
                '<div class="category-search-wrap">' +
                    '<input type="text" id="categorySearch" placeholder="\ud83d\udd0d  Филтриране..." class="category-search-input">' +
                '</div>' +
                '<div class="category-table-wrap">' +
                    '<table class="analytics-table category-table" id="categoryTable">' +
                        '<thead><tr>' +
                            '<th style="width:2rem">#</th>' +
                            '<th class="sortable" data-sort="category">Категория <span class="sort-icon">\u21D5</span></th>' +
                            '<th class="sortable text-right" data-sort="count">Поръчки <span class="sort-icon">\u21D5</span></th>' +
                            '<th class="sortable text-right active-sort desc" data-sort="total">Разходи <span class="sort-icon">\u2193</span></th>' +
                            '<th class="text-right" style="width:4rem">%</th>' +
                        '</tr></thead>' +
                        '<tbody id="categoryTableBody"></tbody>' +
                    '</table>' +
                '</div>' +
            '</div>';
        cardEl.appendChild(hybrid);

        var sortCol = 'total';
        var sortDir = 'desc';
        var searchTerm = '';

        var top8 = data.slice(0, 8);
        var others = data.slice(8);
        var othersTotal = others.reduce(function(s, d) { return s + d.total; }, 0);
        var othersCount = others.reduce(function(s, d) { return s + d.count; }, 0);
        var grandTotal = data.reduce(function(s, d) { return s + d.total; }, 0);
        var chartData = othersTotal > 0
            ? top8.concat([{ category: 'Други (' + others.length + ')', total: othersTotal, count: othersCount, percent: parseFloat(((othersTotal / grandTotal) * 100).toFixed(1)) }])
            : top8;

        var canvas = document.getElementById('chartSpendCategory');
        chartsRegistry['spendCategory'] = new Chart(canvas, {
            type: 'doughnut',
            data: {
                labels: chartData.map(function(d) { return d.category; }),
                datasets: [{
                    data: chartData.map(function(d) { return d.total; }),
                    backgroundColor: COLORS.slice(0, chartData.length),
                    borderWidth: 2,
                    borderColor: 'var(--color-bg-elevated)'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                cutout: '60%',
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: function(ctx) { return ' ' + fmtMoney(ctx.raw) + ' (' + fmtPct(ctx.raw / grandTotal * 100) + ')'; } } }
                },
                onHover: function(evt) { if (evt.native) evt.native.target.style.cursor = 'pointer'; },
                onClick: function(evt, elements) {
                    if (!elements.length) return;
                    var idx = elements[0].index;
                    var cat = chartData[idx];
                    if (cat.category.indexOf('Други (') === 0) return;
                    openDrillDown('category', cat.category, 'Поръчки \u2014 Категория: ' + cat.category);
                }
            },
            plugins: [{
                id: 'centerText',
                afterDraw: function(chart) {
                    var ctx = chart.ctx;
                    var area = chart.chartArea;
                    var cx = (area.left + area.right) / 2;
                    var cy = (area.top + area.bottom) / 2;
                    ctx.save();
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = '#38bdf8';
                    ctx.font = 'bold 13px system-ui, sans-serif';
                    ctx.fillText(grandTotal >= 1000 ? (grandTotal/1000).toFixed(1)+'k EUR' : grandTotal.toFixed(0)+' EUR', cx, cy - 8);
                    ctx.fillStyle = '#9ca3af';
                    ctx.font = '10px system-ui, sans-serif';
                    ctx.fillText('общо разходи', cx, cy + 10);
                    ctx.restore();
                }
            }]
        });

        var legendEl = document.getElementById('categoryLegend');
        if (legendEl) {
            legendEl.innerHTML = chartData.map(function(d, i) {
                return '<div class="cat-legend-item">' +
                    '<span class="cat-legend-dot" style="background:' + COLORS[i] + '"></span>' +
                    '<span class="cat-legend-name">' + esc(d.category) + '</span>' +
                    '<span class="cat-legend-val">' + (d.total >= 1000 ? (d.total/1000).toFixed(1)+'k' : d.total.toFixed(0)) + '</span>' +
                    '</div>';
            }).join('');
        }

        function renderCategoryTable() {
            var tbody = document.getElementById('categoryTableBody');
            if (!tbody) return;
            var filtered = data.filter(function(d) {
                return !searchTerm || d.category.toLowerCase().indexOf(searchTerm.toLowerCase()) !== -1;
            });
            filtered.sort(function(a, b) {
                var av = a[sortCol], bv = b[sortCol];
                if (typeof av === 'string') av = av.toLowerCase();
                if (typeof bv === 'string') bv = bv.toLowerCase();
                if (av < bv) return sortDir === 'asc' ? -1 : 1;
                if (av > bv) return sortDir === 'asc' ? 1 : -1;
                return 0;
            });
            tbody.innerHTML = filtered.map(function(d, i) {
                return '<tr style="cursor:pointer;" class="cat-row" data-cat="' + esc(d.category) + '">' +
                    '<td style="color:var(--color-text-secondary);font-size:0.75rem;">' + (i + 1) + '</td>' +
                    '<td><span class="cat-dot" style="background:' + (COLORS[data.indexOf(d)] || '#6b7280') + '"></span>' + esc(d.category) + '</td>' +
                    '<td class="text-right">' + d.count + '</td>' +
                    '<td class="text-right" style="color:var(--color-accent);font-weight:600;">' + fmtMoney(d.total) + '</td>' +
                    '<td class="text-right">' +
                        '<div class="cat-pct-bar"><div class="cat-pct-fill" style="width:' + Math.min(d.percent, 100) + '%"></div></div>' +
                        '<span style="font-size:0.75rem;color:var(--color-text-secondary);">' + fmtPct(d.percent) + '</span>' +
                    '</td></tr>';
            }).join('');
            tbody.querySelectorAll('.cat-row').forEach(function(tr) {
                tr.addEventListener('click', function() {
                    openDrillDown('category', this.dataset.cat, 'Поръчки \u2014 Категория: ' + this.dataset.cat);
                });
            });
        }

        renderCategoryTable();

        document.querySelectorAll('#categoryTable .sortable').forEach(function(th) {
            th.addEventListener('click', function() {
                var col = this.dataset.sort;
                if (sortCol === col) { sortDir = sortDir === 'asc' ? 'desc' : 'asc'; }
                else { sortCol = col; sortDir = col === 'category' ? 'asc' : 'desc'; }
                document.querySelectorAll('#categoryTable .sortable').forEach(function(h) {
                    h.classList.remove('active-sort', 'asc', 'desc');
                    h.querySelector('.sort-icon').textContent = '\u21D5';
                });
                this.classList.add('active-sort', sortDir);
                this.querySelector('.sort-icon').textContent = sortDir === 'asc' ? '\u2191' : '\u2193';
                renderCategoryTable();
            });
        });

        var searchInput = document.getElementById('categorySearch');
        if (searchInput) {
            searchInput.addEventListener('input', function() { searchTerm = this.value; renderCategoryTable(); });
        }
    }

    function renderSupplierPerformance(data) {
        const body = document.getElementById('supplierPerfTableBody');
        if (!body) return;

        if (!data || data.length === 0) {
            body.innerHTML = '<p style="color: var(--color-text-secondary); padding: 1rem;">Няма данни за доставчици.</p>';
            return;
        }

        let html = '<table class="analytics-table"><thead><tr>' +
            '<th>Доставчик</th><th class="text-right">Поръчки</th><th class="text-right">Доставени</th>' +
            '<th>Навреме %</th><th class="text-right">Средни Дни</th><th class="text-right">Общо Разходи</th>' +
            '</tr></thead><tbody>';

        data.forEach(s => {
            const barColor = s.onTimeRate >= 80 ? 'var(--color-success)' : s.onTimeRate >= 50 ? 'var(--color-warning)' : 'var(--color-error)';
            html += '<tr style="cursor:pointer;" data-supplier-id="' + s.supplierId + '" data-supplier-name="' + esc(s.supplierName) + '">' +
                '<td>' + esc(s.supplierName) + '</td>' +
                '<td class="text-right">' + s.totalOrders + '</td>' +
                '<td class="text-right">' + s.delivered + '</td>' +
                '<td>' + fmtPct(s.onTimeRate) +
                    '<div class="ontime-bar"><div class="ontime-bar-fill" style="width:' + Math.min(s.onTimeRate, 100) + '%;background:' + barColor + '"></div></div></td>' +
                '<td class="text-right">' + (parseFloat(s.avgLeadDays) || 0).toFixed(1) + '</td>' +
                '<td class="text-right">' + fmtMoney(s.totalSpend) + '</td>' +
                '</tr>';
        });

        html += '</tbody></table>';
        body.innerHTML = html;

        body.querySelectorAll('tr[data-supplier-id]').forEach(function(tr) {
            tr.addEventListener('click', function() {
                var sid = this.getAttribute('data-supplier-id');
                var sname = this.getAttribute('data-supplier-name');
                openDrillDown('supplier', sid, 'Поръчки \u2014 ' + sname);
            });
        });
    }

    function renderTopParts(data) {
        var wrapper = document.getElementById('topPartsTableWrapper');
        var body = document.getElementById('topPartsTableBody');
        if (!body) return;

        if (wrapper && !wrapper.querySelector('.top-parts-controls')) {
            var h3 = wrapper.querySelector('h3');
            if (h3) {
                var controls = document.createElement('div');
                controls.className = 'top-parts-controls';
                controls.innerHTML =
                    '<input class="top-parts-search" id="topPartsSearch" placeholder="Търсене на части..." type="text">' +
                    '<select class="top-parts-limit" id="topPartsLimit">' +
                    '<option value="10">Топ 10</option>' +
                    '<option value="20" selected>Топ 20</option>' +
                    '<option value="50">Топ 50</option>' +
                    '<option value="999">Всички</option>' +
                    '</select>';
                h3.parentNode.insertBefore(controls, h3.nextSibling);
            }
        }

        if (!data || data.length === 0) {
            body.innerHTML = '<p style="color:var(--color-text-secondary);padding:1rem;">Няма данни за части.</p>';
            return;
        }

        wrapper._allPartsData = data;

        function renderList(items) {
            if (!items || items.length === 0) {
                body.innerHTML = '<p style="color:var(--color-text-secondary);padding:1rem;">Няма намерени части.</p>';
                return;
            }

            var maxOrders = Math.max.apply(null, items.map(function(p) { return p.orderCount || 0; }));
            var maxSpend  = Math.max.apply(null, items.map(function(p) { return parseFloat(p.totalSpend) || 0; }));
            var rankColors = ['#eab308','#94a3b8','#fb923c'];

            var html = '<div class="top-parts-list">';
            items.forEach(function(p, i) {
                var rank = i + 1;
                var rankColor = rank <= 3 ? rankColors[rank - 1] : 'var(--color-text-secondary)';
                var rankLabel = rank <= 3 ? ['🥇','🥈','🥉'][rank-1] : rank;
                var freqPct = maxOrders > 0 ? (p.orderCount / maxOrders * 100) : 0;
                var spendPct = maxSpend > 0 ? ((parseFloat(p.totalSpend)||0) / maxSpend * 100) : 0;

                html += '<div class="top-part-card" data-part-desc="' + esc(p.itemDescription) + '">' +
                    '<div class="top-part-rank" style="color:' + rankColor + ';">' + rankLabel + '</div>' +
                    '<div class="top-part-info">' +
                        '<div class="top-part-name" title="' + esc(p.itemDescription) + '">' + esc(p.itemDescription) + '</div>' +
                        '<div class="top-part-bars">' +
                            '<div class="top-part-bar-row"><span class="top-part-bar-label">Честота</span>' +
                                '<div class="top-part-bar-track"><div class="top-part-bar-fill top-part-bar-freq" style="width:' + freqPct.toFixed(1) + '%"></div></div></div>' +
                            '<div class="top-part-bar-row"><span class="top-part-bar-label">Разход</span>' +
                                '<div class="top-part-bar-track"><div class="top-part-bar-fill top-part-bar-spend" style="width:' + spendPct.toFixed(1) + '%"></div></div></div>' +
                        '</div>' +
                    '</div>' +
                    '<div class="top-part-stats">' +
                        '<div class="top-part-stat"><span class="stat-val">' + p.orderCount + '</span><span class="stat-key">поръчки</span></div>' +
                        '<div class="top-part-stat"><span class="stat-val">' + fmtNum(p.totalQty) + '</span><span class="stat-key">бр.</span></div>' +
                        '<div class="top-part-stat"><span class="stat-val">' + fmtMoney(p.totalSpend) + '</span><span class="stat-key">разход</span></div>' +
                    '</div>' +
                '</div>';
            });
            html += '</div>';
            body.innerHTML = html;

            body.querySelectorAll('.top-part-card').forEach(function(card) {
                card.addEventListener('click', function() {
                    var desc = this.dataset.partDesc;
                    openDrillDown('part', desc, 'Повторни Поръчки — ' + desc);
                });
            });
        }

        function applyFilters() {
            var allData = wrapper._allPartsData || [];
            var search = (document.getElementById('topPartsSearch')?.value || '').toLowerCase().trim();
            var limitEl = document.getElementById('topPartsLimit');
            var limit = limitEl ? parseInt(limitEl.value) : 20;
            var filtered = allData;
            if (search) {
                filtered = filtered.filter(function(p) {
                    return (p.itemDescription||'').toLowerCase().includes(search);
                });
            }
            renderList(filtered.slice(0, limit));
        }

        renderList(data.slice(0, 20));

        var searchEl = document.getElementById('topPartsSearch');
        var limitEl  = document.getElementById('topPartsLimit');
        if (searchEl) { searchEl.removeEventListener('input', searchEl._handler); searchEl._handler = applyFilters; searchEl.addEventListener('input', applyFilters); }
        if (limitEl)  { limitEl.removeEventListener('change', limitEl._handler); limitEl._handler = applyFilters; limitEl.addEventListener('change', applyFilters); }
    }

    // ── NEW PANELS ─────────────────────────────────────────────────

    function renderSLABreach(data) {
        const body = document.getElementById('slaBreachBody');
        const badge = document.getElementById('slaBreachBadge');
        if (!body) return;

        if (!data || !data.orders || data.orders.length === 0) {
            body.innerHTML = '<div class="insights-empty"><span>✅</span><p>Няма SLA нарушения за избрания период. Отлично!</p></div>';
            if (badge) badge.style.display = 'none';
            return;
        }

        const orders = data.orders;
        if (badge) {
            badge.textContent = orders.length + ' нарушения';
            badge.style.display = '';
            badge.style.background = 'rgba(239,68,68,0.15)';
            badge.style.color = '#ef4444';
            badge.style.borderRadius = '12px';
            badge.style.padding = '2px 10px';
            badge.style.fontSize = '0.78rem';
            badge.style.fontWeight = '600';
        }

        // Summary by status
        const byStatus = data.summary?.byStatus || {};
        let summaryHtml = '<div style="display:flex;flex-wrap:wrap;gap:0.5rem;margin-bottom:1rem;">';
        Object.entries(byStatus).forEach(([status, count]) => {
            summaryHtml += `<span style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);color:#ef4444;border-radius:8px;padding:3px 10px;font-size:0.78rem;">${esc(status)}: ${count}</span>`;
        });
        summaryHtml += '</div>';

        let html = summaryHtml + '<div style="overflow-x:auto;"><table class="analytics-table"><thead><tr>' +
            '<th>#</th><th>Артикул</th><th>Статус</th><th>Сграда</th><th>Приоритет</th>' +
            '<th class="text-right">Дни в Статус</th><th class="text-right">Праг (дни)</th>' +
            '<th>Доставчик</th><th>Заявител</th>' +
            '</tr></thead><tbody>';

        const priorityColors = { 'Urgent': '#ef4444', 'High': '#fb923c', 'Normal': '#94a3b8', 'Low': '#6b7280' };

        orders.slice(0, 50).forEach(o => {
            const pColor = priorityColors[o.priority] || '#94a3b8';
            const overBy = o.daysInCurrentStatus - o.threshold;
            html += '<tr style="cursor:pointer;" onclick="(function(){' +
                'var tab=document.querySelector(\'[data-tab="ordersTab"]\');if(tab)tab.click();' +
                'setTimeout(function(){if(typeof openOrderDetail===\'function\')openOrderDetail(' + o.id + ');},200);' +
                '})()">' +
                '<td><span style="color:#94a3b8;font-size:0.78rem;">#' + o.id + '</span></td>' +
                '<td class="drill-item-col" title="' + esc(o.itemDescription) + '">' + esc(o.itemDescription) + '</td>' +
                '<td><span class="drill-status-badge" style="background:#ef444422;color:#ef4444;">' + esc(o.status) + '</span></td>' +
                '<td>' + esc(o.building) + '</td>' +
                '<td><span style="color:' + pColor + ';font-weight:600;">' + esc(o.priority) + '</span></td>' +
                '<td class="text-right" style="color:#ef4444;font-weight:700;">' + o.daysInCurrentStatus + ' дни</td>' +
                '<td class="text-right" style="color:#94a3b8;">' + o.threshold + ' дни</td>' +
                '<td>' + esc(o.supplierName || '—') + '</td>' +
                '<td>' + esc(o.requesterName) + '</td>' +
                '</tr>';
        });

        html += '</tbody></table></div>';
        if (orders.length > 50) {
            html += `<p style="color:var(--color-text-secondary);font-size:0.8rem;margin-top:0.5rem;">Показани 50 от ${orders.length} нарушения.</p>`;
        }
        body.innerHTML = html;
    }

    function renderAIStats(data) {
        const body = document.getElementById('aiStatsBody');
        if (!body) return;

        if (!data || !data.overall || data.overall.totalSuggestions === 0) {
            body.innerHTML = '<p style="color:var(--color-text-secondary);padding:1rem;">Няма данни за AI предложения за избрания период.</p>';
            return;
        }

        const o = data.overall;
        const rateColor = o.acceptanceRate >= 70 ? '#22c55e' : o.acceptanceRate >= 40 ? '#eab308' : '#ef4444';

        let html = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:1rem;margin-bottom:1.25rem;">
            <div class="kpi-card" style="padding:0.75rem;">
                <div class="kpi-icon">🤖</div>
                <div class="kpi-value" style="font-size:1.4rem;">${o.totalSuggestions}</div>
                <div class="kpi-label">Общо Предложения</div>
            </div>
            <div class="kpi-card" style="padding:0.75rem;">
                <div class="kpi-icon">✅</div>
                <div class="kpi-value" style="font-size:1.4rem;color:${rateColor};">${o.acceptanceRate}%</div>
                <div class="kpi-label">Процент Приемане</div>
            </div>
            <div class="kpi-card" style="padding:0.75rem;">
                <div class="kpi-icon">👍</div>
                <div class="kpi-value" style="font-size:1.4rem;">${o.accepted}</div>
                <div class="kpi-label">Приети</div>
            </div>
            <div class="kpi-card" style="padding:0.75rem;">
                <div class="kpi-icon">👎</div>
                <div class="kpi-value" style="font-size:1.4rem;">${o.rejected}</div>
                <div class="kpi-label">Отхвърлени</div>
            </div>
            <div class="kpi-card" style="padding:0.75rem;">
                <div class="kpi-icon">📊</div>
                <div class="kpi-value" style="font-size:1.4rem;">${o.avgAcceptedRank ? '#' + parseFloat(o.avgAcceptedRank).toFixed(1) : '—'}</div>
                <div class="kpi-label">Ср. Доверителност (Приети)</div>
            </div>
        </div>`;

        if (data.topAccepted && data.topAccepted.length > 0) {
            html += '<h4 style="font-size:0.85rem;color:var(--color-text-secondary);text-transform:uppercase;letter-spacing:0.05em;margin:0 0 0.5rem;">Топ Приети Доставчици</h4>';
            html += '<div style="display:flex;flex-wrap:wrap;gap:0.5rem;margin-bottom:1rem;">';
            data.topAccepted.forEach(s => {
                html += `<span style="background:rgba(56,189,248,0.1);border:1px solid rgba(56,189,248,0.2);color:#38bdf8;border-radius:8px;padding:3px 10px;font-size:0.82rem;">${esc(s.supplierName)} (${s.acceptedCount}x)</span>`;
            });
            html += '</div>';
        }

        // Monthly trend mini-table
        if (data.byMonth && data.byMonth.length > 0) {
            html += '<table class="analytics-table" style="font-size:0.82rem;"><thead><tr><th>Месец</th><th class="text-right">Предложения</th><th class="text-right">Приети</th><th class="text-right">%</th></tr></thead><tbody>';
            data.byMonth.slice(-6).forEach(m => {
                const rColor = m.rate >= 70 ? '#22c55e' : m.rate >= 40 ? '#eab308' : '#ef4444';
                html += `<tr><td>${esc(m.period)}</td><td class="text-right">${m.total}</td><td class="text-right">${m.accepted}</td><td class="text-right" style="color:${rColor};font-weight:600;">${m.rate}%</td></tr>`;
            });
            html += '</tbody></table>';
        }

        body.innerHTML = html;
    }

    function renderRecurringItems(data) {
        const body = document.getElementById('recurringItemsBody');
        if (!body) return;

        if (!data || data.length === 0) {
            body.innerHTML = '<p style="color:var(--color-text-secondary);padding:1rem;">Няма повтарящи се артикули за избрания период.</p>';
            return;
        }

        let html = '<div style="overflow-x:auto;"><table class="analytics-table"><thead><tr>' +
            '<th>Артикул</th><th>Категория</th><th class="text-right">Поръчки</th>' +
            '<th class="text-right">Ср. Кол.</th><th class="text-right">Ср. Ед. Цена</th>' +
            '<th class="text-right">Общо Разход</th><th class="text-right">Ср. Дни Между</th><th>Препоръка</th>' +
            '</tr></thead><tbody>';

        data.forEach(p => {
            html += '<tr style="cursor:pointer;" onclick="(function(){' +
                'if(typeof openDrillDown===\'function\'){}})()">' +
                '<td class="drill-item-col" title="' + esc(p.itemDescription) + '">' + esc(p.itemDescription) + '</td>' +
                '<td><span style="color:#94a3b8;font-size:0.8rem;">' + esc(p.category) + '</span></td>' +
                '<td class="text-right" style="font-weight:600;color:#38bdf8;">' + p.orderCount + 'x</td>' +
                '<td class="text-right">' + p.avgQty + '</td>' +
                '<td class="text-right">' + (parseFloat(p.avgUnitPrice) > 0 ? fmtMoney(p.avgUnitPrice) : '—') + '</td>' +
                '<td class="text-right" style="color:var(--color-accent);font-weight:600;">' + fmtMoney(p.totalSpend) + '</td>' +
                '<td class="text-right">' + (p.daysBetweenOrders ? p.daysBetweenOrders + ' дни' : '—') + '</td>' +
                '<td>' + (p.suggestBlanketOrder ?
                    '<span style="background:rgba(34,197,94,0.12);color:#22c55e;border-radius:6px;padding:2px 8px;font-size:0.75rem;white-space:nowrap;">📋 Бланкетна Поръчка</span>' :
                    '<span style="background:rgba(56,189,248,0.1);color:#38bdf8;border-radius:6px;padding:2px 8px;font-size:0.75rem;white-space:nowrap;">📦 Булк Поръчка</span>'
                ) + '</td>' +
                '</tr>';
        });

        html += '</tbody></table></div>';
        body.innerHTML = html;
    }

    function renderConcentrationPanel(data) {
        const body = document.getElementById('concentrationBody');
        if (!body) return;

        if (!data || !data.suppliers || data.suppliers.length === 0) {
            body.innerHTML = '<p style="color:var(--color-text-secondary);padding:1rem;">Няма данни за концентрация на доставчиците.</p>';
            return;
        }

        const c = data.concentration;
        const riskColor = data.riskLevel === 'high' ? '#ef4444' : data.riskLevel === 'medium' ? '#eab308' : '#22c55e';
        const riskLabel = data.riskLevel === 'high' ? 'Висок Риск' : data.riskLevel === 'medium' ? 'Среден Риск' : 'Нисък Риск';

        let html = `
        <div style="display:flex;flex-wrap:wrap;gap:1rem;margin-bottom:1.25rem;align-items:center;">
            <div class="kpi-card" style="padding:0.75rem;min-width:120px;">
                <div class="kpi-value" style="font-size:1.2rem;color:${riskColor};">${riskLabel}</div>
                <div class="kpi-label">Ниво на Риск</div>
            </div>
            <div class="kpi-card" style="padding:0.75rem;min-width:110px;">
                <div class="kpi-value" style="font-size:1.2rem;">${c.top1.toFixed(1)}%</div>
                <div class="kpi-label">Топ 1 Дял</div>
            </div>
            <div class="kpi-card" style="padding:0.75rem;min-width:110px;">
                <div class="kpi-value" style="font-size:1.2rem;">${c.top3.toFixed(1)}%</div>
                <div class="kpi-label">Топ 3 Дял</div>
            </div>
            <div class="kpi-card" style="padding:0.75rem;min-width:110px;">
                <div class="kpi-value" style="font-size:1.2rem;">${c.top5.toFixed(1)}%</div>
                <div class="kpi-label">Топ 5 Дял</div>
            </div>
            <div class="kpi-card" style="padding:0.75rem;min-width:110px;">
                <div class="kpi-value" style="font-size:1.2rem;">${data.totalSuppliers}</div>
                <div class="kpi-label">Активни Доставчици</div>
            </div>
            <div class="kpi-card" style="padding:0.75rem;min-width:110px;">
                <div class="kpi-value" style="font-size:1.2rem;">${c.hhiScore}</div>
                <div class="kpi-label">HHI Индекс</div>
            </div>
        </div>`;

        html += '<table class="analytics-table" style="font-size:0.82rem;"><thead><tr>' +
            '<th>#</th><th>Доставчик</th><th class="text-right">Разходи</th><th class="text-right">Дял %</th><th>Концентрация</th>' +
            '</tr></thead><tbody>';

        data.suppliers.slice(0, 15).forEach(s => {
            const barColor = s.rank <= 3 ? '#ef4444' : s.rank <= 5 ? '#fb923c' : '#38bdf8';
            html += '<tr style="cursor:pointer;" onclick="openDrillDown(\'supplier\',null,\'Поръчки — ' + esc(s.supplierName) + '\')">' +
                '<td style="color:#94a3b8;">' + s.rank + '</td>' +
                '<td>' + esc(s.supplierName) + '</td>' +
                '<td class="text-right" style="color:var(--color-accent);font-weight:600;">' + fmtMoney(s.total) + '</td>' +
                '<td class="text-right" style="font-weight:700;">' + s.share + '%</td>' +
                '<td>' +
                    '<div style="background:rgba(148,163,184,0.1);border-radius:4px;height:8px;width:100%;max-width:120px;">' +
                        '<div style="background:' + barColor + ';height:8px;border-radius:4px;width:' + Math.min(s.share, 100) + '%;"></div>' +
                    '</div>' +
                '</td>' +
                '</tr>';
        });

        html += '</tbody></table>';
        body.innerHTML = html;
    }

    async function loadInsightsAndForecast(data) {
        const normalized = {
            bySupplier:          data.supplierSpend  || [],
            topParts:            data.topParts        || [],
            spendOverTime:       data.spendTime       || [],
            supplierPerformance: data.supplierPerf    || [],
            kpis:                data.summary         || {}
        };

        if (window.AnalyticsInsights && document.getElementById('analyticsInsightsPanel')) {
            const insights = await window.AnalyticsInsights.generateInsights(normalized);
            window.AnalyticsInsights.renderInsightsPanel(insights, 'analyticsInsightsPanel');
        }

        if (window.AnalyticsForecasting && normalized.spendOverTime.length >= 3) {
            window.AnalyticsForecasting.renderForecastPanel(normalized.spendOverTime, 'analyticsForecastPanel');
            if (document.getElementById('chartForecast'))
                window.AnalyticsForecasting.renderForecastChart(normalized.spendOverTime, 'chartForecast', chartsRegistry);
        }
    }

    // ── Export Functions ─────────────────────────────────────────

    function exportToXLSX() {
        if (typeof XLSX === 'undefined') { alert('Excel библиотеката не е заредена.'); return; }
        var wb = XLSX.utils.book_new();

        function setColWidths(ws, widths) {
            ws['!cols'] = widths.map(function(w) { return { wch: w }; });
        }

        var summaryData = [
            // ⭐ Branded header rows
            ['PartPulse Orders — Аналитичен Отчет'],
            ['https://partpulse.eu', ''],
            ['Генериран:', new Date().toLocaleString('bg-BG')],
            ['Период:', getPeriodLabel()],
            [],
            ['KPI', 'Стойност'],
            ['Общи Разходи (EUR)', parseFloat(lastData.summary?.totalSpend) || 0],
            ['Общо Поръчки', parseInt(lastData.summary?.totalOrders) || 0],
            ['Средна Стойност (EUR)', parseFloat(lastData.summary?.avgOrderValue) || 0],
            ['Средно Изпълнение (дни)', parseFloat(lastData.summary?.avgLeadTimeDays) || 0],
            ['Доставени (%)', parseFloat(lastData.summary?.deliveryRate) || 0],
            ['Навреме (%)', parseFloat(lastData.summary?.onTimeRate) || 0],
            ['Активни Доставчици', parseInt(lastData.summary?.activeSuppliers) || 0],
            ['В Процес', parseInt(lastData.summary?.ordersInProgress) || 0]
        ];
        var summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
        setColWidths(summarySheet, [36, 28]);
        // ⭐ Style the branding header cells (SheetJS CE supports basic cell styling)
        // Row 1: big title — bold, navy bg, white text
        var titleCell = summarySheet['A1'];
        if (titleCell) {
            titleCell.s = {
                font: { bold: true, sz: 14, color: { rgb: 'FFFFFF' }, name: 'Calibri' },
                fill: { fgColor: { rgb: '1E3A5F' }, patternType: 'solid' },
                alignment: { horizontal: 'left', vertical: 'center' }
            };
        }
        var urlCell = summarySheet['A2'];
        if (urlCell) {
            urlCell.s = {
                font: { italic: true, sz: 9, color: { rgb: '64748B' } },
                fill: { fgColor: { rgb: 'F1F5F9' }, patternType: 'solid' }
            };
        }
        // Row 6 (KPI header): bold navy
        var kpiHeadCell = summarySheet['A6'];
        if (kpiHeadCell) {
            kpiHeadCell.s = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '1E3A5F' }, patternType: 'solid' } };
        }
        var kpiHeadCell2 = summarySheet['B6'];
        if (kpiHeadCell2) {
            kpiHeadCell2.s = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '1E3A5F' }, patternType: 'solid' } };
        }
        // Set row heights: title row tall, rest normal
        summarySheet['!rows'] = [{ hpt: 24 }, { hpt: 14 }, { hpt: 14 }, { hpt: 14 }];
        XLSX.utils.book_append_sheet(wb, summarySheet, 'Обобщение');

        if (lastData.spendTime?.length) {
            var rows = [['Месец', 'Разходи (EUR)', 'Поръчки']];
            lastData.spendTime.forEach(function(r) { rows.push([r.period, parseFloat(r.total)||0, parseInt(r.count)||0]); });
            var ws = XLSX.utils.aoa_to_sheet(rows);
            setColWidths(ws, [14, 20, 14]);
            XLSX.utils.book_append_sheet(wb, ws, 'Разходи Във Времето');
        }

        if (lastData.statusDist?.length) {
            var rows = [['Статус', 'Брой', '% от Общото']];
            lastData.statusDist.forEach(function(r) { rows.push([r.status, parseInt(r.count)||0, parseFloat(r.percent)||0]); });
            var ws = XLSX.utils.aoa_to_sheet(rows);
            setColWidths(ws, [28, 10, 14]);
            XLSX.utils.book_append_sheet(wb, ws, 'Статус Разпределение');
        }

        if (lastData.buildingSpend?.length) {
            var rows = [['Код Сграда', 'Сграда', 'Разходи (EUR)', 'Поръчки', '% от Общото']];
            lastData.buildingSpend.forEach(function(r) { rows.push([r.building, r.buildingName, parseFloat(r.total)||0, parseInt(r.count)||0, parseFloat(r.percent)||0]); });
            var ws = XLSX.utils.aoa_to_sheet(rows);
            setColWidths(ws, [16, 24, 20, 10, 14]);
            XLSX.utils.book_append_sheet(wb, ws, 'Разходи по Сграда');
        }

        if (lastData.supplierSpend?.length) {
            var rows = [['Доставчик', 'Разходи (EUR)', 'Поръчки', 'Средна Стойност (EUR)']];
            lastData.supplierSpend.forEach(function(r) { rows.push([r.supplierName, parseFloat(r.total)||0, parseInt(r.orderCount)||0, parseFloat(r.avgValue)||0]); });
            var ws = XLSX.utils.aoa_to_sheet(rows);
            setColWidths(ws, [36, 20, 10, 20]);
            XLSX.utils.book_append_sheet(wb, ws, 'Топ Доставчици');
        }

        if (lastData.categorySpend?.length) {
            var rows = [['Категория', 'Разходи (EUR)', 'Поръчки', '% от Общото']];
            lastData.categorySpend.forEach(function(r) { rows.push([r.category||'(Без категория)', parseFloat(r.total)||0, parseInt(r.count)||0, parseFloat(r.percent)||0]); });
            var ws = XLSX.utils.aoa_to_sheet(rows);
            setColWidths(ws, [32, 20, 10, 14]);
            XLSX.utils.book_append_sheet(wb, ws, 'Разходи по Категория');
        }

        if (lastData.supplierPerf?.length) {
            var rows = [['Доставчик', 'Поръчки', 'Доставени', 'Навреме (%)', 'Ср. Дни', 'Разходи (EUR)']];
            lastData.supplierPerf.forEach(function(r) { rows.push([r.supplierName, parseInt(r.totalOrders)||0, parseInt(r.delivered)||0, parseFloat(r.onTimeRate)||0, parseFloat(r.avgLeadDays)||0, parseFloat(r.totalSpend)||0]); });
            var ws = XLSX.utils.aoa_to_sheet(rows);
            setColWidths(ws, [36, 14, 12, 18, 16, 20]);
            XLSX.utils.book_append_sheet(wb, ws, 'Ефективност Доставчици');
        }

        if (lastData.topParts?.length) {
            var rows = [['Артикул', 'Брой Поръчки', 'Общо Кол.', 'Разходи (EUR)', 'Ср. Ед. Цена (EUR)']];
            lastData.topParts.forEach(function(r) { rows.push([r.itemDescription, parseInt(r.orderCount)||0, parseInt(r.totalQty)||0, parseFloat(r.totalSpend)||0, parseFloat(r.avgUnitPrice)||0]); });
            var ws = XLSX.utils.aoa_to_sheet(rows);
            setColWidths(ws, [60, 14, 12, 20, 20]);
            XLSX.utils.book_append_sheet(wb, ws, 'Топ Части');
        }

        if (lastData.slaData?.orders?.length) {
            var rows = [['#', 'Артикул', 'Статус', 'Сграда', 'Приоритет', 'Дни в Статус', 'Праг (дни)', 'Заявител']];
            lastData.slaData.orders.forEach(function(r) { rows.push([r.id, r.itemDescription, r.status, r.building, r.priority, r.daysInCurrentStatus, r.threshold, r.requesterName]); });
            var ws = XLSX.utils.aoa_to_sheet(rows);
            setColWidths(ws, [8, 50, 22, 14, 12, 16, 14, 24]);
            XLSX.utils.book_append_sheet(wb, ws, 'SLA Нарушения');
        }

        var filename = 'PartPulse_Анализ_' + getPeriodLabel().replace(/[^а-яА-Яa-zA-Z0-9]/g,'_') + '_' + new Date().toISOString().slice(0,10) + '.xlsx';
        XLSX.writeFile(wb, filename);
    }

    // ── PartPulse logo (Base64 JPEG, 600×207px) ─────────────────────────────
    var PARTPULSE_LOGO_B64 = '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';
    var PARTPULSE_LOGO_W = 55; // mm width in PDF
    var PARTPULSE_LOGO_H = 19; // mm height in PDF (aspect-ratio 600:207)

    // ── Cyrillic font cache (fetched once per session) ─────────────────────────
    var _cyrillicFontB64 = null; // cached Base64 string of NotoSans-Regular.ttf

    async function _loadCyrillicFont() {
        if (_cyrillicFontB64) return _cyrillicFontB64;
        // NotoSans Regular — served by jsDelivr (mirrors Google Fonts), full Cyrillic support
        // jsPDF requires TTF format — WOFF2 is not supported
        var url = 'https://raw.githubusercontent.com/googlefonts/noto-fonts/main/hinted/ttf/NotoSans/NotoSans-Regular.ttf';
        try {
            var resp = await fetch(url);
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            var ab = await resp.arrayBuffer();
            // Convert ArrayBuffer → Base64
            var bytes = new Uint8Array(ab);
            var binary = '';
            var chunkSize = 8192;
            for (var i = 0; i < bytes.length; i += chunkSize) {
                binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
            }
            _cyrillicFontB64 = btoa(binary);
            return _cyrillicFontB64;
        } catch (e) {
            console.warn('Could not load Cyrillic font, falling back to helvetica:', e);
            return null;
        }
    }

    function exportToPDF() {
        if (typeof jspdf === 'undefined' && typeof window.jspdf === 'undefined') {
            alert('PDF библиотеката не е заредена.'); return;
        }
        // Load Cyrillic font async then render
        _loadCyrillicFont().then(function(fontB64) {
            _renderPDF(fontB64);
        });
    }

    function _renderPDF(cyrillicFontB64) {
        var jsPDF = window.jspdf.jsPDF;
        var doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

        // ── Register Cyrillic font ────────────────────────────────────────────
        var cyrFont = 'helvetica';
        if (cyrillicFontB64) {
            try {
                doc.addFileToVFS('NotoSans-Regular.ttf', cyrillicFontB64);
                doc.addFont('NotoSans-Regular.ttf', 'NotoSans', 'normal');
                doc.addFileToVFS('NotoSans-Bold.ttf', cyrillicFontB64);
                doc.addFont('NotoSans-Bold.ttf', 'NotoSans', 'bold');
                cyrFont = 'NotoSans';
            } catch (e) { cyrFont = 'helvetica'; }
        }

        var pageW  = doc.internal.pageSize.width;
        var pageH  = doc.internal.pageSize.height;
        var margin = 13;
        var contentW = pageW - margin * 2;

        // ── Brand palette ─────────────────────────────────────────────────────
        var C = {
            navy:       [30,  58,  95],
            navyDark:   [20,  38,  65],
            orange:     [232, 104, 42],
            white:      [255, 255, 255],
            title:      [30,  58, 138],
            body:       [30,  41,  59],
            muted:      [100, 116, 139],
            rowAlt:     [248, 250, 252],
            border:     [226, 232, 240],
            green:      [21,  128, 61],
            greenBg:    [220, 252, 231],
            amber:      [180, 120,  10],
            amberBg:    [254, 243, 199],
            red:        [185,  28,  28],
            redBg:      [254, 226, 226],
            cardBg:     [240, 245, 255],
            sectionLine:[30,  58,  95]
        };

        // ── Helpers ───────────────────────────────────────────────────────────
        function setFont(f, s, col) {
            if (f === 'bold') doc.setFont(cyrFont, 'bold');
            else doc.setFont(cyrFont, 'normal');
            if (s) doc.setFontSize(s);
            if (col) doc.setTextColor(col[0], col[1], col[2]);
        }

        function fmtEUR(v) {
            v = parseFloat(v) || 0;
            return v.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' EUR';
        }
        function fmtNum(v) { return (parseFloat(v)||0).toLocaleString('de-DE', {minimumFractionDigits:2,maximumFractionDigits:2}); }
        function fmtInt(v) { return (parseInt(v)||0).toLocaleString('de-DE'); }
        function fmtPct(v) { return (parseFloat(v)||0).toFixed(1) + '%'; }

        function ragColor(val, greenAbove, redBelow) {
            if (val >= greenAbove) return { fill: C.greenBg, text: C.green, label: '[GRN]' };
            if (val < redBelow)    return { fill: C.redBg,   text: C.red,   label: '[RED]' };
            return                        { fill: C.amberBg, text: C.amber, label: '[AMB]' };
        }

        function trendArrow(curr, prev) {
            if (!prev || prev === 0) return '';
            var delta = ((curr - prev) / Math.abs(prev)) * 100;
            if (delta > 0.5)  return ' ▲ +' + Math.abs(delta).toFixed(1) + '%';
            if (delta < -0.5) return ' ▼ -' + Math.abs(delta).toFixed(1) + '%';
            return ' ●  =' + Math.abs(delta).toFixed(1) + '%';
        }

        // ── Page header & footer ──────────────────────────────────────────────
        function drawPageHeader(rightLabel) {
            doc.setFillColor(C.navy[0], C.navy[1], C.navy[2]);
            doc.rect(0, 0, pageW, 16, 'F');
            // Accent bar
            doc.setFillColor(C.orange[0], C.orange[1], C.orange[2]);
            doc.rect(0, 16, pageW, 1.5, 'F');
            // Logo
            try {
                doc.addImage('data:image/jpeg;base64,' + PARTPULSE_LOGO_B64, 'JPEG', margin, 1.2, PARTPULSE_LOGO_W * 0.38, PARTPULSE_LOGO_H * 0.38);
            } catch(e) {
                setFont('bold', 9, C.white);
                doc.text('PartPulse', margin, 10);
            }
            // Right label
            setFont('normal', 7.5, C.white);
            doc.text(rightLabel, pageW - margin, 10, { align: 'right' });
        }

        function drawFooter() {
            var total = doc.getNumberOfPages();
            for (var i = 1; i <= total; i++) {
                doc.setPage(i);
                doc.setFillColor(C.rowAlt[0], C.rowAlt[1], C.rowAlt[2]);
                doc.rect(0, pageH - 9, pageW, 9, 'F');
                doc.setDrawColor(C.border[0], C.border[1], C.border[2]);
                doc.setLineWidth(0.2);
                doc.line(0, pageH - 9, pageW, pageH - 9);
                setFont('normal', 6.5, C.muted);
                doc.text('PartPulse Orders — Изпълнителен Аналитичен Отчет  |  Период: ' + getPeriodLabel() + '  |  Генериран: ' + new Date().toLocaleString('bg-BG'), margin, pageH - 3.5);
                doc.text('Страница ' + i + ' от ' + total, pageW - margin, pageH - 3.5, { align: 'right' });
            }
        }

        // ── Section heading ───────────────────────────────────────────────────
        function sectionHeading(text, y, icon) {
            var label = icon ? icon + '  ' + text : text;
            doc.setFillColor(C.navy[0], C.navy[1], C.navy[2]);
            doc.rect(margin, y - 4, contentW, 7, 'F');
            setFont('bold', 9, C.white);
            doc.text(label, margin + 3, y + 0.5);
            return y + 8;
        }

        // ── KPI card (coloured) ───────────────────────────────────────────────
        function kpiCard(x, y, w, h, label, value, subtext, ragFill, ragText) {
            var fill  = ragFill  || C.cardBg;
            var tCol  = ragText  || C.navy;
            doc.setDrawColor(C.border[0], C.border[1], C.border[2]);
            doc.setFillColor(fill[0], fill[1], fill[2]);
            doc.roundedRect(x, y, w, h, 2, 2, 'FD');
            // Left accent stripe
            doc.setFillColor(C.orange[0], C.orange[1], C.orange[2]);
            doc.rect(x, y, 2, h, 'F');
            // Label
            setFont('normal', 6.2, C.muted);
            doc.text(label.toUpperCase(), x + 5, y + 5);
            // Value
            setFont('bold', 10, tCol);
            // Auto-shrink for long values
            var fsize = 10;
            if (String(value).length > 13) fsize = 8.5;
            if (String(value).length > 18) fsize = 7.5;
            doc.setFontSize(fsize);
            doc.text(String(value), x + 5, y + 11.5);
            // Subtext / trend
            if (subtext) {
                setFont('normal', 6, C.muted);
                doc.text(String(subtext), x + 5, y + 16);
            }
        }

        // ── Divider line ──────────────────────────────────────────────────────
        function hLine(y) {
            doc.setDrawColor(C.border[0], C.border[1], C.border[2]);
            doc.setLineWidth(0.2);
            doc.line(margin, y, pageW - margin, y);
        }

        // ── Smart table helper ────────────────────────────────────────────────
        function smartTable(head, rows, startY, opts) {
            if (!rows || rows.length === 0) return startY + 4;
            var didDrawHdr = false;
            doc.autoTable(Object.assign({
                startY: startY,
                head: [head],
                body: rows,
                theme: 'grid',
                styles:            { font: cyrFont, fontSize: 7.5, cellPadding: 2.2, textColor: C.body, lineColor: C.border, lineWidth: 0.15 },
                headStyles:        { font: cyrFont, fillColor: C.navyDark, textColor: C.white, fontStyle: 'bold', fontSize: 7, cellPadding: 2.5 },
                alternateRowStyles:{ fillColor: C.rowAlt },
                margin:            { left: margin, right: margin },
                didDrawPage: function(data) {
                    if (!didDrawHdr) { didDrawHdr = true; return; }
                    drawPageHeader('Отчет');
                }
            }, opts || {}));
            return doc.lastAutoTable.finalY + 6;
        }

        // ── Insight box (callout) ─────────────────────────────────────────────
        function insightBox(text, y, type) {
            // type: 'warn' | 'ok' | 'info'
            var fill = type === 'warn' ? C.redBg : type === 'ok' ? C.greenBg : C.amberBg;
            var tc   = type === 'warn' ? C.red   : type === 'ok' ? C.green   : C.amber;
            var icon = type === 'warn' ? '⚠' : type === 'ok' ? '✓' : '●';
            var lines = doc.splitTextToSize(text, contentW - 10);
            var h = lines.length * 4 + 6;
            doc.setFillColor(fill[0], fill[1], fill[2]);
            doc.setDrawColor(tc[0], tc[1], tc[2]);
            doc.setLineWidth(0.3);
            doc.roundedRect(margin, y, contentW, h, 2, 2, 'FD');
            setFont('normal', 7.5, tc);
            doc.text(lines, margin + 5, y + 5);
            return y + h + 4;
        }

        // ── Two-column highlight row ──────────────────────────────────────────
        function twoColRow(label1, val1, label2, val2, y) {
            var hw = (contentW - 4) / 2;
            kpiCard(margin, y, hw, 19, label1, val1, '', C.cardBg, C.navy);
            kpiCard(margin + hw + 4, y, hw, 19, label2, val2, '', C.cardBg, C.navy);
            return y + 23;
        }

        // ─────────────────────────────────────────────────────────────────────
        // ══════════════════════════════════════════════════════════════════════
        //  PAGE 1 — COVER + EXECUTIVE SUMMARY
        // ══════════════════════════════════════════════════════════════════════
        // ─────────────────────────────────────────────────────────────────────
        drawPageHeader('Изпълнително Резюме');
        var y = 22;

        // ── Large logo ───────────────────────────────────────────────────────
        try {
            doc.addImage('data:image/jpeg;base64,' + PARTPULSE_LOGO_B64, 'JPEG', margin, y, PARTPULSE_LOGO_W, PARTPULSE_LOGO_H);
        } catch(e) {
            setFont('bold', 18, C.title);
            doc.text('PartPulse Orders', margin, y + 12);
        }

        // ── Report title block ───────────────────────────────────────────────
        var titleX = margin + PARTPULSE_LOGO_W + 6;
        var titleW = pageW - titleX - margin;
        setFont('bold', 17, C.title);
        doc.text('Изпълнителен Аналитичен Отчет', titleX, y + 7, { maxWidth: titleW });
        setFont('normal', 8, C.muted);
        doc.text('Период: ' + getPeriodLabel(), titleX, y + 14, { maxWidth: titleW });
        doc.text('Генериран: ' + new Date().toLocaleString('bg-BG'), titleX, y + 18.5, { maxWidth: titleW });
        y += PARTPULSE_LOGO_H + 5;

        // Orange accent separator
        doc.setFillColor(C.orange[0], C.orange[1], C.orange[2]);
        doc.rect(margin, y, contentW, 1, 'F');
        y += 5;

        // ── KPI CARDS (2 rows × 4 cols) ──────────────────────────────────────
        if (lastData.summary) {
            var s = lastData.summary;
            var prev = s.prev || {};
            var cw4 = (contentW - 3 * 4) / 4;
            var cardH = 22;

            // RAG logic
            var dRate    = parseFloat(s.deliveryRate) || 0;
            var otRate   = parseFloat(s.onTimeRate)   || 0;
            var ltDays   = parseFloat(s.avgLeadTimeDays) || 0;

            var dRAG  = ragColor(dRate,  90, 80);  // Mfg standard: GRN≥90% AMB80-89% RED<80%
            var otRAG = ragColor(otRate, 90, 80);  // Mfg standard: GRN≥90% AMB80-89% RED<80%

            // Row 1
            var row1 = [
                { label: 'Общи Разходи', value: fmtEUR(s.totalSpend), sub: prev.totalSpend ? trendArrow(s.totalSpend, prev.totalSpend) : '' },
                { label: 'Общо Поръчки', value: fmtInt(s.totalOrders), sub: prev.totalOrders ? trendArrow(s.totalOrders, prev.totalOrders) : '' },
                { label: 'Средна Стойност', value: fmtEUR(s.avgOrderValue), sub: '' },
                { label: 'В Процес', value: fmtInt(s.ordersInProgress), sub: 'активни поръчки', fill: C.amberBg, text: C.amber }
            ];
            row1.forEach(function(k, i) {
                kpiCard(margin + i * (cw4 + 4), y, cw4, cardH, k.label, k.value, k.sub, k.fill, k.text);
            });
            y += cardH + 4;

            // Row 2 — performance KPIs with RAG
            var ltRAG = ltDays <= 21 ? { fill: C.greenBg, text: C.green, label: '[GRN]' } : ltDays <= 35 ? { fill: C.amberBg, text: C.amber, label: '[AMB]' } : { fill: C.redBg, text: C.red, label: '[RED]' };
            var row2 = [
                { label: 'Ср. Изпълнение', value: ltDays.toFixed(1) + ' дни', sub: ltRAG.label + (ltDays > 35 ? ' Критично >35д' : ltDays > 21 ? ' Внимание 22-35д' : ' Норма ≤21д'), fill: ltRAG.fill, text: ltRAG.text },
                { label: 'Доставени %',    value: fmtPct(dRate),  sub: dRAG.label + (dRate < 80 ? ' Критично <80%' : dRate < 90 ? ' Внимание 80-89%' : ' Норма ≥90%'),   fill: dRAG.fill,  text: dRAG.text  },
                { label: 'Навреме %',      value: fmtPct(otRate), sub: otRAG.label + (otRate < 80 ? ' Критично <80%' : otRate < 90 ? ' Внимание 80-89%' : ' Норма ≥90%'), fill: otRAG.fill, text: otRAG.text },
                { label: 'Активни Доставчици', value: fmtInt(s.activeSuppliers), sub: 'в системата  [GRN]', fill: C.cardBg, text: C.navy }
            ];
            row2.forEach(function(k, i) {
                kpiCard(margin + i * (cw4 + 4), y, cw4, cardH, k.label, k.value, k.sub, k.fill, k.text);
            });
            y += cardH + 6;
        }

        // ── EXECUTIVE INSIGHT CALLOUTS ────────────────────────────────────────
        y = sectionHeading('Ключови Констатации и Препоръки', y, '');

        var insights = [];
        if (lastData.summary) {
            var s = lastData.summary;
            var onT = parseFloat(s.onTimeRate) || 0;
            var dR  = parseFloat(s.deliveryRate) || 0;
            var lt  = parseFloat(s.avgLeadTimeDays) || 0;
            var inP = parseInt(s.ordersInProgress) || 0;

            if (onT < 80) insights.push({ type: 'warn', text: '[RED] КРИТИЧНО — НАВРЕМЕННОСТ ' + fmtPct(onT) + ': По-малко от половината поръчки пристигат навреме (норма ≥90%). Вижте Препоръка #1 на последната страница. Незабавен преглед с топ 5 доставчика по разходи.' });
            if (dR < 90)  insights.push({ type: dR < 80 ? 'warn' : 'info', text: (dR < 80 ? '[RED]' : '[AMB]') + ' ДОСТАВЕНОСТ ' + fmtPct(dR) + ': Норма е ≥90%. ' + inP + ' поръчки са в процес. ' + (dR < 80 ? 'Критично — рискове за производствени спирания.' : 'Необходим мониторинг.') });
            if (lt > 21)  insights.push({ type: lt > 35 ? 'warn' : 'info', text: (lt > 35 ? '[RED]' : '[AMB]') + ' ИЗПЪЛНЕНИЕ ' + lt.toFixed(0) + ' ДНИ: Индустриален стандарт е ≤21 дни за производствено оборудване. ' + (lt > 35 ? 'Критично — оценете алтернативни доставчици за топ артикули.' : 'Внимание — нараства. Приложете рамкови договори за консумативи.') });
        }

        // Supplier concentration risk
        if (lastData.concentrationData) {
            var cd = lastData.concentrationData;
            var hhi = parseFloat(cd.hhi) || 0;
            if (hhi > 2500) insights.push({ type: 'warn', text: 'КОНЦЕНТРАЦИОНЕН РИСК: HHI индексът е ' + Math.round(hhi) + ' (>2500 = висока концентрация). Зависимостта от малко доставчици увеличава риска от прекъсване на доставките.' });
            else if (hhi > 1500) insights.push({ type: 'info', text: 'Умерена концентрация при доставчиците (HHI=' + Math.round(hhi) + '). Препоръчва се диверсификация при критичните артикули.' });
        }

        // SLA breach
        if (lastData.slaData && lastData.slaData.summary) {
            var breach = parseInt(lastData.slaData.summary.totalBreached) || 0;
            if (breach > 0) insights.push({ type: 'warn', text: 'SLA НАРУШЕНИЯ: ' + breach + ' поръчки са с просрочено изпълнение спрямо SLA праговете. Изискват незабавно внимание.' });
        }

        // AI stats
        if (lastData.aiStats) {
            var ai = lastData.aiStats;
            var accRate = parseFloat(ai.acceptanceRate) || 0;
            if (accRate > 60) insights.push({ type: 'ok', text: 'AI АСИСТЕНТ: ' + fmtPct(accRate) + ' от предложените доставчици са приети — висока ефективност на AI препоръките. Продължете да използвате системата активно.' });
            else if (accRate > 0) insights.push({ type: 'info', text: 'AI препоръките за доставчици са приети в ' + fmtPct(accRate) + ' от случаите. Обмислете обучение на потребителите за по-добро използване.' });
        }

        if (insights.length === 0) {
            insights.push({ type: 'ok', text: 'Системата функционира нормално. Продължете да следите ключовите показатели в реално време.' });
        }

        insights.forEach(function(ins) {
            if (y > pageH - 30) { doc.addPage(); drawPageHeader('Констатации'); y = 22; }
            y = insightBox(ins.text, y, ins.type);
        });

        y += 2;

        // ── KPI PERFORMANCE SCORECARD GRID ─────────────────────────────────────
        if (lastData.summary) {
            var sg = lastData.summary;
            var ot3 = parseFloat(sg.onTimeRate)||0;
            var dR3 = parseFloat(sg.deliveryRate)||0;
            var lt3 = parseFloat(sg.avgLeadTimeDays)||0;
            var breachCnt = (lastData.slaData && lastData.slaData.summary) ? (parseInt(lastData.slaData.summary.totalBreached)||0) : 0;

            if (y > pageH - 60) { doc.addPage(); drawPageHeader('KPI Scorecard'); y = 22; }
            y = sectionHeading('KPI Scorecard — Цел vs. Текущо vs. Статус', y, '');

            var scoreRows = [
                ['Навреме %',           '≥90%',          fmtPct(ot3),              ot3 < 90 ? '▼' : '▲', ot3 >= 90 ? '[GRN]' : ot3 >= 80 ? '[AMB]' : '[RED]'],
                ['Доставени %',         '≥90%',          fmtPct(dR3),              dR3 < 90 ? '▼' : '▲', dR3 >= 90 ? '[GRN]' : dR3 >= 80 ? '[AMB]' : '[RED]'],
                ['Ср. Изпълнение',      '≤21 дни',       lt3.toFixed(1) + ' дни',  lt3 > 21 ? '▼' : '▲', lt3 <= 21 ? '[GRN]' : lt3 <= 35 ? '[AMB]' : '[RED]'],
                ['SLA Нарушения',       '0',             String(breachCnt),         breachCnt > 0 ? '▼' : '→', breachCnt === 0 ? '[GRN]' : breachCnt <= 3 ? '[AMB]' : '[RED]'],
                ['Активни Доставчици',  '80–110',        fmtInt(sg.activeSuppliers), '→', '[GRN]'],
                ['Ср. Стойност Поръчка','—',             fmtEUR(sg.avgOrderValue),   '→', '[GRN]']
            ];

            y = smartTable(
                ['KPI', 'Цел', 'Текущо', 'Тренд', 'Статус'],
                scoreRows, y,
                {
                    columnStyles: {
                        0: { cellWidth: 55 },
                        1: { cellWidth: 28, halign: 'center' },
                        2: { cellWidth: 36, halign: 'right' },
                        3: { cellWidth: 18, halign: 'center' },
                        4: { cellWidth: 28, halign: 'center' }
                    },
                    didParseCell: function(data) {
                        if (data.section === 'body' && data.column.index === 3) {
                            if (String(data.cell.text) === '▼') data.cell.styles.textColor = C.red;
                            else if (String(data.cell.text) === '▲') data.cell.styles.textColor = C.green;
                        }
                        if (data.section === 'body' && data.column.index === 4) {
                            var v = String(data.cell.text);
                            if (v === '[RED]') { data.cell.styles.textColor = C.red;   data.cell.styles.fontStyle = 'bold'; }
                            else if (v === '[AMB]') { data.cell.styles.textColor = C.amber; data.cell.styles.fontStyle = 'bold'; }
                            else if (v === '[GRN]') { data.cell.styles.textColor = C.green; data.cell.styles.fontStyle = 'bold'; }
                        }
                        if (data.section === 'body') {
                            var status = scoreRows[data.row.index] ? scoreRows[data.row.index][4] : '';
                            if (status === '[RED]') data.cell.styles.fillColor = [255, 245, 245];
                        }
                    }
                }
            );
        }

        // ── SPEND OVER TIME TABLE (compact) ──────────────────────────────────
        if (lastData.spendTime && lastData.spendTime.length) {
            if (y > pageH - 60) { doc.addPage(); drawPageHeader('Разходи Във Времето'); y = 22; }
            y = sectionHeading('Разходи Във Времето (Месечен Преглед)', y, '');

            // Compute totals for % share
            var totalSpendAllPeriods = lastData.spendTime.reduce(function(acc, r) { return acc + (parseFloat(r.total)||0); }, 0);

            // Find peak month
            var peakMonth = lastData.spendTime.reduce(function(best, r) {
                return (parseFloat(r.total)||0) > (parseFloat(best.total)||0) ? r : best;
            }, lastData.spendTime[0]);

            // Build rows with MoM comparison
            var stRows = lastData.spendTime.map(function(r, i) {
                var curr = parseFloat(r.total) || 0;
                var prev = i > 0 ? (parseFloat(lastData.spendTime[i-1].total)||0) : 0;
                var mom = i > 0 && prev > 0 ? ((curr - prev)/prev*100).toFixed(1) + '%' : '-';
                var momSign = i > 0 && prev > 0 ? (curr > prev ? '▲ +' : '▼ ') : '';
                var pct = totalSpendAllPeriods > 0 ? (curr/totalSpendAllPeriods*100).toFixed(1)+'%' : '-';
                return [
                    r.period,
                    fmtNum(curr),
                    String(r.count || 0),
                    pct,
                    momSign + (i > 0 && prev > 0 ? Math.abs((curr-prev)/prev*100).toFixed(1)+'%' : '-')
                ];
            });

            y = smartTable(
                ['Период', 'Разходи (EUR)', 'Поръчки', '% от Общо', 'МоМ'],
                stRows, y,
                {
                    columnStyles: {
                        0: { cellWidth: 28 },
                        1: { cellWidth: 38, halign: 'right' },
                        2: { cellWidth: 22, halign: 'right' },
                        3: { cellWidth: 24, halign: 'right' },
                        4: { cellWidth: 28, halign: 'right' }
                    },
                    didParseCell: function(data) {
                        if (data.section === 'body' && data.column.index === 4) {
                            var v = String(data.cell.text);
                            if (v.indexOf('▲') !== -1) data.cell.styles.textColor = C.green;
                            else if (v.indexOf('▼') !== -1) data.cell.styles.textColor = C.red;
                        }
                        // Highlight peak month row
                        if (data.section === 'body' && data.row.index !== undefined && lastData.spendTime[data.row.index] && lastData.spendTime[data.row.index].period === peakMonth.period) {
                            data.cell.styles.fontStyle = 'bold';
                            data.cell.styles.fillColor = C.amberBg;
                            data.cell.styles.textColor = C.amber;
                        }
                    }
                }
            );
        }

        // ─────────────────────────────────────────────────────────────────────
        // ══════════════════════════════════════════════════════════════════════
        //  PAGE 2 — РАЗХОДИ ПО СГРАДА И ДОСТАВЧИЦИ
        // ══════════════════════════════════════════════════════════════════════
        // ─────────────────────────────────────────────────────────────────────
        doc.addPage();
        drawPageHeader('Разходи по Работилница и Доставчици');
        y = 22;

        // ── Building spend with visual bar ───────────────────────────────────
        if (lastData.buildingSpend && lastData.buildingSpend.length) {
            y = sectionHeading('Разходи по Работилница', y, '');

            var bRows = lastData.buildingSpend.map(function(r) {
                var pct = parseFloat(r.percent) || 0;
                // Simple text bar (▓ repeats)
                var barLen = Math.round(pct / 5); // max 20 chars at 100%
                var bar = '';
                for (var b = 0; b < Math.min(barLen, 20); b++) bar += '█';
                return [
                    r.building || '-',
                    r.buildingName || '-',
                    fmtNum(parseFloat(r.total)||0),
                    String(r.count || 0),
                    fmtPct(pct),
                    bar
                ];
            });

            y = smartTable(
                ['Код', 'Работилница', 'Разходи (EUR)', 'Поръчки', '%', 'Визуализация'],
                bRows, y,
                {
                    columnStyles: {
                        0: { cellWidth: 15 },
                        1: { cellWidth: 45 },
                        2: { cellWidth: 36, halign: 'right' },
                        3: { cellWidth: 20, halign: 'right' },
                        4: { cellWidth: 18, halign: 'right' },
                        5: { cellWidth: 40, textColor: C.orange }
                    },
                    didParseCell: function(data) {
                        if (data.section === 'body' && data.column.index === 5) {
                            data.cell.styles.textColor = C.orange;
                            data.cell.styles.fontSize = 5;
                        }
                    }
                }
            );
        }

        // ── Category spend ───────────────────────────────────────────────────
        if (lastData.categorySpend && lastData.categorySpend.length) {
            if (y > pageH - 50) { doc.addPage(); drawPageHeader('Категории'); y = 22; }
            y = sectionHeading('Разходи по Категория', y, '');
            var catRows = lastData.categorySpend.slice(0, 12).map(function(r) {
                return [
                    String(r.category || '(Без категория)').substring(0, 40),
                    fmtNum(parseFloat(r.total)||0),
                    String(r.count || 0),
                    fmtPct(parseFloat(r.percent)||0)
                ];
            });
            y = smartTable(
                ['Категория', 'Разходи (EUR)', 'Поръчки', '% от Общо'],
                catRows, y,
                {
                    columnStyles: {
                        0: { cellWidth: 75 },
                        1: { cellWidth: 40, halign: 'right' },
                        2: { cellWidth: 22, halign: 'right' },
                        3: { cellWidth: 25, halign: 'right' }
                    }
                }
            );
        }

        // ── Top suppliers by spend ────────────────────────────────────────────
        if (lastData.supplierSpend && lastData.supplierSpend.length) {
            if (y > pageH - 55) { doc.addPage(); drawPageHeader('Топ Доставчици'); y = 22; }
            y = sectionHeading('Топ 10 Доставчици по Разходи', y, '');

            var totalSup = lastData.supplierSpend.reduce(function(a, r) { return a + (parseFloat(r.total)||0); }, 0);
            var supRows = lastData.supplierSpend.map(function(r, i) {
                var pct = totalSup > 0 ? ((parseFloat(r.total)||0) / totalSup * 100).toFixed(1) + '%' : '-';
                return [
                    String(i + 1),
                    String(r.supplierName || '-').substring(0, 32),
                    fmtNum(parseFloat(r.total)||0),
                    String(r.orderCount || 0),
                    fmtNum(parseFloat(r.avgValue)||0),
                    pct
                ];
            });

            y = smartTable(
                ['#', 'Доставчик', 'Разходи (EUR)', 'Поръчки', 'Ср. Стойност (EUR)', '% Дял'],
                supRows, y,
                {
                    columnStyles: {
                        0: { cellWidth: 10, halign: 'center' },
                        1: { cellWidth: 55 },
                        2: { cellWidth: 35, halign: 'right' },
                        3: { cellWidth: 20, halign: 'right' },
                        4: { cellWidth: 30, halign: 'right' },
                        5: { cellWidth: 18, halign: 'right' }
                    },
                    didParseCell: function(data) {
                        // Highlight top 3 suppliers
                        if (data.section === 'body' && data.row.index < 3) {
                            data.cell.styles.fontStyle = 'bold';
                        }
                    }
                }
            );
        }

        // ─────────────────────────────────────────────────────────────────────
        // ══════════════════════════════════════════════════════════════════════
        //  PAGE 3 — ЕФЕКТИВНОСТ НА ДОСТАВЧИЦИТЕ (SCORECARD)
        // ══════════════════════════════════════════════════════════════════════
        // ─────────────────────────────────────────────────────────────────────
        doc.addPage();
        drawPageHeader('Ефективност на Доставчиците');
        y = 22;

        y = sectionHeading('Scorecard на Доставчиците', y, '');

        // Explanation legend
        setFont('normal', 6.5, C.muted);
        doc.text('RAG статус: ✓ Зелено (навреме >60%) | ● Жълто (45–60%) | ⚠ Червено (<45%)', margin, y);
        y += 5;

        if (lastData.supplierPerf && lastData.supplierPerf.length) {
            // Weighted score: Delivery% 40% + OnTime% 40% + Lead penalty 20%
            // Lead score: ≤14d=100, ≤21d=85, ≤30d=70, ≤45d=50, >45d=30
            function supplierScore(r) {
                var del = parseFloat(r.delivered||0) / Math.max(parseInt(r.totalOrders||1),1) * 100;
                var ot  = parseFloat(r.onTimeRate)||0;
                var ld  = parseFloat(r.avgLeadDays)||0;
                var leadScore = ld <= 14 ? 100 : ld <= 21 ? 85 : ld <= 30 ? 70 : ld <= 45 ? 50 : 30;
                return Math.round(del * 0.4 + ot * 0.4 + leadScore * 0.2);
            }
            var sortedPerf = lastData.supplierPerf.slice().sort(function(a,b){ return supplierScore(b) - supplierScore(a); });

            var perfRows = sortedPerf.map(function(r, idx) {
                var ot = parseFloat(r.onTimeRate) || 0;
                var leadDays = parseFloat(r.avgLeadDays) || 0;
                var score = supplierScore(r);
                var ragSymbol = ot >= 90 ? '✓' : ot >= 80 ? '●' : '⚠';
                var ragLabel  = ot >= 90 ? '[GRN]' : ot >= 80 ? '[AMB]' : '[RED]';
                var tier = score >= 80 ? 'A' : score >= 65 ? 'B' : score >= 50 ? 'C' : 'D';
                return [
                    ragSymbol + ' ' + ragLabel,
                    String(r.supplierName || '-').substring(0, 26),
                    String(r.totalOrders || 0),
                    String(r.delivered || 0),
                    fmtPct(ot),
                    leadDays.toFixed(0) + 'д',
                    String(score) + '/100',
                    tier
                ];
            });

            y = smartTable(
                ['Статус', 'Доставчик', 'Поръчки', 'Дост.', 'Навреме %', 'Ср.Дни', 'Резултат', 'Ниво'],
                perfRows, y,
                {
                    columnStyles: {
                        0: { cellWidth: 22, halign: 'center', fontSize: 6.5 },
                        1: { cellWidth: 44 },
                        2: { cellWidth: 18, halign: 'right' },
                        3: { cellWidth: 14, halign: 'right' },
                        4: { cellWidth: 22, halign: 'right' },
                        5: { cellWidth: 16, halign: 'right' },
                        6: { cellWidth: 22, halign: 'right' },
                        7: { cellWidth: 12, halign: 'center' }
                    },
                    didParseCell: function(data) {
                        if (data.section === 'body' && data.column.index === 0) {
                            var v = String(data.cell.text);
                            if (v.indexOf('[GRN]') !== -1) { data.cell.styles.textColor = C.green; data.cell.styles.fontStyle = 'bold'; }
                            else if (v.indexOf('[AMB]') !== -1) { data.cell.styles.textColor = C.amber; }
                            else if (v.indexOf('[RED]') !== -1) { data.cell.styles.textColor = C.red; data.cell.styles.fontStyle = 'bold'; }
                        }
                        if (data.section === 'body' && data.column.index === 4) {
                            var onT2 = parseFloat(data.cell.text) || 0;
                            if (onT2 < 80)       data.cell.styles.textColor = C.red;
                            else if (onT2 < 90)  data.cell.styles.textColor = C.amber;
                            else                 data.cell.styles.textColor = C.green;
                        }
                        if (data.section === 'body' && data.column.index === 7) {
                            var tier2 = String(data.cell.text);
                            if (tier2 === 'A') { data.cell.styles.textColor = C.green; data.cell.styles.fontStyle = 'bold'; }
                            else if (tier2 === 'B') { data.cell.styles.textColor = C.navy; }
                            else if (tier2 === 'C') { data.cell.styles.textColor = C.amber; }
                            else if (tier2 === 'D') { data.cell.styles.textColor = C.red; data.cell.styles.fontStyle = 'bold'; }
                        }
                    }
                }
            );

            // Legend
            setFont('normal', 6.5, C.muted);
            doc.text('Ниво: A ≥80/100 (Предпочитан) | B 65–79 (Приемлив) | C 50–64 (Внимание) | D <50 (Критичен)', margin, y - 3);
            doc.text('Резултат = Доставеност×40% + Навреме×40% + Изпълнение×20% | Наредени по резултат', margin, y);
            y += 4;
        }

        // ── SLA Breach section ────────────────────────────────────────────────
        if (lastData.slaData && lastData.slaData.orders && lastData.slaData.orders.length > 0) {
            if (y > pageH - 55) { doc.addPage(); drawPageHeader('SLA Нарушения'); y = 22; }
            y = sectionHeading('SLA Нарушения — Поръчки Изискващи Внимание', y, '');

            var breach = lastData.slaData.summary || {};
            var breachCount = parseInt(breach.totalBreached) || lastData.slaData.orders.length;
            y = insightBox('⚠  Открити са ' + breachCount + ' поръчки с нарушен SLA праг. Действие: Ескалирайте немедленно към отговорниците по доставки.', y, 'warn');

            var slaRows = lastData.slaData.orders.slice(0, 15).map(function(r) {
                return [
                    String(r.id || '-'),
                    String(r.itemDescription || '-').substring(0, 35),
                    String(r.status || '-'),
                    String(r.building || '-'),
                    String(r.priority || '-'),
                    String(r.daysInCurrentStatus || 0) + '/' + String(r.threshold || '-') + ' дни',
                    String(r.requesterName || '-').substring(0, 20)
                ];
            });

            y = smartTable(
                ['#', 'Артикул', 'Статус', 'Цех', 'Приоритет', 'Дни/Праг', 'Заявител'],
                slaRows, y,
                {
                    columnStyles: {
                        0: { cellWidth: 12, halign: 'center' },
                        1: { cellWidth: 52 },
                        2: { cellWidth: 28 },
                        3: { cellWidth: 15, halign: 'center' },
                        4: { cellWidth: 20, halign: 'center' },
                        5: { cellWidth: 22, halign: 'center' },
                        6: { cellWidth: 28 }
                    },
                    didParseCell: function(data) {
                        if (data.section === 'body' && data.column.index === 4) {
                            if (String(data.cell.text).toLowerCase().indexOf('висок') !== -1 ||
                                String(data.cell.text).toLowerCase() === 'high' ||
                                String(data.cell.text).toLowerCase() === 'critical') {
                                data.cell.styles.textColor = C.red;
                                data.cell.styles.fontStyle = 'bold';
                            }
                        }
                    }
                }
            );
        }

        // ── Status distribution ───────────────────────────────────────────────
        if (lastData.statusDist && lastData.statusDist.length) {
            if (y > pageH - 55) { doc.addPage(); drawPageHeader('Статус на Поръчките'); y = 22; }
            y = sectionHeading('Разпределение по Статус на Поръчките', y, '');
            var sdRows = lastData.statusDist.map(function(r) {
                return [
                    String(r.status || '-'),
                    String(r.count || 0),
                    fmtPct(parseFloat(r.percent)||0)
                ];
            });
            y = smartTable(
                ['Статус', 'Брой', '% от Общо'],
                sdRows, y,
                {
                    columnStyles: {
                        0: { cellWidth: 90 },
                        1: { cellWidth: 40, halign: 'right' },
                        2: { cellWidth: 40, halign: 'right' }
                    }
                }
            );
        }

        // ─────────────────────────────────────────────────────────────────────
        // ══════════════════════════════════════════════════════════════════════
        //  PAGE 4 — ТОП ЧАСТИ, AI И КОНЦЕНТРАЦИЯ
        // ══════════════════════════════════════════════════════════════════════
        // ─────────────────────────────────────────────────────────────────────
        doc.addPage();
        drawPageHeader('Топ Части, AI Асистент и Рискове');
        y = 22;

        // ── Top parts (filter out test data) ─────────────────────────────────
        if (lastData.topParts && lastData.topParts.length) {
            y = sectionHeading('Топ Поръчвани Артикули', y, '');

            var filteredParts = lastData.topParts.filter(function(r) {
                var desc = String(r.itemDescription || '').toLowerCase();
                return desc.indexOf('тестване') === -1 && desc.indexOf('test') === -1 && desc.indexOf('sms') === -1;
            });

            var partsRows = filteredParts.slice(0, 16).map(function(r, i) {
                var spend = parseFloat(r.totalSpend) || 0;
                var avgUp = parseFloat(r.avgUnitPrice) || 0;
                return [
                    String(i + 1),
                    String(r.itemDescription || '-').substring(0, 55),
                    String(r.orderCount || 0),
                    String(r.totalQty || 0),
                    spend > 0 ? fmtNum(spend) : '—',
                    avgUp > 0 ? fmtNum(avgUp) : '—'
                ];
            });

            y = smartTable(
                ['#', 'Артикул', 'Поръчки', 'Кол.', 'Разходи (EUR)', 'Ед. Цена (EUR)'],
                partsRows, y,
                {
                    columnStyles: {
                        0: { cellWidth: 10, halign: 'center' },
                        1: { cellWidth: 75 },
                        2: { cellWidth: 18, halign: 'right' },
                        3: { cellWidth: 15, halign: 'right' },
                        4: { cellWidth: 30, halign: 'right' },
                        5: { cellWidth: 28, halign: 'right' }
                    },
                    didParseCell: function(data) {
                        if (data.section === 'body' && data.row.index < 3) {
                            data.cell.styles.fontStyle = 'bold';
                        }
                    }
                }
            );
        }

        // ── Recurring items ───────────────────────────────────────────────────
        if (lastData.recurringItems && lastData.recurringItems.length) {
            if (y > pageH - 50) { doc.addPage(); drawPageHeader('Повторяеми Артикули'); y = 22; }
            y = sectionHeading('Повторяеми Артикули (Консумативи)', y, '');
            setFont('normal', 6.5, C.muted);
            doc.text('Артикули поръчвани многократно — кандидати за рамкови договори и автоматизация.', margin, y);
            y += 5;

            var recRows = lastData.recurringItems.slice(0, 12).map(function(r) {
                return [
                    String(r.itemDescription || '-').substring(0, 55),
                    String(r.orderCount || 0),
                    fmtNum(parseFloat(r.avgUnitPrice)||0),
                    fmtNum(parseFloat(r.totalSpend)||0)
                ];
            });
            y = smartTable(
                ['Артикул', 'Поръчки', 'Ср. Ед. Цена', 'Общо (EUR)'],
                recRows, y,
                {
                    columnStyles: {
                        0: { cellWidth: 90 },
                        1: { cellWidth: 22, halign: 'right' },
                        2: { cellWidth: 30, halign: 'right' },
                        3: { cellWidth: 30, halign: 'right' }
                    }
                }
            );
        }

        // ── AI Acceptance Rate ────────────────────────────────────────────────
        if (lastData.aiStats) {
            if (y > pageH - 55) { doc.addPage(); drawPageHeader('AI Асистент'); y = 22; }
            y = sectionHeading('AI Асистент — Статистика за Препоръки', y, '');
            var ai = lastData.aiStats;
            var accRate = parseFloat(ai.acceptanceRate) || 0;
            var aiRAG = ragColor(accRate, 60, 30);
            var cw3 = (contentW - 2 * 4) / 3;

            kpiCard(margin,                y, cw3, 22, 'AI Препоръки Общо', fmtInt(ai.totalSuggestions || ai.totalWithSuggestion || 0), '', C.cardBg, C.navy);
            kpiCard(margin + cw3 + 4,     y, cw3, 22, 'Приети Препоръки',  fmtInt(ai.totalAccepted || 0), '', C.greenBg, C.green);
            kpiCard(margin + 2*(cw3 + 4), y, cw3, 22, 'Процент Приемане',  fmtPct(accRate), accRate > 60 ? '✓ Висока ефективност' : '● Умерена ефективност', aiRAG.fill, aiRAG.text);
            y += 26;

            if (ai.avgAcceptedRank != null) {
                setFont('normal', 7.5, C.body);
                doc.text('Средна позиция на приетата препоръка: ' + (parseFloat(ai.avgAcceptedRank)||0).toFixed(1) + ' (от 1 = най-добра)', margin, y);
                y += 6;
            }

            y = insightBox(
                accRate > 60
                    ? '✓  AI асистентът работи ефективно. Купувачите следват препоръките в ' + fmtPct(accRate) + ' от случаите — това намалява времето за избор на доставчик и подобрява качеството на решенията.'
                    : '●  Само ' + fmtPct(accRate) + ' от AI препоръките са приети. Препоръчва се обучение на потребителите и преглед на алгоритъма за предложения.',
                y, accRate > 60 ? 'ok' : 'info'
            );
        }

        // ── Supplier concentration risk ───────────────────────────────────────
        if (lastData.concentrationData) {
            if (y > pageH - 55) { doc.addPage(); drawPageHeader('Концентрационен Риск'); y = 22; }
            y = sectionHeading('Концентрационен Риск при Доставчиците (HHI)', y, '');
            var cd = lastData.concentrationData;
            var hhi = parseFloat(cd.hhi) || 0;
            var cw2 = (contentW - 4) / 2;
            var hhiRAG = hhi > 2500 ? { fill: C.redBg, text: C.red } : hhi > 1500 ? { fill: C.amberBg, text: C.amber } : { fill: C.greenBg, text: C.green };
            var hhiLabel = hhi > 2500 ? 'Висока концентрация' : hhi > 1500 ? 'Умерена концентрация' : 'Ниска концентрация';

            kpiCard(margin,          y, cw2, 22, 'HHI Индекс',           Math.round(hhi).toLocaleString('de-DE'), hhiLabel, hhiRAG.fill, hhiRAG.text);
            kpiCard(margin + cw2 + 4,y, cw2, 22, 'Доставчици Анализирани', fmtInt(cd.supplierCount || 0), '', C.cardBg, C.navy);
            y += 26;

            // CR4 = top 4 suppliers % of total spend
            var cr4Text = '';
            if (cd.suppliers && cd.suppliers.length >= 4) {
                var cr4 = cd.suppliers.slice(0, 4).reduce(function(acc, r) { return acc + (parseFloat(r.share)||0); }, 0);
                cr4Text = '  |  CR4 = ' + cr4.toFixed(1) + '% (Топ 4 доставчика)' + (cr4 > 60 ? ' [RED] Висока концентрация' : cr4 > 40 ? ' [AMB]' : ' [GRN]');
            } else if (lastData.supplierSpend && lastData.supplierSpend.length >= 4) {
                var totalAll = lastData.supplierSpend.reduce(function(a,r){return a+(parseFloat(r.total)||0);},0);
                if (totalAll > 0) {
                    var cr4v = lastData.supplierSpend.slice(0,4).reduce(function(a,r){return a+(parseFloat(r.total)||0);},0) / totalAll * 100;
                    cr4Text = '  |  CR4 = ' + cr4v.toFixed(1) + '% (Топ 4)' + (cr4v > 60 ? ' [RED]' : cr4v > 40 ? ' [AMB]' : ' [GRN]');
                }
            }
            var hhiLabel2 = hhi > 2500 ? '[RED] ВИСОК РИСК' : hhi > 1500 ? '[AMB] УМЕРЕН РИСК' : '[GRN] НИЗ КОП РИСК';
            var hhiMsg = (hhi > 2500 ? '⚠' : hhi > 1500 ? '●' : '✓') + '  HHI=' + Math.round(hhi).toLocaleString('de-DE') + ' — ' + hhiLabel2 + cr4Text + '. ' + (hhi > 2500 ? 'Портфолиото е силно концентрирано — операционен риск при проблеми с доставките. Препоръчва се диверсификация за артикули с висок разход. Вижте Препоръка на последната страница.' : hhi > 1500 ? 'Умерена концентрация. Подгответе резервни доставчици за критичните артикули.' : 'Добра диверсификация. Продължете да поддържате балансирано портфолио.');
            y = insightBox(hhiMsg, y, hhi > 2500 ? 'warn' : hhi > 1500 ? 'info' : 'ok');

            // Top concentration table if available
            if (cd.suppliers && cd.suppliers.length) {
                var concRows = cd.suppliers.slice(0, 10).map(function(r, i) {
                    return [
                        String(i + 1),
                        String(r.supplierName || '-').substring(0, 40),
                        fmtNum(parseFloat(r.spend)||0),
                        fmtPct(parseFloat(r.share)||0)
                    ];
                });
                y = smartTable(
                    ['#', 'Доставчик', 'Разходи (EUR)', '% Дял'],
                    concRows, y,
                    {
                        columnStyles: {
                            0: { cellWidth: 12, halign: 'center' },
                            1: { cellWidth: 80 },
                            2: { cellWidth: 40, halign: 'right' },
                            3: { cellWidth: 30, halign: 'right' }
                        }
                    }
                );
            }
        }

        // ─────────────────────────────────────────────────────────────────────
        // ══════════════════════════════════════════════════════════════════════
        //  FINAL PAGE — ACTIONABLE RECOMMENDATIONS SUMMARY
        // ══════════════════════════════════════════════════════════════════════
        // ─────────────────────────────────────────────────────────────────────
        doc.addPage();
        drawPageHeader('Препоръки и Следващи Стъпки');
        y = 22;

        // Cover block
        doc.setFillColor(C.navyDark[0], C.navyDark[1], C.navyDark[2]);
        doc.rect(margin, y, contentW, 24, 'F');
        setFont('bold', 14, C.white);
        doc.text('Препоръки за Ръководството', margin + 5, y + 9);
        setFont('normal', 8, [200, 215, 235]);
        doc.text('Конкретни действия за подобряване на операционната ефективност', margin + 5, y + 17);
        setFont('normal', 7, C.muted);
        doc.text('Изготвен от PartPulse Orders System  |  ' + new Date().toLocaleString('bg-BG'), margin + 5, y + 22.5);
        y += 30;

        // Build recommendations dynamically from data
        var recs = [];
        if (lastData.summary) {
            var s2 = lastData.summary;
            var ot2  = parseFloat(s2.onTimeRate) || 0;
            var dR2  = parseFloat(s2.deliveryRate) || 0;
            var lt2  = parseFloat(s2.avgLeadTimeDays) || 0;

            if (ot2 < 80) recs.push({ priority: '1', type: 'warn', rtg: 'Свикайте преговори с топ 5 доставчика в рамките на 14 дни. Въведете SLA с финансови санкции. Цел: Навреме ≥70% до 90 дни.', title: 'СПЕШНО: Навременност ' + fmtPct(ot2) + ' — Под Критичния Праг от 80%',
                text: 'Навременността ' + fmtPct(ot2) + ' е критично ниска. Действие: Свикайте среща с топ 5 доставчика по разходи и преговаряйте SLA с конкретни санкции. Цел: >70% в рамките на 90 дни.' });
            if (dR2 < 90) recs.push({ priority: '2', type: dR2 < 80 ? 'warn' : 'info', rtg: 'Назначете отговорник за ескалация на поръчки над 14 дни. Ежеседмичен преглед на ' + (parseInt(s2.ordersInProgress)||0) + ' активни поръчки.', title: (dR2 < 80 ? 'КРИТИЧНО: ' : 'ВНИМАНИЕ: ') + 'Доставеност ' + fmtPct(dR2) + ' — Цел е ≥90%',
                text: 'Процентът доставени е ' + fmtPct(dR2) + '. Проверете ' + (parseInt(s2.ordersInProgress)||0) + ' активни поръчки за блокирани. Определете отговорник за ескалация при забавяне >14 дни.' });
            if (lt2 > 21) recs.push({ priority: '3', type: lt2 > 35 ? 'warn' : 'info', rtg: 'Идентифицирайте алтернативни местни доставчици за топ 10 артикула. Въведете рамкови договори за повтарящи се консумативи. Цел: ≤21 дни средно изпълнение.', title: (lt2 > 35 ? '[RED] ' : '[AMB] ') + 'Изпълнение ' + lt2.toFixed(0) + ' Дни — Цел е ≤21 Дни',
                text: 'Средното изпълнение ' + lt2.toFixed(1) + ' дни надвишава индустриалния стандарт. Оценете локални алтернативни доставчици за топ артикули и въведете рамкови договори за консумативи.' });
        }

        // Recurring items recommendation
        if (lastData.recurringItems && lastData.recurringItems.length > 3) {
            recs.push({ priority: String(recs.length + 1), type: 'info', title: 'Рамкови Договори за Консумативи',
                text: 'Открити са ' + lastData.recurringItems.length + ' повтарящи се артикула. Препоръчва се сключване на рамкови договори с фиксирани цени, което може да намали разходите с 5–15% и да ускори изпълнението.' });
        }

        // AI recommendation
        if (lastData.aiStats) {
            var accR = parseFloat(lastData.aiStats.acceptanceRate) || 0;
            if (accR < 50) recs.push({ priority: String(recs.length + 1), type: 'info', title: 'Активизиране на AI Асистента',
                text: 'AI препоръките са приети само в ' + fmtPct(accR) + ' от случаите. Организирайте обучение на екипа и насърчете използването на системните предложения за доставчици.' });
        }

        // Generic best practice
        recs.push({ priority: String(recs.length + 1), type: 'ok', title: 'Месечен Преглед на KPI',
            text: 'Въведете месечен управленски преглед на PartPulse данните: разходи vs бюджет, SLA изпълнение, топ доставчици. Системата поддържа филтриране по период за лесно сравнение.' });

        recs.forEach(function(r) {
            if (y > pageH - 42) { doc.addPage(); drawPageHeader('Препоръки'); y = 22; }
            // Number badge
            var badgeColor = r.type === 'warn' ? C.red : r.type === 'ok' ? C.green : C.navy;
            doc.setFillColor(badgeColor[0], badgeColor[1], badgeColor[2]);
            doc.circle(margin + 5, y + 5, 4, 'F');
            setFont('bold', 8, C.white);
            doc.text(String(r.priority), margin + 5, y + 6.5, { align: 'center' });

            // RAG label + Title
            var ragBadge = r.type === 'warn' ? '[RED] ' : r.type === 'ok' ? '[GRN] ' : '[AMB] ';
            setFont('bold', 9, r.type === 'warn' ? C.red : r.type === 'ok' ? C.green : C.title);
            doc.text(ragBadge + r.title, margin + 13, y + 4);

            // Body text
            var lines2 = doc.splitTextToSize(r.text, contentW - 16);
            setFont('normal', 7.5, C.body);
            doc.text(lines2, margin + 13, y + 9.5);

            // Road-to-Green line (only for warn/info)
            var roadY = y + 9.5 + lines2.length * 3.8 + 2;
            if (r.type !== 'ok' && r.rtg) {
                setFont('normal', 6.5, C.muted);
                var rtgLines = doc.splitTextToSize('→ Път към Зелено: ' + r.rtg, contentW - 16);
                doc.text(rtgLines, margin + 13, roadY);
                roadY += rtgLines.length * 3.5 + 1;
            }

            y = roadY + 6;
            hLine(y - 3);
        });

        // ── Signature block ───────────────────────────────────────────────────
        if (y > pageH - 40) { doc.addPage(); drawPageHeader('Подпис'); y = 22; }
        y += 4;
        doc.setFillColor(C.rowAlt[0], C.rowAlt[1], C.rowAlt[2]);
        doc.setDrawColor(C.border[0], C.border[1], C.border[2]);
        doc.setLineWidth(0.2);
        doc.roundedRect(margin, y, contentW, 28, 2, 2, 'FD');
        setFont('bold', 8, C.navy);
        doc.text('Отчетът е генериран автоматично от PartPulse Orders', margin + 5, y + 7);
        setFont('normal', 7, C.muted);
        doc.text('Всички данни са в реално време от производствената база данни.', margin + 5, y + 12);
        doc.text('За въпроси: orders.partpulse-app.com  |  Поверително — само за вътрешна употреба.', margin + 5, y + 17);
        setFont('bold', 7, C.orange);
        doc.text('PartPulse Orders © ' + new Date().getFullYear() + '  |  Всички права запазени', margin + 5, y + 23);

        // ── Draw footers ──────────────────────────────────────────────────────
        drawFooter();

        var filename = 'PartPulse_Izpalnitelen_Otchet_' + getPeriodLabel().replace(/[^а-яА-Яa-zA-Z0-9]/g,'_') + '_' + new Date().toISOString().slice(0,10) + '.pdf';
        doc.save(filename);
    }

    function init() {
        if (!initialized) {
            renderSkeleton();
            initialized = true;
        }
        loadData();
    }

    function refresh() {
        _apiCache = {};
        // Invalidate AnalyticsCache module too
        if (window.AnalyticsCache) window.AnalyticsCache.invalidateAll();
        renderSkeleton();
        initialized = true;
        loadData();
    }

    // Export module
    window.AnalyticsModule = { init: init, refresh: refresh, clearCache: function() { _apiCache = {}; } };

})();
