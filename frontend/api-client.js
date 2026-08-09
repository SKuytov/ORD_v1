/**
 * Small, dependency-free API client for PartPulse classic scripts.
 *
 * @example
 * const orders = await Api.get('/orders', { params: { status: 'Pending' } });
 * await Api.post('/orders', { item_description: 'Bearing', quantity: 2 });
 * await Api.download('/documents/42/download');
 */
(function attachApiClient(window) {
    'use strict';

    const DEFAULT_TIMEOUT_MS = 30_000;
    const DEFAULT_BASE_URL = '/api';
    const RETRY_DELAY_MS = 400;
    let baseUrl = DEFAULT_BASE_URL;
    let redirectingToLogin = false;
    let redirectedToken = null;

    /**
     * Error returned by Api methods. `status` is 0 when no HTTP response was
     * received (for example, a timeout or network interruption).
     */
    class ApiError extends Error {
        constructor(message, options = {}) {
            super(message || 'Request failed');
            this.name = 'ApiError';
            this.status = Number(options.status || 0);
            this.code = options.code || null;
            this.data = options.data || null;
            this.cause = options.cause;
        }
    }

    function getToken() {
        const cookieMatch = document.cookie.match(/(?:^|;\s*)pp_token=([^;]*)/);
        if (cookieMatch) {
            try {
                return decodeURIComponent(cookieMatch[1]);
            } catch (_) {
                return cookieMatch[1];
            }
        }
        try {
            const token = sessionStorage.getItem('authToken');
            if (token) return token;
        } catch (_) {}
        try {
            return localStorage.getItem('authToken');
        } catch (_) {
            return null;
        }
    }

    function clearSession() {
        try { localStorage.removeItem('authToken'); } catch (_) {}
        try { sessionStorage.removeItem('authToken'); } catch (_) {}
        document.cookie = 'pp_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Strict';
    }

    function notify(message, type) {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
            return;
        }

        const toast = document.createElement('div');
        toast.className = `pp-toast pp-toast-${type || 'error'} show`;
        toast.setAttribute('role', 'status');
        toast.setAttribute('aria-live', 'polite');
        toast.textContent = message;
        document.body.appendChild(toast);
        window.setTimeout(() => toast.remove(), 5000);
    }

    function handleUnauthorized(failedToken) {
        // Ignore duplicate 401s from concurrent requests using the same
        // expired credential, but never block a later login with a new token.
        if (redirectingToLogin && failedToken === redirectedToken) return;
        if (failedToken && getToken() && getToken() !== failedToken) return;
        redirectingToLogin = true;
        redirectedToken = failedToken || null;
        clearSession();
        notify('Your session has expired. Please sign in again.', 'warning');

        // The current application has an in-page login screen. Calling it avoids
        // a full-page redirect and, because the token has already been removed,
        // cannot trigger an authentication redirect loop.
        if (typeof window.showLogin === 'function') {
            window.showLogin();
            return;
        }

        // This fallback supports future pages that have a dedicated login route.
        const loginUrl = new URL(window.location.href);
        loginUrl.hash = 'login';
        window.location.replace(loginUrl.toString());
    }

    function buildUrl(path, params) {
        const isAbsolute = /^https?:\/\//i.test(path);
        const url = isAbsolute
            ? new URL(path)
            : new URL(`${baseUrl.replace(/\/$/, '')}/${String(path).replace(/^\//, '')}`, window.location.origin);

        Object.entries(params || {}).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== '') {
                url.searchParams.set(key, value);
            }
        });
        return url;
    }

    function isJsonBody(body) {
        return body !== undefined
            && body !== null
            && typeof body === 'object'
            && !(body instanceof FormData)
            && !(body instanceof Blob)
            && !(body instanceof ArrayBuffer)
            && !(body instanceof URLSearchParams);
    }

    function makeHeaders(headers, body) {
        const requestHeaders = new Headers({ Accept: 'application/json' });
        const token = getToken();
        if (token) requestHeaders.set('Authorization', `Bearer ${token}`);
        if (isJsonBody(body)) requestHeaders.set('Content-Type', 'application/json');

        Object.entries(headers || {}).forEach(([key, value]) => {
            if (value !== undefined && value !== null) requestHeaders.set(key, value);
        });
        return requestHeaders;
    }

    async function fetchWithTimeout(url, options) {
        const controller = new AbortController();
        const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        let timedOut = false;
        const abortFromCaller = () => controller.abort();
        const timeout = window.setTimeout(() => {
            timedOut = true;
            controller.abort();
        }, timeoutMs);

        if (options.signal) {
            if (options.signal.aborted) controller.abort();
            else options.signal.addEventListener('abort', abortFromCaller, { once: true });
        }

        try {
            return await window.fetch(url, { ...options, signal: controller.signal });
        } catch (error) {
            if (timedOut) {
                throw new ApiError('The request timed out. Please try again.', {
                    code: 'TIMEOUT',
                    cause: error
                });
            }
            if (options.signal && options.signal.aborted) {
                throw new ApiError('The request was cancelled.', {
                    code: 'ABORTED',
                    cause: error
                });
            }
            throw new ApiError('Network error. Check your connection and try again.', {
                code: 'NETWORK_ERROR',
                cause: error
            });
        } finally {
            window.clearTimeout(timeout);
            if (options.signal) options.signal.removeEventListener('abort', abortFromCaller);
        }
    }

    async function readErrorPayload(response) {
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            try { return await response.json(); } catch (_) { return null; }
        }
        try { return await response.text(); } catch (_) { return null; }
    }

    function errorFromResponse(response, payload) {
        const message = payload && typeof payload === 'object' && payload.message
            ? payload.message
            : `Request failed (HTTP ${response.status}).`;
        return new ApiError(message, {
            status: response.status,
            data: payload,
            code: payload && typeof payload === 'object' ? payload.code : null
        });
    }

    function canRetry(error) {
        return error instanceof ApiError
            && (error.code === 'NETWORK_ERROR' || error.code === 'TIMEOUT' || error.status >= 500);
    }

    function delay(milliseconds) {
        return new Promise(resolve => window.setTimeout(resolve, milliseconds));
    }

    async function execute(path, options = {}) {
        const method = String(options.method || 'GET').toUpperCase();
        const url = buildUrl(path, options.params);
        const body = isJsonBody(options.body) ? JSON.stringify(options.body) : options.body;
        const requestOptions = {
            method,
            headers: makeHeaders(options.headers, options.body),
            body,
            signal: options.signal,
            timeoutMs: options.timeoutMs
        };

        try {
            const response = await fetchWithTimeout(url, requestOptions);
            if (!response.ok) {
                const error = errorFromResponse(response, await readErrorPayload(response));
                if (error.status === 401) {
                    const authorization = requestOptions.headers.get('Authorization') || '';
                    handleUnauthorized(authorization.replace(/^Bearer\s+/i, ''));
                }
                if (error.status === 403) notify('You do not have permission to perform this action.', 'error');
                if (error.status === 409) notify(error.message, 'error');
                throw error;
            }
            return response;
        } catch (error) {
            throw error instanceof ApiError
                ? error
                : new ApiError('Request failed. Please try again.', { cause: error });
        }
    }

    /**
     * Send an API request and return its JSON envelope. A `{ success: false }`
     * response throws ApiError even when the server used HTTP 200.
     *
     * GET requests retry once after a short backoff only for network, timeout,
     * and 5xx failures. Mutating requests are never retried automatically.
     */
    async function request(path, options = {}) {
        const method = String(options.method || 'GET').toUpperCase();
        const attempts = method === 'GET' ? 2 : 1;
        let lastError;

        for (let attempt = 0; attempt < attempts; attempt += 1) {
            try {
                const response = await execute(path, options);
                const contentType = response.headers.get('content-type') || '';
                if (!contentType.includes('application/json')) {
                    throw new ApiError(`Expected a JSON response (HTTP ${response.status}).`, {
                        status: response.status,
                        code: 'NON_JSON_RESPONSE'
                    });
                }

                let data;
                try {
                    data = await response.json();
                } catch (error) {
                    throw new ApiError('The server returned invalid JSON.', {
                        status: response.status,
                        code: 'INVALID_JSON',
                        cause: error
                    });
                }

                if (data && data.success === false) {
                    throw new ApiError(data.message || 'The request could not be completed.', {
                        status: response.status,
                        data,
                        code: data.code || 'API_ERROR'
                    });
                }

                // A successful API response proves the current session is valid.
                redirectingToLogin = false;
                redirectedToken = null;
                return data;
            } catch (error) {
                lastError = error;
                if (attempt + 1 >= attempts || !canRetry(error)) break;
                await delay(RETRY_DELAY_MS * (attempt + 1));
            }
        }
        throw lastError;
    }

    function filenameFromDisposition(contentDisposition, fallback) {
        const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(contentDisposition || '');
        const quoted = /filename="?([^";]+)"?/i.exec(contentDisposition || '');
        let filename = utf8 ? utf8[1] : quoted ? quoted[1] : (fallback || 'download');
        try { filename = decodeURIComponent(filename); } catch (_) {}
        return filename.replace(/[\\/:*?"<>|\u0000-\u001F]/g, '_').trim() || 'download';
    }

    /**
     * Download an authenticated file and save it using the server-provided
     * Content-Disposition filename when available.
     */
    async function download(path, options = {}) {
        const requestOptions = {
            ...options,
            method: options.method || 'GET',
            headers: { Accept: '*/*', ...(options.headers || {}) }
        };
        const attempts = String(requestOptions.method).toUpperCase() === 'GET' ? 2 : 1;
        let response;

        for (let attempt = 0; attempt < attempts; attempt += 1) {
            try {
                response = await execute(path, requestOptions);
                break;
            } catch (error) {
                if (attempt + 1 >= attempts || !canRetry(error)) throw error;
                await delay(RETRY_DELAY_MS * (attempt + 1));
            }
        }

        const blob = await response.blob();
        const filename = filenameFromDisposition(
            response.headers.get('content-disposition'),
            options.filename
        );
        const objectUrl = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = filename;
        anchor.style.display = 'none';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
        return { blob, filename };
    }

    /**
     * Configure the base API path for a page. Existing code uses `/api`.
     */
    function configure(options = {}) {
        if (options.baseUrl) baseUrl = String(options.baseUrl);
    }

    window.Api = Object.freeze({
        ApiError,
        configure,
        request,
        get: (path, options = {}) => request(path, { ...options, method: 'GET' }),
        post: (path, body, options = {}) => request(path, { ...options, method: 'POST', body }),
        put: (path, body, options = {}) => request(path, { ...options, method: 'PUT', body }),
        patch: (path, body, options = {}) => request(path, { ...options, method: 'PATCH', body }),
        delete: (path, options = {}) => request(path, { ...options, method: 'DELETE' }),
        download
    });
}(window));
