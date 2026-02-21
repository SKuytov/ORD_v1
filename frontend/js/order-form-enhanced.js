// Enhanced Order Form - File Preview UX Only
// This script ONLY handles file preview UI, not form submission
// Form submission is handled by app.js

class EnhancedOrderForm {
    constructor() {
        this.selectedFiles = [];
        this.init();
    }

    init() {
        this.setupFileInput();
    }

    setupFileInput() {
        const fileInput = document.getElementById('attachments');
        if (!fileInput) return;

        // Create file preview container if it doesn't exist
        let previewContainer = document.getElementById('file-preview-container');
        if (!previewContainer) {
            previewContainer = document.createElement('div');
            previewContainer.id = 'file-preview-container';
            previewContainer.className = 'file-preview-container';
            fileInput.parentElement.appendChild(previewContainer);
        }

        // Ensure multiple file selection is enabled
        fileInput.setAttribute('multiple', 'multiple');

        // Handle file selection
        fileInput.addEventListener('change', (e) => this.handleFileSelection(e));
    }

    handleFileSelection(event) {
        const files = Array.from(event.target.files);
        this.selectedFiles = files;
        this.renderFilePreview();
    }

    renderFilePreview() {
        const container = document.getElementById('file-preview-container');
        if (!container || this.selectedFiles.length === 0) {
            if (container) container.innerHTML = '';
            return;
        }

        let html = '<div class="file-preview-header">Selected Files (' + this.selectedFiles.length + ')</div>';
        html += '<div class="file-preview-list">';

        this.selectedFiles.forEach((file, index) => {
            const fileSize = this.formatFileSize(file.size);
            const fileIcon = this.getFileIcon(file.name);
            
            html += `
                <div class="file-preview-item" data-index="${index}">
                    <span class="file-icon">${fileIcon}</span>
                    <div class="file-info">
                        <div class="file-name">${this.escapeHtml(file.name)}</div>
                        <div class="file-size">${fileSize}</div>
                    </div>
                    <button type="button" class="file-remove-btn" data-index="${index}" aria-label="Remove file">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M4 4l8 8m0-8l-8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                        </svg>
                    </button>
                </div>
            `;
        });

        html += '</div>';
        container.innerHTML = html;

        // Add remove button listeners
        container.querySelectorAll('.file-remove-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.currentTarget.getAttribute('data-index'));
                this.removeFile(index);
            });
        });
    }

    removeFile(index) {
        this.selectedFiles.splice(index, 1);
        
        // Update the file input
        const fileInput = document.getElementById('attachments');
        const dataTransfer = new DataTransfer();
        this.selectedFiles.forEach(file => dataTransfer.items.add(file));
        fileInput.files = dataTransfer.files;
        
        this.renderFilePreview();
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }

    getFileIcon(filename) {
        const ext = filename.split('.').pop().toLowerCase();
        const iconMap = {
            'pdf': '📄',
            'doc': '📝', 'docx': '📝',
            'xls': '📊', 'xlsx': '📊',
            'jpg': '🖼️', 'jpeg': '🖼️', 'png': '🖼️', 'gif': '🖼️', 'svg': '🖼️',
            'zip': '📦', 'rar': '📦', '7z': '📦',
            'txt': '📃',
            'csv': '📊'
        };
        return iconMap[ext] || '📎';
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new EnhancedOrderForm();
    });
} else {
    new EnhancedOrderForm();
}
