/**
 * Biome Shifters — Diagnostics Flight Recorder
 * Lightweight black-box event tracer for distributed simulation debugging.
 * Intercepts Network (fetch), UI Interactions, DOM Mutations, Worker IPC, and Console errors.
 */

export class FlightRecorder {
  constructor() {
    this.isRecording = false;
    this.startTime = 0;
    this.wallStartTime = 0;
    this.events = [];
    this.options = {
      network: true,
      ui: true,
      worker: true,
      console: true
    };

    // Stored originals for cleanup
    this._origFetch = null;
    this._origConsoleWarn = null;
    this._origConsoleError = null;
    this._mutationObserver = null;
    this._uiEventListener = null;
    this._hookedWorkers = new Map(); // worker -> { origPostMessage, origOnMessage }

    // External listener for live UI updates
    this.onEventRecorded = null;
    this.onStatusChanged = null;
  }

  /**
   * Start recording specified activity categories
   */
  start(options = {}) {
    if (this.isRecording) return;
    this.options = Object.assign({
      network: true,
      ui: true,
      worker: true,
      console: true
    }, options);

    this.isRecording = true;
    this.startTime = performance.now();
    this.wallStartTime = Date.now();
    this.events = [];

    // System banner
    this.recordEvent('system', 'RECORDER_STARTED', {
      options: this.options,
      url: typeof window !== 'undefined' ? window.location.href : 'headless'
    });

    if (this.options.network) this._installNetworkHooks();
    if (this.options.ui) this._installUiHooks();
    if (this.options.console) this._installConsoleHooks();

    if (typeof this.onStatusChanged === 'function') {
      this.onStatusChanged(true);
    }
  }

  /**
   * Stop recording and restore all hooked primitives
   */
  stop() {
    if (!this.isRecording) return null;

    this.recordEvent('system', 'RECORDER_STOPPED', {
      durationMs: Math.round(performance.now() - this.startTime),
      eventCount: this.events.length + 1
    });

    this._uninstallNetworkHooks();
    this._uninstallUiHooks();
    this._uninstallConsoleHooks();
    this._uninstallWorkerHooks();

    this.isRecording = false;

    if (typeof this.onStatusChanged === 'function') {
      this.onStatusChanged(false);
    }

    return this.exportTrace();
  }

  /**
   * Record a single event into the timeline buffer
   */
  recordEvent(category, action, payload = {}) {
    if (!this.isRecording) return;

    const relMs = Math.round((performance.now() - this.startTime) * 10) / 10;
    const evt = {
      relMs,
      timestamp: Date.now(),
      category,
      action,
      payload
    };

    this.events.push(evt);

    if (typeof this.onEventRecorded === 'function') {
      this.onEventRecorded(this.events.length, relMs);
    }
  }

  /**
   * Manually record an application state transition
   */
  recordStateChange(stateName, fromVal, toVal, extra = {}) {
    if (!this.isRecording) return;
    const stack = this._captureCleanStack(2);
    this.recordEvent('state', 'STATE_TRANSITION', {
      state: stateName,
      from: fromVal,
      to: toVal,
      stack,
      ...extra
    });
  }

  /**
   * Intercept window.fetch for network activity tracking
   */
  _installNetworkHooks() {
    if (typeof window === 'undefined' || !window.fetch || this._origFetch) return;
    this._origFetch = window.fetch;
    const self = this;

    window.fetch = async function (input, init = {}) {
      const url = typeof input === 'string' ? input : (input && input.url) ? input.url : String(input);
      const method = (init && init.method) ? init.method.toUpperCase() : 'GET';
      const reqId = Math.random().toString(36).slice(2, 8);
      const startMs = performance.now();

      // Attempt to parse request payload
      let reqBody = null;
      if (init && init.body) {
        try {
          reqBody = typeof init.body === 'string' ? JSON.parse(init.body) : '<binary/form>';
        } catch (e) {
          reqBody = String(init.body).slice(0, 500);
        }
      }

      self.recordEvent('network', 'FETCH_REQUEST', {
        reqId,
        url,
        method,
        body: reqBody,
        stack: self._captureCleanStack(2)
      });

      try {
        const resp = await self._origFetch.apply(this, arguments);
        const durationMs = Math.round(performance.now() - startMs);

        // Clone response to inspect JSON without consuming the stream
        const clone = resp.clone();
        let respBody = null;
        const contentType = resp.headers.get('content-type') || '';
        if (contentType.includes('json')) {
          try {
            respBody = await clone.json();
          } catch (e) {
            respBody = '<failed to parse json>';
          }
        }

        self.recordEvent('network', 'FETCH_RESPONSE', {
          reqId,
          url,
          method,
          status: resp.status,
          statusText: resp.statusText,
          durationMs,
          body: respBody
        });

        return resp;
      } catch (err) {
        const durationMs = Math.round(performance.now() - startMs);
        self.recordEvent('network', 'FETCH_ERROR', {
          reqId,
          url,
          method,
          durationMs,
          error: err.message || String(err)
        });
        throw err;
      }
    };
  }

  _uninstallNetworkHooks() {
    if (this._origFetch && typeof window !== 'undefined') {
      window.fetch = this._origFetch;
      this._origFetch = null;
    }
  }

  /**
   * Intercept UI user interactions and programmatic DOM mutations
   */
  _installUiHooks() {
    if (typeof document === 'undefined') return;

    // 1. Capture user clicks and changes
    this._uiEventListener = (e) => {
      if (!this.isRecording) return;
      const target = e.target;
      if (!target) return;

      const tag = target.tagName ? target.tagName.toLowerCase() : '';
      const id = target.id ? `#${target.id}` : '';
      const classes = target.className && typeof target.className === 'string' ? `.${target.className.trim().split(/\s+/).join('.')}` : '';
      const text = (target.textContent || '').trim().slice(0, 40);

      this.recordEvent('ui', `USER_${e.type.toUpperCase()}`, {
        tag,
        id: target.id || null,
        classes: target.className || null,
        selector: `${tag}${id}${classes}`,
        text,
        checked: target.checked !== undefined ? target.checked : undefined,
        value: target.value !== undefined && tag === 'select' ? target.value : undefined
      });
    };

    document.addEventListener('click', this._uiEventListener, true);
    document.addEventListener('change', this._uiEventListener, true);

    // 2. Observe programmatic DOM mutations on tracked interactive elements
    this._mutationObserver = new MutationObserver((mutations) => {
      if (!this.isRecording) return;
      for (const m of mutations) {
        const target = m.target;
        if (!target) continue;

        // Ignore updates to the flight recorder itself
        if (target.closest && target.closest('#modal-flight-recorder, #btn-flight-recorder')) continue;

        const id = target.id || (target.parentElement ? target.parentElement.id : null);
        const tag = target.tagName ? target.tagName.toLowerCase() : '';
        const text = (target.textContent || '').trim().slice(0, 50);

        // Track interesting UI buttons or HUD components
        if (id || tag === 'button' || target.classList?.contains('node-gpu-btn')) {
          this.recordEvent('mutation', 'DOM_MUTATION', {
            type: m.type,
            targetId: id,
            attributeName: m.attributeName,
            oldValue: m.oldValue,
            text,
            classes: target.className || ''
          });
        }
      }
    });

    this._mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeOldValue: true,
      characterData: true
    });
  }

  _uninstallUiHooks() {
    if (this._uiEventListener && typeof document !== 'undefined') {
      document.removeEventListener('click', this._uiEventListener, true);
      document.removeEventListener('change', this._uiEventListener, true);
      this._uiEventListener = null;
    }
    if (this._mutationObserver) {
      this._mutationObserver.disconnect();
      this._mutationObserver = null;
    }
  }

  /**
   * Hook Worker IPC: wrap worker.postMessage and worker.onmessage
   */
  hookWorker(worker, label = 'worker') {
    if (!worker || this._hookedWorkers.has(worker)) return;

    const self = this;
    const origPost = worker.postMessage;
    const origHandler = worker.onmessage;

    const hookData = {
      origPost,
      origHandler,
      label
    };
    this._hookedWorkers.set(worker, hookData);

    // Wrap postMessage (Main -> Worker)
    worker.postMessage = function (msg, transfer) {
      if (self.isRecording && self.options.worker) {
        const type = (msg && msg.type) ? msg.type : 'RAW_MSG';
        // Filter out heavy frame data payload to keep trace clean and nimble
        const summary = (type === 'REQUEST_FRAME') ? { type } : msg;
        self.recordEvent('worker', 'WORKER_SEND', {
          worker: label,
          type,
          data: summary,
          stack: self._captureCleanStack(2)
        });
      }
      return origPost.apply(this, arguments);
    };

    // Wrap onmessage (Worker -> Main)
    const listener = (e) => {
      if (self.isRecording && self.options.worker) {
        const msg = e.data;
        const type = (msg && msg.type) ? msg.type : 'RAW_MSG';
        // Suppress frame buffers or full telemetry dumps unless relevant
        if (type !== 'FRAME_DATA') {
          self.recordEvent('worker', 'WORKER_RECV', {
            worker: label,
            type,
            data: msg
          });
        }
      }
    };
    worker.addEventListener('message', listener);
    hookData.messageListener = listener;
  }

  _uninstallWorkerHooks() {
    for (const [worker, data] of this._hookedWorkers.entries()) {
      if (data.origPost) worker.postMessage = data.origPost;
      if (data.messageListener) worker.removeEventListener('message', data.messageListener);
    }
    this._hookedWorkers.clear();
  }

  /**
   * Intercept console.warn and console.error
   */
  _installConsoleHooks() {
    if (typeof console === 'undefined') return;
    this._origConsoleWarn = console.warn;
    this._origConsoleError = console.error;
    const self = this;

    console.warn = function (...args) {
      if (self.isRecording && self.options.console) {
        const text = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
        self.recordEvent('console', 'CONSOLE_WARN', {
          message: text,
          stack: self._captureCleanStack(2)
        });
      }
      return self._origConsoleWarn.apply(this, args);
    };

    console.error = function (...args) {
      if (self.isRecording && self.options.console) {
        const text = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
        self.recordEvent('console', 'CONSOLE_ERROR', {
          message: text,
          stack: self._captureCleanStack(2)
        });
      }
      return self._origConsoleError.apply(this, args);
    };
  }

  _uninstallConsoleHooks() {
    if (this._origConsoleWarn) {
      console.warn = this._origConsoleWarn;
      this._origConsoleWarn = null;
    }
    if (this._origConsoleError) {
      console.error = this._origConsoleError;
      this._origConsoleError = null;
    }
  }

  /**
   * Helper to capture clean stack traces
   */
  _captureCleanStack(skipLevels = 2) {
    try {
      const err = new Error();
      if (!err.stack) return null;
      const lines = err.stack.split('\n');
      return lines.slice(skipLevels + 1, skipLevels + 6).map(l => l.trim()).join(' -> ');
    } catch (e) {
      return null;
    }
  }

  /**
   * Export structured trace JSON
   */
  exportTrace() {
    const durationMs = this.startTime ? Math.round(performance.now() - this.startTime) : 0;
    return {
      metadata: {
        startedAt: new Date(this.wallStartTime).toISOString(),
        stoppedAt: new Date().toISOString(),
        durationMs,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'headless',
        options: this.options,
        eventCount: this.events.length
      },
      events: this.events
    };
  }

  /**
   * Trigger browser file download of trace JSON
   */
  downloadTrace(customFilename = null) {
    const trace = this.exportTrace();
    const str = JSON.stringify(trace, null, 2);
    const blob = new Blob([str], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.href = url;
    a.download = customFilename || `flight_trace_${timestamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return trace;
  }

  /**
   * Upload trace to server.py endpoint /api/debug/trace
   */
  async uploadToServer(apiBase = '') {
    const trace = this.exportTrace();
    try {
      const resp = await (this._origFetch || window.fetch)(`${apiBase}/api/debug/trace`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(trace)
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return await resp.json();
    } catch (err) {
      console.warn('[FlightRecorder] Failed to upload trace to server:', err);
      return null;
    }
  }
}

// Global Singleton Instance
export const flightRecorder = new FlightRecorder();

