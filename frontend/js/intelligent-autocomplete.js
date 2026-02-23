// frontend/js/intelligent-autocomplete.js
// Smart autocomplete component for Item Description and Category fields
// Learns from historical orders, supports EN/BG, debounced search

class IntelligentAutocomplete {
    constructor(inputElement, options = {}) {
        this.input = inputElement;
        this.options = {
            endpoint: options.endpoint || '/api/autocomplete/item-descriptions',
            minChars: options.minChars || 2,
            debounceMs: options.debounceMs || 300,
            maxResults: options.maxResults || 10,
            placeholder: options.placeholder || 'Start typing...',
            showUsageCount: options.showUsageCount !== false,
            onSelect: options.onSelect || null,
            customParams: options.customParams || {}
        };

        this.debounceTimer = null;
        this.suggestionsDiv = null;
        this.selectedIndex = -1;
        this.suggestions = [];

        this.init();
    }

    init() {
        // Create suggestions container
        this.suggestionsDiv = document.createElement('div');
        this.suggestionsDiv.className = 'autocomplete-suggestions';
        this.suggestionsDiv.style.display = 'none';
        
        // Insert after input
        this.input.parentNode.style.position = 'relative';
        this.input.parentNode.insertBefore(this.suggestionsDiv, this.input.nextSibling);

        // Set placeholder
        if (this.options.placeholder) {
            this.input.setAttribute('placeholder', this.options.placeholder);
        }

        // Add autocomplete attribute
        this.input.setAttribute('autocomplete', 'off');

        // Bind events
        this.input.addEventListener('input', this.handleInput.bind(this));
        this.input.addEventListener('keydown', this.handleKeyDown.bind(this));
        this.input.addEventListener('blur', this.handleBlur.bind(this));
        this.input.addEventListener('focus', this.handleFocus.bind(this));

        // Click outside to close
        document.addEventListener('click', (e) => {
            if (!this.input.contains(e.target) && !this.suggestionsDiv.contains(e.target)) {
                this.hideSuggestions();
            }
        });
    }

    handleInput(e) {
        const value = e.target.value;

        // Clear previous timer
        clearTimeout(this.debounceTimer);

        // Hide suggestions if input is too short
        if (value.length < this.options.minChars) {
            this.hideSuggestions();
            return;
        }

        // Debounce the search
        this.debounceTimer = setTimeout(() => {
            this.fetchSuggestions(value);
        }, this.options.debounceMs);
    }

    handleKeyDown(e) {
        if (!this.suggestionsDiv || this.suggestionsDiv.style.display === 'none') {
            return;
        }

        const items = this.suggestionsDiv.querySelectorAll('.autocomplete-item');

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                this.selectedIndex = Math.min(this.selectedIndex + 1, items.length - 1);
                this.updateSelection(items);
                break;

            case 'ArrowUp':
                e.preventDefault();
                this.selectedIndex = Math.max(this.selectedIndex - 1, -1);
                this.updateSelection(items);
                break;

            case 'Enter':
                e.preventDefault();
                if (this.selectedIndex >= 0 && items[this.selectedIndex]) {
                    this.selectSuggestion(this.suggestions[this.selectedIndex]);
                }
                break;

            case 'Escape':
                this.hideSuggestions();
                break;
        }
    }

    handleBlur() {
        // Delay to allow click on suggestion
        setTimeout(() => {
            this.hideSuggestions();
        }, 200);
    }

    handleFocus() {
        // Show suggestions if we have them and input has content
        if (this.input.value.length >= this.options.minChars && this.suggestions.length > 0) {
            this.showSuggestions();
        }
    }

    async fetchSuggestions(query) {
        try {
            // Check if user is logged in
            const token = localStorage.getItem('token');
            if (!token) {
                console.warn('Autocomplete: No auth token found. User may not be logged in.');
                return;
            }

            const params = new URLSearchParams({
                q: query,
                limit: this.options.maxResults,
                ...this.options.customParams
            });

            const response = await fetch(`${this.options.endpoint}?${params}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`Autocomplete API error (${response.status}):`, errorText);
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            this.suggestions = data.suggestions || [];

            if (this.suggestions.length > 0) {
                this.renderSuggestions();
                this.showSuggestions();
            } else {
                this.hideSuggestions();
            }

        } catch (error) {
            console.error('Autocomplete error:', error.message || error);
            // Silently fail - don't disrupt user experience
            this.hideSuggestions();
        }
    }

    renderSuggestions() {
        this.suggestionsDiv.innerHTML = '';
        this.selectedIndex = -1;

        this.suggestions.forEach((suggestion, index) => {
            const item = document.createElement('div');
            item.className = 'autocomplete-item';
            item.dataset.index = index;

            // Main text
            const textSpan = document.createElement('span');
            textSpan.className = 'autocomplete-text';
            textSpan.textContent = suggestion.text;
            item.appendChild(textSpan);

            // Usage count badge (optional)
            if (this.options.showUsageCount && suggestion.usage_count) {
                const badge = document.createElement('span');
                badge.className = 'autocomplete-badge';
                badge.textContent = `${suggestion.usage_count}×`;
                badge.title = `Used ${suggestion.usage_count} times`;
                item.appendChild(badge);
            }

            // Click handler
            item.addEventListener('click', () => {
                this.selectSuggestion(suggestion);
            });

            // Hover handler
            item.addEventListener('mouseenter', () => {
                this.selectedIndex = index;
                this.updateSelection(this.suggestionsDiv.querySelectorAll('.autocomplete-item'));
            });

            this.suggestionsDiv.appendChild(item);
        });
    }

    updateSelection(items) {
        items.forEach((item, index) => {
            if (index === this.selectedIndex) {
                item.classList.add('selected');
                // Scroll into view if needed
                item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            } else {
                item.classList.remove('selected');
            }
        });
    }

    selectSuggestion(suggestion) {
        this.input.value = suggestion.text;
        this.hideSuggestions();

        // Trigger input event so other listeners know the value changed
        this.input.dispatchEvent(new Event('input', { bubbles: true }));
        this.input.dispatchEvent(new Event('change', { bubbles: true }));

        // Call custom callback if provided
        if (this.options.onSelect) {
            this.options.onSelect(suggestion);
        }

        // Focus on next field (optional UX enhancement)
        this.focusNextField();
    }

    focusNextField() {
        const form = this.input.closest('form');
        if (!form) return;

        const formElements = Array.from(form.elements);
        const currentIndex = formElements.indexOf(this.input);
        
        // Find next focusable element
        for (let i = currentIndex + 1; i < formElements.length; i++) {
            const element = formElements[i];
            if (element.type !== 'hidden' && !element.disabled && element.tabIndex >= 0) {
                setTimeout(() => element.focus(), 100);
                break;
            }
        }
    }

    showSuggestions() {
        this.suggestionsDiv.style.display = 'block';
    }

    hideSuggestions() {
        this.suggestionsDiv.style.display = 'none';
        this.selectedIndex = -1;
    }

    destroy() {
        // Clean up event listeners and DOM elements
        clearTimeout(this.debounceTimer);
        this.input.removeEventListener('input', this.handleInput);
        this.input.removeEventListener('keydown', this.handleKeyDown);
        this.input.removeEventListener('blur', this.handleBlur);
        this.input.removeEventListener('focus', this.handleFocus);
        
        if (this.suggestionsDiv && this.suggestionsDiv.parentNode) {
            this.suggestionsDiv.parentNode.removeChild(this.suggestionsDiv);
        }
    }
}

// Initialize autocomplete on form fields
function initializeOrderFormAutocomplete() {
    console.log('🔍 Initializing intelligent autocomplete...');
    
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeOrderFormAutocomplete);
        return;
    }

    // Check if user is logged in (has token)
    if (!localStorage.getItem('token')) {
        console.log('🔒 Autocomplete: Waiting for user login...');
        return;
    }

    // Item Description autocomplete
    const itemDescriptionInput = document.getElementById('itemDescription');
    if (itemDescriptionInput && !itemDescriptionInput.dataset.autocompleteInitialized) {
        itemDescriptionInput.dataset.autocompleteInitialized = 'true';
        
        window.itemDescriptionAutocomplete = new IntelligentAutocomplete(itemDescriptionInput, {
            endpoint: '/api/autocomplete/smart-suggestions',
            minChars: 2,
            debounceMs: 300,
            maxResults: 8,
            placeholder: 'Start typing... (e.g., Лагер, Bearing, Motor)',
            showUsageCount: true,
            onSelect: (suggestion) => {
                console.log('✅ Selected item:', suggestion.text);
            }
        });
        console.log('✅ Item Description autocomplete initialized');
    }

    // Category autocomplete
    const categoryInput = document.getElementById('category');
    if (categoryInput && !categoryInput.dataset.autocompleteInitialized) {
        categoryInput.dataset.autocompleteInitialized = 'true';
        
        window.categoryAutocomplete = new IntelligentAutocomplete(categoryInput, {
            endpoint: '/api/autocomplete/categories',
            minChars: 1,
            debounceMs: 250,
            maxResults: 10,
            placeholder: 'e.g., Bearings, Motors, Лагери, Мотори',
            showUsageCount: true,
            onSelect: (suggestion) => {
                console.log('✅ Selected category:', suggestion.text);
            }
        });
        console.log('✅ Category autocomplete initialized');
    }

    // Part Number autocomplete (context-aware)
    const partNumberInput = document.getElementById('partNumber');
    if (partNumberInput && !partNumberInput.dataset.autocompleteInitialized) {
        partNumberInput.dataset.autocompleteInitialized = 'true';
        
        window.partNumberAutocomplete = new IntelligentAutocomplete(partNumberInput, {
            endpoint: '/api/autocomplete/part-numbers',
            minChars: 1,
            debounceMs: 300,
            maxResults: 10,
            placeholder: 'e.g., 6205, SKF-123',
            showUsageCount: true,
            customParams: {},
            onSelect: (suggestion) => {
                console.log('✅ Selected part number:', suggestion.part_number);
                // Optionally populate description from historical data
                if (suggestion.description && !itemDescriptionInput.value) {
                    itemDescriptionInput.value = suggestion.description;
                }
                if (suggestion.category && !categoryInput.value) {
                    categoryInput.value = suggestion.category;
                }
            }
        });

        // Update part number context when description/category changes
        const updatePartNumberContext = () => {
            if (window.partNumberAutocomplete) {
                window.partNumberAutocomplete.options.customParams = {
                    category: categoryInput.value,
                    description: itemDescriptionInput.value.substring(0, 50)
                };
            }
        };

        itemDescriptionInput.addEventListener('change', updatePartNumberContext);
        categoryInput.addEventListener('change', updatePartNumberContext);
        console.log('✅ Part Number autocomplete initialized');
    }
}

// Don't auto-initialize - wait for user to login first
// Instead, initialize after successful login
console.log('📚 Intelligent Autocomplete module loaded');

// Listen for login success event
if (window.app) {
    // Hook into existing login success handler
    const originalHandleLogin = window.app.handleLogin;
    if (originalHandleLogin) {
        window.app.handleLogin = async function(e) {
            const result = await originalHandleLogin.call(this, e);
            // Initialize autocomplete after successful login
            setTimeout(initializeOrderFormAutocomplete, 500);
            return result;
        };
    }
}

// Also re-initialize when switching tabs (for SPA behavior)
if (window.app && window.app.switchTab) {
    const originalSwitchTab = window.app.switchTab;
    window.app.switchTab = function(tabId) {
        originalSwitchTab.call(this, tabId);
        setTimeout(initializeOrderFormAutocomplete, 100);
    };
}

// Manual initialization function (can be called from console for debugging)
window.initAutocomplete = initializeOrderFormAutocomplete;
