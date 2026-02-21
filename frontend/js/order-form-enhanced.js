// Enhanced Order Form with File Upload UX Improvements
// Features: Multi-file preview, upload progress bar, better user feedback

class EnhancedOrderForm {
    constructor() {
        this.selectedFiles = [];
        this.init();
    }

    init() {
        this.setupFileInput();
        this.setupFormSubmit();
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

        // Create progress bar container if it doesn't exist
        let progressContainer = document.getElementById('upload-progress-container');
        if (!progressContainer) {
            progressContainer = document.createElement('div');
            progressContainer.id = 'upload-progress-container';
            progressContainer.className = 'upload-progress-container';
            progressContainer.style.display = 'none';
            progressContainer.innerHTML = `
                <div class="progress-label">Uploading files...</div>
                <div class="progress-bar-bg">
                    <div class="progress-bar-fill" id="upload-progress-bar"></div>
                </div>
                <div class="progress-text" id="upload-progress-text">0%</div>
            `;
            fileInput.parentElement.appendChild(progressContainer);
        }

        // Allow multiple file selection
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
            container.innerHTML = '';
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
            'jpg': '🖼️', 'jpeg': '🖼️', 'png': '🖼️', 'gif': '🖼️',
            'zip': '📦', 'rar': '📦',
            'txt': '📃'
        };
        return iconMap[ext] || '📎';
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    setupFormSubmit() {
        const form = document.getElementById('create-order-form');
        if (!form) return;

        form.addEventListener('submit', (e) => this.handleFormSubmit(e));
    }

    async handleFormSubmit(event) {
        event.preventDefault();
        
        const form = event.target;
        const formData = new FormData(form);
        
        // Show progress container
        const progressContainer = document.getElementById('upload-progress-container');
        const submitButton = form.querySelector('button[type="submit"]');
        
        if (progressContainer) {
            progressContainer.style.display = 'block';
        }
        
        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = 'Uploading...';
        }

        try {
            await this.uploadWithProgress(formData);
        } catch (error) {
            console.error('Upload failed:', error);
            alert('Upload failed: ' + error.message);
            
            if (submitButton) {
                submitButton.disabled = false;
                submitButton.textContent = 'Submit Order';
            }
            
            if (progressContainer) {
                progressContainer.style.display = 'none';
            }
        }
    }

    uploadWithProgress(formData) {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            
            // Progress event listener
            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                    const percentComplete = Math.round((e.loaded / e.total) * 100);
                    this.updateProgress(percentComplete);
                }
            });
            
            // Load event listener (upload complete)
            xhr.upload.addEventListener('load', () => {
                this.updateProgress(100);
            });
            
            // Error event listener
            xhr.upload.addEventListener('error', () => {
                reject(new Error('Upload failed'));
            });
            
            // Response handler
            xhr.onreadystatechange = () => {
                if (xhr.readyState === 4) {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        setTimeout(() => {
                            resolve(xhr.response);
                            // Redirect or show success message
                            window.location.href = '/orders'; // Adjust as needed
                        }, 500);
                    } else {
                        reject(new Error('Server returned ' + xhr.status));
                    }
                }
            };
            
            // Configure and send request
            xhr.open('POST', form.action || '/api/orders', true);
            xhr.send(formData);
        });
    }

    updateProgress(percent) {
        const progressBar = document.getElementById('upload-progress-bar');
        const progressText = document.getElementById('upload-progress-text');
        
        if (progressBar) {
            progressBar.style.width = percent + '%';
        }
        
        if (progressText) {
            progressText.textContent = percent + '%';
        }
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
