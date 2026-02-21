// Enhanced Order Form - File Preview UX Only
// This script ONLY adds visual file preview - does NOT touch form submission

(function() {
    'use strict';
    
    let selectedFiles = [];
    
    function init() {
        // Wait for DOM to be fully loaded
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', setupFilePreview);
        } else {
            setupFilePreview();
        }
    }
    
    function setupFilePreview() {
        const fileInput = document.getElementById('attachments');
        if (!fileInput) {
            console.warn('File input #attachments not found');
            return;
        }
        
        // Ensure multiple attribute is set
        fileInput.setAttribute('multiple', 'multiple');
        
        // Listen for file selection changes
        fileInput.addEventListener('change', handleFileSelection, false);
        
        console.log('File preview enhancement loaded');
    }
    
    function handleFileSelection(event) {
        const files = Array.from(event.target.files || []);
        selectedFiles = files;
        renderFilePreview();
    }
    
    function renderFilePreview() {
        let container = document.getElementById('file-preview-container');
        
        // Create container if it doesn't exist
        if (!container) {
            const fileInput = document.getElementById('attachments');
            if (!fileInput || !fileInput.parentElement) return;
            
            container = document.createElement('div');
            container.id = 'file-preview-container';
            container.className = 'file-preview-container';
            fileInput.parentElement.appendChild(container);
        }
        
        // Clear if no files
        if (selectedFiles.length === 0) {
            container.innerHTML = '';
            return;
        }
        
        // Build preview HTML
        let html = '<div class="file-preview-header">Selected Files (' + selectedFiles.length + ')</div>';
        html += '<div class="file-preview-list">';
        
        selectedFiles.forEach(function(file, index) {
            const fileSize = formatFileSize(file.size);
            const fileIcon = getFileIcon(file.name);
            
            html += '<div class="file-preview-item" data-index="' + index + '">';
            html += '<span class="file-icon">' + fileIcon + '</span>';
            html += '<div class="file-info">';
            html += '<div class="file-name">' + escapeHtml(file.name) + '</div>';
            html += '<div class="file-size">' + fileSize + '</div>';
            html += '</div>';
            html += '<button type="button" class="file-remove-btn" data-index="' + index + '" aria-label="Remove file">';
            html += '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">';
            html += '<path d="M4 4l8 8m0-8l-8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>';
            html += '</svg>';
            html += '</button>';
            html += '</div>';
        });
        
        html += '</div>';
        container.innerHTML = html;
        
        // Attach remove button listeners
        const removeButtons = container.querySelectorAll('.file-remove-btn');
        removeButtons.forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.preventDefault(); // Prevent any form submission
                const index = parseInt(btn.getAttribute('data-index'), 10);
                removeFile(index);
            });
        });
    }
    
    function removeFile(index) {
        selectedFiles.splice(index, 1);
        
        // Update the actual file input
        const fileInput = document.getElementById('attachments');
        if (!fileInput) return;
        
        try {
            const dataTransfer = new DataTransfer();
            selectedFiles.forEach(function(file) {
                dataTransfer.items.add(file);
            });
            fileInput.files = dataTransfer.files;
        } catch (e) {
            console.warn('Could not update file input:', e);
        }
        
        renderFilePreview();
    }
    
    function formatFileSize(bytes) {
        if (!bytes || bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }
    
    function getFileIcon(filename) {
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
    
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    // Initialize
    init();
})();
