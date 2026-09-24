// receipt-printer.js — Bluetooth & 58mm Thermal Receipt Printer Manager for The Yo's POS
// Specially tailored for Xprinter XP-58IIH and ESC/POS compatible thermal receipt printers.

const STORAGE_KEY_SETTINGS = 'theyos_receipt_settings';
const DEFAULT_SETTINGS = {
  storeName: "THE YO'S",
  tagline: 'Restaurant & Coffee Bar',
  address: 'General Santos City',
  phone: '0912 345 6789',
  footerNote: 'Thank you for your visit!\nPlease come again.',
  autoPrintPos: false,
  paperWidth: 58, // 58mm = 32 columns
};

// Known BLE services for thermal receipt printers (ESC/POS)
const PRINTER_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb', // Standard Printer GATT
  '0000e0ff-0000-1000-8000-00805f9b34fb', // Xprinter / Goojprt / Rongta
  '0000ffe0-0000-1000-8000-00805f9b34fb', // Common BLE Serial UART
  '0000ff00-0000-1000-8000-00805f9b34fb', // Vendor BLE
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC transparent UART
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // Posiflex / Star / generic
];

class ReceiptPrinterManager {
  constructor() {
    this.device = null;
    this.server = null;
    this.characteristic = null;
    this.statusListeners = new Set();
    this.settings = this.loadSettings();

    // Auto-reconnect if supported & previously granted
    if (typeof navigator !== 'undefined' && 'bluetooth' in navigator) {
      navigator.bluetooth.addEventListener?.('availabilitychanged', (e) => {
        this.notifyStatus();
      });
    }
  }

  loadSettings() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_SETTINGS);
      if (saved) return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
    } catch (e) {
      console.warn('Failed to load receipt settings:', e);
    }
    return { ...DEFAULT_SETTINGS };
  }

  saveSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    try {
      localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(this.settings));
    } catch (e) {
      console.warn('Failed to save receipt settings:', e);
    }
    return this.settings;
  }

  isBluetoothSupported() {
    return typeof navigator !== 'undefined' && !!navigator.bluetooth;
  }

  isConnected() {
    return !!(this.device && this.device.gatt && this.device.gatt.connected && this.characteristic);
  }

  getDeviceName() {
    return this.device?.name || 'Bluetooth Receipt Printer';
  }

  onStatusChange(callback) {
    this.statusListeners.add(callback);
    return () => this.statusListeners.delete(callback);
  }

  notifyStatus() {
    const status = {
      isSupported: this.isBluetoothSupported(),
      isConnected: this.isConnected(),
      deviceName: this.isConnected() ? this.getDeviceName() : null,
      autoPrint: this.settings.autoPrintPos,
    };
    this.statusListeners.forEach((cb) => {
      try { cb(status); } catch (e) { console.error(e); }
    });
  }

  /**
   * Connect to Bluetooth Printer via Web Bluetooth dialog
   */
  async connect() {
    if (!this.isBluetoothSupported()) {
      if (isAppleDevice()) {
        throw new Error(
          'Apple iOS/iPadOS blocks Web Bluetooth in Safari and Chrome. To connect directly via Bluetooth on an iPad or iPhone, open this system in the Bluefy app (free Web Bluetooth browser on the App Store). Alternatively, use the "System Print (58mm)" button.'
        );
      }
      throw new Error(
        'Web Bluetooth is not supported in this browser. Please use Google Chrome or Microsoft Edge on Windows/Android tablets, or use System Print.'
      );
    }

    try {
      // Prompt user to select their Bluetooth thermal printer
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: PRINTER_SERVICES,
      });

      this.device = device;
      this.device.addEventListener('gattserverdisconnected', () => {
        this.characteristic = null;
        this.server = null;
        this.notifyStatus();
      });

      const server = await device.gatt.connect();
      this.server = server;

      // Find writable characteristic across primary services
      let writeChar = null;

      for (const serviceUuid of PRINTER_SERVICES) {
        try {
          const service = await server.getPrimaryService(serviceUuid);
          const chars = await service.getCharacteristics();
          for (const char of chars) {
            if (char.properties.write || char.properties.writeWithoutResponse) {
              writeChar = char;
              break;
            }
          }
          if (writeChar) break;
        } catch (e) {
          // Keep looking in other services
        }
      }

      // Fallback: check all available services
      if (!writeChar) {
        try {
          const allServices = await server.getPrimaryServices();
          for (const service of allServices) {
            try {
              const chars = await service.getCharacteristics();
              for (const char of chars) {
                if (char.properties.write || char.properties.writeWithoutResponse) {
                  writeChar = char;
                  break;
                }
              }
              if (writeChar) break;
            } catch (e) {}
          }
        } catch (e) {}
      }

      if (!writeChar) {
        throw new Error(
          'Connected to device, but no writable printer characteristic was found. Ensure this is an ESC/POS Bluetooth printer.'
        );
      }

      this.characteristic = writeChar;
      this.notifyStatus();
      return { success: true, deviceName: this.getDeviceName() };
    } catch (err) {
      this.notifyStatus();
      if (err.name === 'NotFoundError') {
        throw new Error('Bluetooth pairing was cancelled.');
      }
      throw err;
    }
  }

  async disconnect() {
    if (this.device && this.device.gatt && this.device.gatt.connected) {
      try {
        this.device.gatt.disconnect();
      } catch (e) {
        console.warn('Error disconnecting Bluetooth printer:', e);
      }
    }
    this.device = null;
    this.server = null;
    this.characteristic = null;
    this.notifyStatus();
  }

  /**
   * Send raw byte buffer to Bluetooth printer in safe MTU chunks
   */
  async sendBytes(bytes) {
    if (!this.isConnected()) {
      throw new Error('Bluetooth printer is not connected.');
    }

    const CHUNK_SIZE = 60; // 60 bytes per packet fits safely within BLE MTU
    for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
      const chunk = bytes.slice(i, i + CHUNK_SIZE);
      if (this.characteristic.properties.writeWithoutResponse) {
        await this.characteristic.writeValueWithoutResponse(chunk);
      } else {
        await this.characteristic.writeValue(chunk);
      }
      // Small pause to prevent buffer overrun on XP-58IIH
      await new Promise((r) => setTimeout(r, 25));
    }
  }

  /**
   * Formats a receipt for 58mm (32 characters per line) and prints to Bluetooth
   */
  async printReceiptBluetooth(receiptData) {
    if (!this.isConnected()) {
      // Attempt connect first
      await this.connect();
    }
    const bytes = this.generateEscPosBytes(receiptData);
    await this.sendBytes(bytes);
    return true;
  }

  /**
   * Sends a test receipt to verify Bluetooth printer connection
   */
  async testPrint() {
    if (!this.isConnected()) {
      await this.connect();
    }
    const testData = {
      orderId: 'TEST-001',
      date: new Date(),
      orderType: 'dine_in',
      customerName: 'Test Customer',
      staffName: 'Admin',
      items: [
        { name: 'Xprinter XP-58IIH Test', quantity: 1, price: 0, subtotal: 0 },
        { name: 'Paper Width: 58mm (32 Cols)', quantity: 1, price: 0, subtotal: 0 },
        { name: 'Bluetooth Connection: OK', quantity: 1, price: 0, subtotal: 0 },
      ],
      subtotal: 0,
      deliveryFee: 0,
      totalAmount: 0,
      amountReceived: 0,
      change: 0,
      paymentMethod: 'Test OK',
    };
    const bytes = this.generateEscPosBytes(testData);
    await this.sendBytes(bytes);
    return true;
  }

  /**
   * ESC/POS Byte Generator for 58mm (32 columns)
   */
  generateEscPosBytes(data) {
    const s = this.settings;
    const COLS = 32; // Standard 58mm character width (Font A)

    const encoder = new TextEncoder();
    const parts = [];

    const pushBytes = (...b) => parts.push(new Uint8Array(b));
    const pushText = (text) => {
      // Thermal printers use ASCII/PC437; replace Philippine peso symbol with P or PHP to prevent corrupt glyphs
      const safe = text.replace(/₱/g, 'P').replace(/[^\x00-\x7F]/g, '');
      parts.push(encoder.encode(safe));
    };
    const pushLine = (text = '') => pushText(text + '\n');

    const padSides = (left, right, width = COLS) => {
      const leftStr = String(left || '');
      const rightStr = String(right || '');
      const space = width - leftStr.length - rightStr.length;
      if (space <= 0) {
        return leftStr.slice(0, width - rightStr.length - 1) + ' ' + rightStr;
      }
      return leftStr + ' '.repeat(space) + rightStr;
    };

    const center = (text, width = COLS) => {
      const str = String(text || '').trim();
      if (str.length >= width) return str.slice(0, width);
      const leftPad = Math.floor((width - str.length) / 2);
      return ' '.repeat(leftPad) + str;
    };

    // 1. Initialize Printer (ESC @)
    pushBytes(0x1b, 0x40);

    // 2. Select Character Code Table: PC437 (ESC t 0)
    pushBytes(0x1b, 0x74, 0x00);

    // 3. Header: Store Name (Center, Double Height & Width)
    pushBytes(0x1b, 0x61, 0x01); // Center
    pushBytes(0x1d, 0x21, 0x11); // Double width & height
    pushBytes(0x1b, 0x45, 0x01); // Bold ON
    pushLine(s.storeName || "THE YO'S");
    pushBytes(0x1d, 0x21, 0x00); // Normal size
    pushBytes(0x1b, 0x45, 0x00); // Bold OFF

    // Subtitle & Contact
    if (s.tagline) pushLine(s.tagline);
    if (s.address) pushLine(s.address);
    if (s.phone) pushLine('Tel: ' + s.phone);

    // Separator
    pushLine('='.repeat(COLS));

    // Order Info (Left align)
    pushBytes(0x1b, 0x61, 0x00); // Left align
    const dateStr = formatDateTime(data.date || new Date());
    const typeLabel = orderTypeLabel(data.orderType);

    pushLine(padSides(`Order #${data.orderId || '—'}`, typeLabel.toUpperCase()));
    pushLine(`Date: ${dateStr}`);
    if (data.staffName) pushLine(`Cashier: ${data.staffName}`);
    if (data.customerName && data.customerName !== 'Walk-in') {
      pushLine(`Customer: ${data.customerName}`);
      if (data.customerPhone) pushLine(`Phone: ${data.customerPhone}`);
    }
    if (data.deliveryAddress) {
      pushLine(`Address: ${data.deliveryAddress}`);
    }

    pushLine('-'.repeat(COLS));
    pushBytes(0x1b, 0x45, 0x01); // Bold header
    pushLine(padSides('QTY ITEM', 'PRICE'));
    pushBytes(0x1b, 0x45, 0x00); // Bold OFF
    pushLine('-'.repeat(COLS));

    // Items list
    (data.items || []).forEach((item) => {
      const qtyStr = `${item.quantity || 1}x `;
      const priceStr = formatAmount(item.subtotal != null ? item.subtotal : (item.price * item.quantity));
      const maxItemNameWidth = COLS - qtyStr.length - priceStr.length - 1;

      let name = item.name || item.product_name || 'Item';
      if (name.length <= maxItemNameWidth) {
        pushLine(qtyStr + name + ' '.repeat(maxItemNameWidth - name.length + 1) + priceStr);
      } else {
        // Multi-line item name
        pushLine(qtyStr + name.slice(0, maxItemNameWidth) + ' ' + priceStr);
        let rem = name.slice(maxItemNameWidth).trim();
        while (rem.length > 0) {
          pushLine('   ' + rem.slice(0, COLS - 4));
          rem = rem.slice(COLS - 4).trim();
        }
      }

      // Addons
      if (item.add_ons && item.add_ons.length > 0) {
        item.add_ons.forEach((addon) => {
          const addonName = ` + ${addon.name || 'Add-on'} (x${addon.quantity || 1})`;
          const addonPrice = addon.subtotal != null ? formatAmount(addon.subtotal) : '';
          pushLine(padSides(addonName, addonPrice));
        });
      }

      // Notes
      if (item.notes) {
        pushLine(`   Note: ${item.notes}`);
      }
    });

    pushLine('-'.repeat(COLS));

    // Totals
    const subtotal = Number(data.subtotal || 0);
    const deliveryFee = Number(data.deliveryFee || 0);
    const grandTotal = Number(data.totalAmount || 0);

    pushLine(padSides('Subtotal', formatAmount(subtotal)));
    if (deliveryFee > 0) {
      pushLine(padSides('Delivery Fee', formatAmount(deliveryFee)));
    }

    // Grand Total (Bold)
    pushBytes(0x1b, 0x45, 0x01); // Bold ON
    pushLine(padSides('TOTAL AMOUNT', 'P' + formatAmount(grandTotal)));
    pushBytes(0x1b, 0x45, 0x00); // Bold OFF

    pushLine('-'.repeat(COLS));

    // Payment details
    const method = data.paymentMethod ? String(data.paymentMethod).toUpperCase() : 'CASH';
    pushLine(padSides('Payment Method', method));

    if (data.splitPayments && data.splitPayments.length > 0) {
      data.splitPayments.forEach((sp) => {
        pushLine(padSides(` - ${String(sp.method || sp.payment_method).toUpperCase()}`, formatAmount(sp.amount)));
      });
    } else {
      if (data.amountReceived != null && data.amountReceived > 0) {
        pushLine(padSides('Amount Received', formatAmount(data.amountReceived)));
        const change = Number(data.change || 0);
        pushLine(padSides('Change', formatAmount(change)));
      }
    }

    pushLine('='.repeat(COLS));

    // Footer note
    pushBytes(0x1b, 0x61, 0x01); // Center
    if (s.footerNote) {
      const footerLines = s.footerNote.split('\n');
      footerLines.forEach((l) => pushLine(l.trim()));
    }
    pushLine('*** THE YO\'S POS ***');

    // Feed lines & cut
    pushLine('\n\n\n\n');
    // Partial cut command (GS V A 0)
    pushBytes(0x1d, 0x56, 0x41, 0x03);

    // Combine all chunks into one Uint8Array
    const totalLength = parts.reduce((sum, p) => sum + p.length, 0);
    const merged = new Uint8Array(totalLength);
    let offset = 0;
    for (const part of parts) {
      merged.set(part, offset);
      offset += part.length;
    }
    return merged;
  }
}

// Global printer manager singleton
export const printerManager = new ReceiptPrinterManager();

/* ================================================================
   HELPERS & FORMATTERS
   ================================================================ */

function formatAmount(val) {
  const num = Number(val) || 0;
  return num.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDateTime(d) {
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return '';
  return dt.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function orderTypeLabel(type) {
  if (!type) return 'Dine-In';
  const t = String(type).toLowerCase();
  if (t === 'takeout') return 'Takeout';
  if (t === 'delivery') return 'Delivery';
  return 'Dine-In';
}

function isAppleDevice() {
  return typeof navigator !== 'undefined' && (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ================================================================
   SYSTEM PRINT & MODAL PREVIEW (58mm Thermal Design)
   ================================================================ */

/**
 * Normalizes an order from POS or backend into standard receipt format
 */
export function normalizeOrderData(raw, extra = {}) {
  const items = (raw.items || raw.cart || []).map((it) => {
    const qty = Number(it.quantity || it.qty || 1);
    const price = Number(it.price || 0);
    const subtotal = it.subtotal != null ? Number(it.subtotal) : price * qty;
    return {
      name: it.product_name || it.name || `Item #${it.menu_id}`,
      quantity: qty,
      price: price,
      subtotal: subtotal,
      notes: it.notes || '',
      add_ons: (it.add_ons || []).map((a) => ({
        name: a.name || 'Add-on',
        quantity: Number(a.quantity || a.qty || 1),
        price: Number(a.price || 0),
        subtotal: a.subtotal != null ? Number(a.subtotal) : Number(a.price || 0) * Number(a.quantity || 1),
      })),
    };
  });

  const totalAmount = Number(raw.total_amount != null ? raw.total_amount : extra.totalAmount || 0);
  const deliveryFee = Number(raw.delivery_fee != null ? raw.delivery_fee : extra.deliveryFee || 0);
  const subtotal = extra.subtotal != null ? Number(extra.subtotal) : Math.max(0, totalAmount - deliveryFee);

  return {
    orderId: raw.id || extra.orderId || '—',
    date: raw.datetime_ordered ? new Date(raw.datetime_ordered) : new Date(),
    orderType: raw.order_type || extra.orderType || 'dine_in',
    customerName: raw.customer_name || extra.customerName || 'Walk-in',
    customerPhone: raw.customer_phone || raw.customer_mobile || extra.customerPhone || '',
    deliveryAddress: raw.delivery_address || extra.deliveryAddress || '',
    staffName: raw.staff_name || extra.staffName || '',
    items: items,
    subtotal: subtotal,
    deliveryFee: deliveryFee,
    totalAmount: totalAmount,
    amountReceived: Number(extra.amountReceived || raw.amount_received || totalAmount),
    change: Number(extra.change != null ? extra.change : Math.max(0, (extra.amountReceived || totalAmount) - totalAmount)),
    paymentMethod: raw.payment_method || extra.paymentMethod || 'cash',
    splitPayments: extra.splitPayments || (raw.payments && raw.payments.length > 1 ? raw.payments : null),
  };
}

/**
 * Triggers browser system print configured for 58mm thermal receipt
 */
export function printReceiptSystem(receiptData) {
  ensureReceiptStyles();
  let container = document.getElementById('thermalReceiptPrintWrapper');
  if (!container) {
    container = document.createElement('div');
    container.id = 'thermalReceiptPrintWrapper';
    document.body.appendChild(container);
  }

  container.innerHTML = renderThermalReceiptHtml(receiptData, printerManager.settings);

  // Trigger print
  window.print();
}

/**
 * Opens a receipt modal preview with Bluetooth & System Print buttons
 */
export function openReceiptModal(receiptData) {
  ensureReceiptStyles();
  let modal = document.getElementById('thermalReceiptModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'thermalReceiptModal';
    modal.className = 'thermal-modal-backdrop';
    document.body.appendChild(modal);
  }

  const s = printerManager.settings;
  const isBTConnected = printerManager.isConnected();
  const btName = printerManager.getDeviceName();

  modal.innerHTML = `
    <div class="thermal-modal-dialog">
      <div class="thermal-modal-header">
        <div class="thermal-modal-title">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 6 2 18 2 18 9"/>
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
            <rect x="6" y="14" width="12" height="8"/>
          </svg>
          Receipt Preview (58mm Thermal)
        </div>
        <button class="thermal-close-btn" id="thermalModalCloseBtn" aria-label="Close">&times;</button>
      </div>

      <div class="thermal-modal-body">
        <!-- Status Bar -->
        <div class="thermal-bt-bar">
          <div class="thermal-bt-status">
            <span class="thermal-status-dot ${isBTConnected ? 'online' : 'offline'}"></span>
            <span>${isBTConnected ? `Connected: <b>${escapeHtml(btName)}</b>` : 'Bluetooth Printer: Not Connected'}</span>
          </div>
          <div class="thermal-bt-actions">
            ${isBTConnected
              ? `<button class="thermal-sm-btn" id="thermalBtDisconnectBtn">Disconnect</button>`
              : `<button class="thermal-sm-btn primary" id="thermalBtConnectBtn">Connect Bluetooth</button>`
            }
            <button class="thermal-sm-btn" id="thermalSettingsBtn">Settings</button>
          </div>
        </div>

        ${!isBTConnected && isAppleDevice() ? `
          <div class="thermal-ios-tip" style="background:#fef7e7; border:1px solid #f9e2af; padding:8px 12px; border-radius:8px; font-size:0.76rem; line-height:1.45; color:#7d5700; margin-bottom:12px;">
            <b>📱 iPad / iPhone Notice:</b> Apple blocks Web Bluetooth in Safari. To connect Bluetooth directly on an iPad, open this site in <b>Bluefy</b> (free Web BLE browser on the App Store). Or tap <b>System Print (58mm)</b> below.
          </div>` : ''}

        <div id="thermalBtAlert" class="thermal-alert" style="display:none;"></div>

        <!-- Authentic 58mm Paper Ticket Container -->
        <div class="thermal-ticket-wrap">
          <div class="thermal-ticket">
            ${renderThermalReceiptHtml(receiptData, s)}
          </div>
        </div>
      </div>

      <div class="thermal-modal-footer">
        <button class="btn btn-outline" id="thermalSystemPrintBtn">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.15em; margin-right:4px;">
            <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>
          </svg>
          System Print (58mm)
        </button>
        <button class="btn" id="thermalBtPrintBtn" style="background:#2e7d4f; border-color:#2e7d4f;">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.15em; margin-right:4px;">
            <polyline points="6.5 6.5 17.5 17.5 12 23 12 1 17.5 6.5 6.5 17.5"/>
          </svg>
          Print via Bluetooth (XP-58)
        </button>
      </div>
    </div>
  `;

  modal.classList.add('active');

  // Event handlers
  const closeModal = () => modal.classList.remove('active');
  modal.querySelector('#thermalModalCloseBtn').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  const alertEl = modal.querySelector('#thermalBtAlert');
  const showAlert = (msg, isError = false) => {
    alertEl.style.display = 'block';
    alertEl.className = 'thermal-alert ' + (isError ? 'error' : 'success');
    alertEl.textContent = msg;
  };

  const connectBtn = modal.querySelector('#thermalBtConnectBtn');
  if (connectBtn) {
    connectBtn.addEventListener('click', async () => {
      try {
        connectBtn.disabled = true;
        connectBtn.textContent = 'Connecting…';
        await printerManager.connect();
        openReceiptModal(receiptData); // re-render with connected status
      } catch (err) {
        showAlert(err.message, true);
        connectBtn.disabled = false;
        connectBtn.textContent = 'Connect Bluetooth';
      }
    });
  }

  const disconnectBtn = modal.querySelector('#thermalBtDisconnectBtn');
  if (disconnectBtn) {
    disconnectBtn.addEventListener('click', async () => {
      await printerManager.disconnect();
      openReceiptModal(receiptData);
    });
  }

  modal.querySelector('#thermalSettingsBtn').addEventListener('click', () => {
    openPrinterSettingsModal(() => openReceiptModal(receiptData));
  });

  modal.querySelector('#thermalSystemPrintBtn').addEventListener('click', () => {
    printReceiptSystem(receiptData);
  });

  const btPrintBtn = modal.querySelector('#thermalBtPrintBtn');
  btPrintBtn.addEventListener('click', async () => {
    try {
      btPrintBtn.disabled = true;
      btPrintBtn.textContent = 'Sending to XP-58…';
      await printerManager.printReceiptBluetooth(receiptData);
      showAlert('Receipt successfully printed to Bluetooth printer!', false);
      btPrintBtn.textContent = 'Print via Bluetooth (XP-58)';
      btPrintBtn.disabled = false;
    } catch (err) {
      showAlert(err.message, true);
      btPrintBtn.textContent = 'Print via Bluetooth (XP-58)';
      btPrintBtn.disabled = false;
    }
  });
}

/**
 * Opens settings modal to configure store info, contact, and auto-print
 */
export function openPrinterSettingsModal(onSave) {
  ensureReceiptStyles();
  let modal = document.getElementById('thermalSettingsModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'thermalSettingsModal';
    modal.className = 'thermal-modal-backdrop';
    document.body.appendChild(modal);
  }

  const s = printerManager.settings;
  const isBTConnected = printerManager.isConnected();
  const btName = printerManager.getDeviceName();

  modal.innerHTML = `
    <div class="thermal-modal-dialog" style="max-width:440px;">
      <div class="thermal-modal-header">
        <div class="thermal-modal-title">Receipt Printer Settings</div>
        <button class="thermal-close-btn" id="thermalSettingsCloseBtn">&times;</button>
      </div>
      <div class="thermal-modal-body" style="padding:16px 20px;">
        <div class="thermal-form-group">
          <label>Bluetooth Printer (Xprinter XP-58IIH)</label>
          <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bone); padding:10px 12px; border-radius:8px; border:1px solid var(--line);">
            <div>
              <div style="font-weight:700; font-size:0.85rem;">${isBTConnected ? escapeHtml(btName) : 'Not Connected'}</div>
              <div style="font-size:0.75rem; color:var(--ink-muted);">${isBTConnected ? 'Ready to print' : 'Pair via Web Bluetooth'}</div>
            </div>
            <div style="display:flex; gap:6px;">
              ${isBTConnected
                ? `<button class="thermal-sm-btn" id="tsDisconnectBtn">Disconnect</button>`
                : `<button class="thermal-sm-btn primary" id="tsConnectBtn">Connect</button>`
              }
              <button class="thermal-sm-btn" id="tsTestPrintBtn" ${!isBTConnected ? 'disabled' : ''}>Test Print</button>
            </div>
          </div>
          <div id="tsAlert" class="thermal-alert" style="display:none; margin-top:8px;"></div>
          ${!isBTConnected && isAppleDevice() ? `
            <div style="background:#fef7e7; border:1px solid #f9e2af; padding:8px 12px; border-radius:8px; font-size:0.75rem; line-height:1.45; color:#7d5700; margin-top:8px;">
              <b>📱 iPad / iPhone Notice:</b> Apple restricts Bluetooth in Safari. For direct Bluetooth on iPad, open this web app in the <b>Bluefy</b> app (free from the App Store), or use <b>System Print (58mm)</b>. On <b>Android tablets</b>, it works natively in Google Chrome.
            </div>` : ''}
        </div>

        <div class="thermal-form-group">
          <label>Auto-Print on POS Checkout</label>
          <label style="display:flex; align-items:center; gap:8px; font-weight:normal; cursor:pointer; font-size:0.85rem;">
            <input type="checkbox" id="tsAutoPrint" ${s.autoPrintPos ? 'checked' : ''}>
            Automatically print receipt when order payment is confirmed
          </label>
        </div>

        <div class="thermal-form-group">
          <label>Store Name (Header)</label>
          <input type="text" id="tsStoreName" class="thermal-inp" value="${escapeHtml(s.storeName)}">
        </div>

        <div class="thermal-form-group">
          <label>Tagline / Sub-header</label>
          <input type="text" id="tsTagline" class="thermal-inp" value="${escapeHtml(s.tagline)}">
        </div>

        <div class="thermal-form-group">
          <label>Address / Branch</label>
          <input type="text" id="tsAddress" class="thermal-inp" value="${escapeHtml(s.address)}">
        </div>

        <div class="thermal-form-group">
          <label>Contact Phone</label>
          <input type="text" id="tsPhone" class="thermal-inp" value="${escapeHtml(s.phone)}">
        </div>

        <div class="thermal-form-group">
          <label>Receipt Footer Note</label>
          <textarea id="tsFooterNote" class="thermal-inp" rows="2">${escapeHtml(s.footerNote)}</textarea>
        </div>
      </div>
      <div class="thermal-modal-footer">
        <button class="btn btn-outline" id="tsCancelBtn">Cancel</button>
        <button class="btn" id="tsSaveBtn">Save Changes</button>
      </div>
    </div>
  `;

  modal.classList.add('active');

  const closeModal = () => modal.classList.remove('active');
  modal.querySelector('#thermalSettingsCloseBtn').addEventListener('click', closeModal);
  modal.querySelector('#tsCancelBtn').addEventListener('click', closeModal);

  const alertEl = modal.querySelector('#tsAlert');
  const showAlert = (msg, isErr = false) => {
    alertEl.style.display = 'block';
    alertEl.className = 'thermal-alert ' + (isErr ? 'error' : 'success');
    alertEl.textContent = msg;
  };

  const connBtn = modal.querySelector('#tsConnectBtn');
  if (connBtn) {
    connBtn.addEventListener('click', async () => {
      try {
        connBtn.disabled = true;
        connBtn.textContent = 'Connecting…';
        await printerManager.connect();
        openPrinterSettingsModal(onSave);
      } catch (e) {
        showAlert(e.message, true);
        connBtn.disabled = false;
        connBtn.textContent = 'Connect';
      }
    });
  }

  const disBtn = modal.querySelector('#tsDisconnectBtn');
  if (disBtn) {
    disBtn.addEventListener('click', async () => {
      await printerManager.disconnect();
      openPrinterSettingsModal(onSave);
    });
  }

  const testBtn = modal.querySelector('#tsTestPrintBtn');
  if (testBtn) {
    testBtn.addEventListener('click', async () => {
      try {
        testBtn.disabled = true;
        testBtn.textContent = 'Printing…';
        await printerManager.testPrint();
        showAlert('Test receipt sent to printer successfully!', false);
        testBtn.disabled = false;
        testBtn.textContent = 'Test Print';
      } catch (e) {
        showAlert(e.message, true);
        testBtn.disabled = false;
        testBtn.textContent = 'Test Print';
      }
    });
  }

  modal.querySelector('#tsSaveBtn').addEventListener('click', () => {
    printerManager.saveSettings({
      storeName: modal.querySelector('#tsStoreName').value.trim(),
      tagline: modal.querySelector('#tsTagline').value.trim(),
      address: modal.querySelector('#tsAddress').value.trim(),
      phone: modal.querySelector('#tsPhone').value.trim(),
      footerNote: modal.querySelector('#tsFooterNote').value.trim(),
      autoPrintPos: modal.querySelector('#tsAutoPrint').checked,
    });
    closeModal();
    if (onSave) onSave();
  });
}

/**
 * Generates the clean 58mm HTML receipt representation
 */
function renderThermalReceiptHtml(data, settings) {
  const s = settings || DEFAULT_SETTINGS;
  const dateStr = formatDateTime(data.date || new Date());
  const typeLabel = orderTypeLabel(data.orderType);

  const itemsHtml = (data.items || [])
    .map((item) => {
      const itemSubtotal = item.subtotal != null ? item.subtotal : (item.price * item.quantity);
      let addonsHtml = '';
      if (item.add_ons && item.add_ons.length > 0) {
        addonsHtml = item.add_ons
          .map(
            (a) => `
            <div class="tr-addon-line">
              <span>+ ${escapeHtml(a.name)} ×${a.quantity}</span>
              <span>₱${formatAmount(a.subtotal)}</span>
            </div>`
          )
          .join('');
      }

      let notesHtml = item.notes ? `<div class="tr-note">Note: ${escapeHtml(item.notes)}</div>` : '';

      return `
        <div class="tr-item-row">
          <div class="tr-item-left">
            <span class="tr-qty">${item.quantity}×</span>
            <span class="tr-name">${escapeHtml(item.name)}</span>
          </div>
          <div class="tr-item-price">₱${formatAmount(itemSubtotal)}</div>
        </div>
        ${addonsHtml}
        ${notesHtml}
      `;
    })
    .join('');

  const subtotal = Number(data.subtotal || 0);
  const deliveryFee = Number(data.deliveryFee || 0);
  const grandTotal = Number(data.totalAmount || 0);
  const change = Number(data.change || 0);

  let splitPaymentsHtml = '';
  if (data.splitPayments && data.splitPayments.length > 0) {
    splitPaymentsHtml = data.splitPayments
      .map(
        (sp) => `
        <div class="tr-row">
          <span>Paid via ${escapeHtml(String(sp.method || sp.payment_method).toUpperCase())}</span>
          <span>₱${formatAmount(sp.amount)}</span>
        </div>`
      )
      .join('');
  }

  return `
    <div class="thermal-receipt">
      <div class="tr-header">
        <div class="tr-store-name">${escapeHtml(s.storeName || "THE YO'S")}</div>
        ${s.tagline ? `<div class="tr-tagline">${escapeHtml(s.tagline)}</div>` : ''}
        ${s.address ? `<div class="tr-address">${escapeHtml(s.address)}</div>` : ''}
        ${s.phone ? `<div class="tr-phone">Tel: ${escapeHtml(s.phone)}</div>` : ''}
      </div>

      <div class="tr-divider-double"></div>

      <div class="tr-meta">
        <div class="tr-row">
          <b>Order #${escapeHtml(data.orderId)}</b>
          <span class="tr-badge">${escapeHtml(typeLabel.toUpperCase())}</span>
        </div>
        <div class="tr-row">
          <span>Date:</span>
          <span>${escapeHtml(dateStr)}</span>
        </div>
        ${data.staffName ? `
          <div class="tr-row">
            <span>Cashier:</span>
            <span>${escapeHtml(data.staffName)}</span>
          </div>` : ''}
        ${data.customerName && data.customerName !== 'Walk-in' ? `
          <div class="tr-row">
            <span>Customer:</span>
            <span>${escapeHtml(data.customerName)}</span>
          </div>` : ''}
        ${data.customerPhone ? `
          <div class="tr-row">
            <span>Phone:</span>
            <span>${escapeHtml(data.customerPhone)}</span>
          </div>` : ''}
        ${data.deliveryAddress ? `
          <div class="tr-address-box">
            <b>Delivery Address:</b><br>${escapeHtml(data.deliveryAddress)}
          </div>` : ''}
      </div>

      <div class="tr-divider"></div>

      <div class="tr-items-header">
        <span>QTY ITEM</span>
        <span>PRICE</span>
      </div>
      <div class="tr-divider"></div>

      <div class="tr-items-list">
        ${itemsHtml}
      </div>

      <div class="tr-divider"></div>

      <div class="tr-totals">
        <div class="tr-row">
          <span>Subtotal</span>
          <span>₱${formatAmount(subtotal)}</span>
        </div>
        ${deliveryFee > 0 ? `
          <div class="tr-row">
            <span>Delivery Fee</span>
            <span>₱${formatAmount(deliveryFee)}</span>
          </div>` : ''}
        <div class="tr-row tr-grand">
          <span>TOTAL</span>
          <span>₱${formatAmount(grandTotal)}</span>
        </div>
      </div>

      <div class="tr-divider"></div>

      <div class="tr-payment">
        <div class="tr-row">
          <span>Payment Method</span>
          <span style="font-weight:700;">${escapeHtml(String(data.paymentMethod || 'Cash').toUpperCase())}</span>
        </div>
        ${splitPaymentsHtml}
        ${data.amountReceived ? `
          <div class="tr-row">
            <span>Amount Received</span>
            <span>₱${formatAmount(data.amountReceived)}</span>
          </div>` : ''}
        ${change >= 0 ? `
          <div class="tr-row">
            <span>Change</span>
            <span>₱${formatAmount(change)}</span>
          </div>` : ''}
      </div>

      <div class="tr-divider-double"></div>

      <div class="tr-footer">
        ${s.footerNote ? s.footerNote.split('\n').map((l) => `<div>${escapeHtml(l)}</div>`).join('') : ''}
        <div class="tr-power">*** THE YO'S POS SYSTEM ***</div>
      </div>

      <div class="tr-cut-guide">
        <span>- - - - - - - - - - - - - - - - - - - - - - - -</span>
      </div>
    </div>
  `;
}

/**
 * Injects required styles for modal, ticket preview, and @media print
 */
function ensureReceiptStyles() {
  if (document.getElementById('thermalReceiptStyleTag')) return;
  const style = document.createElement('style');
  style.id = 'thermalReceiptStyleTag';
  style.textContent = `
    /* Modal container */
    .thermal-modal-backdrop {
      display: none; position: fixed; inset: 0;
      background: rgba(15,17,20,0.65); backdrop-filter: blur(4px);
      z-index: 10000; align-items: center; justify-content: center; padding: 16px;
    }
    .thermal-modal-backdrop.active { display: flex; }
    .thermal-modal-dialog {
      background: #ffffff; border-radius: 14px; width: 100%; max-width: 460px;
      box-shadow: 0 20px 50px rgba(0,0,0,0.3); max-height: 92vh; display: flex; flex-direction: column;
      overflow: hidden; animation: trModalIn 0.2s ease-out;
    }
    @keyframes trModalIn { from { opacity: 0; transform: translateY(12px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }

    .thermal-modal-header {
      padding: 14px 18px; border-bottom: 1px solid var(--line, #e4ddd0);
      display: flex; justify-content: space-between; align-items: center; background: #fff;
    }
    .thermal-modal-title {
      font-weight: 800; font-size: 0.95rem; display: flex; align-items: center; gap: 8px; color: var(--ink, #15171a);
    }
    .thermal-close-btn {
      background: none; border: none; font-size: 1.4rem; cursor: pointer; color: var(--ink-muted, #5c6065);
      line-height: 1; padding: 4px 8px; border-radius: 6px;
    }
    .thermal-close-btn:hover { background: rgba(0,0,0,0.06); }

    .thermal-modal-body {
      padding: 14px 18px; overflow-y: auto; flex: 1; background: #f6f3ee;
    }
    .thermal-modal-footer {
      padding: 12px 18px; border-top: 1px solid var(--line, #e4ddd0);
      display: flex; justify-content: flex-end; gap: 10px; background: #fff;
    }

    /* Bluetooth Status Bar */
    .thermal-bt-bar {
      display: flex; justify-content: space-between; align-items: center;
      background: #fff; border: 1px solid var(--line, #e4ddd0); border-radius: 10px;
      padding: 10px 14px; margin-bottom: 14px; font-size: 0.82rem;
    }
    .thermal-bt-status { display: flex; align-items: center; gap: 8px; }
    .thermal-status-dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
    .thermal-status-dot.online { background: #2e7d4f; box-shadow: 0 0 0 3px rgba(46,125,79,0.2); }
    .thermal-status-dot.offline { background: #c0392b; box-shadow: 0 0 0 3px rgba(192,57,43,0.15); }
    .thermal-bt-actions { display: flex; gap: 6px; }
    .thermal-sm-btn {
      padding: 5px 10px; border-radius: 6px; border: 1px solid var(--line, #e4ddd0);
      background: #fff; font-size: 0.75rem; font-weight: 600; cursor: pointer; transition: all 0.12s;
    }
    .thermal-sm-btn:hover { background: #f2ede4; }
    .thermal-sm-btn.primary { background: var(--brass, #a3844a); border-color: var(--brass, #a3844a); color: #fff; }
    .thermal-sm-btn.primary:hover { background: var(--brass-dark, #8a6d3a); }

    .thermal-alert {
      padding: 8px 12px; border-radius: 6px; font-size: 0.8rem; margin-bottom: 12px;
    }
    .thermal-alert.error { background: #fbeae8; color: #c0392b; border: 1px solid #f5c6cb; }
    .thermal-alert.success { background: #eafaf1; color: #2e7d4f; border: 1px solid #c3e6cb; }

    /* Forms */
    .thermal-form-group { margin-bottom: 14px; }
    .thermal-form-group label { display: block; font-size: 0.78rem; font-weight: 700; margin-bottom: 5px; color: var(--ink, #15171a); }
    .thermal-inp {
      width: 100%; padding: 8px 10px; border: 1px solid var(--line, #e4ddd0); border-radius: 6px;
      font-size: 0.85rem; font-family: inherit;
    }

    /* 58mm Paper Ticket Container (Preview) */
    .thermal-ticket-wrap {
      display: flex; justify-content: center; padding: 10px 0;
    }
    .thermal-ticket {
      width: 58mm; max-width: 100%; background: #ffffff;
      box-shadow: 0 4px 20px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.04);
      padding: 12px 10px; border-radius: 4px; border: 1px solid #e2ddd3;
    }

    /* Authentic Thermal Receipt Typography */
    .thermal-receipt {
      font-family: 'Space Mono', 'Courier New', Courier, monospace;
      font-size: 11px; line-height: 1.32; color: #000;
    }
    .tr-header { text-align: center; margin-bottom: 8px; }
    .tr-store-name { font-size: 15px; font-weight: 800; letter-spacing: 0.04em; margin-bottom: 2px; }
    .tr-tagline { font-size: 10px; opacity: 0.85; }
    .tr-address, .tr-phone { font-size: 9.5px; opacity: 0.75; }

    .tr-divider-double { border-top: 2px dashed #000; margin: 6px 0; }
    .tr-divider { border-top: 1px dashed #000; margin: 5px 0; }

    .tr-meta { margin: 6px 0; font-size: 10.5px; }
    .tr-row { display: flex; justify-content: space-between; align-items: baseline; margin: 2px 0; }
    .tr-badge {
      display: inline-block; padding: 1px 4px; border: 1px solid #000;
      font-size: 8.5px; font-weight: 700; text-transform: uppercase;
    }
    .tr-address-box {
      font-size: 9.5px; margin-top: 3px; padding: 4px; border: 1px solid #ccc;
    }

    .tr-items-header { display: flex; justify-content: space-between; font-weight: 700; font-size: 10px; }
    .tr-items-list { margin: 4px 0; }
    .tr-item-row { display: flex; justify-content: space-between; align-items: flex-start; margin: 3px 0; }
    .tr-item-left { display: flex; gap: 4px; min-width: 0; }
    .tr-qty { font-weight: 700; white-space: nowrap; }
    .tr-name { word-break: break-word; }
    .tr-item-price { font-weight: 700; white-space: nowrap; margin-left: 6px; }
    .tr-addon-line {
      display: flex; justify-content: space-between; font-size: 9.5px;
      padding-left: 14px; opacity: 0.85; margin: 1px 0;
    }
    .tr-note { font-size: 9px; font-style: italic; padding-left: 14px; opacity: 0.75; }

    .tr-totals { margin: 5px 0; }
    .tr-grand { font-size: 13px; font-weight: 800; border-top: 1px solid #000; padding-top: 4px; margin-top: 4px; }
    .tr-payment { margin: 5px 0; }

    .tr-footer { text-align: center; margin-top: 8px; font-size: 10px; }
    .tr-power { font-size: 8.5px; opacity: 0.6; margin-top: 4px; }
    .tr-cut-guide { text-align: center; font-size: 8px; opacity: 0.4; margin-top: 12px; }

    /* Hidden in standard screen view */
    #thermalReceiptPrintWrapper { display: none; }

    /* ================================================================
       PRINT MEDIA QUERY (58mm Paper Roll)
       ================================================================ */
    @media print {
      @page {
        size: 58mm auto;
        margin: 0;
      }
      html, body {
        margin: 0 !important; padding: 0 !important;
        background: #fff !important; color: #000 !important;
        width: 58mm !important;
      }
      body > *:not(#thermalReceiptPrintWrapper) {
        display: none !important;
      }
      #thermalReceiptPrintWrapper {
        display: block !important;
        position: absolute; left: 0; top: 0;
        width: 54mm !important;
        max-width: 58mm !important;
        padding: 2mm 3mm !important;
        background: #fff !important;
        color: #000 !important;
      }
      #thermalReceiptPrintWrapper * {
        visibility: visible !important;
        color: #000 !important;
      }
      .thermal-ticket {
        box-shadow: none !important;
        border: none !important;
        padding: 0 !important;
        width: 100% !important;
      }
      .tr-cut-guide { display: none !important; }
    }
  `;
  document.head.appendChild(style);
}
