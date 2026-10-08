// NOKKA Furniture — Shared Shopping Cart System

import { PRODUCTS } from './products.js';
import QRCodeGen from './qr-code.js';

let cart = {}; // itemKey -> { productId, quantity, options }

// Load cart state from localStorage
export function loadCart() {
  try {
    const saved = localStorage.getItem('nokka_cart');
    if (saved) {
      cart = JSON.parse(saved);
    } else {
      cart = {};
    }
  } catch (e) {
    cart = {};
  }
  updateUI();
}

// Save cart state to localStorage
export function saveCart() {
  localStorage.setItem('nokka_cart', JSON.stringify(cart));
  updateUI();
  
  // Dispatch custom event for pages that need to respond
  window.dispatchEvent(new CustomEvent('cart-updated', { detail: cart }));
}

// Add an item with custom configurations
export function addToCart(productId, options = {}) {
  const p = PRODUCTS.find(x => x.id === productId);
  if (!p) return;

  const wood = options.wood || 'Teak Wood';
  const finish = options.finish || 'Natural Finish';
  const upholstery = options.upholstery || 'wood';
  const color = options.color || 'No Cushion';
  const size = options.size || 'Standard Size';

  // Generate a unique item key based on its configuration
  const itemKey = `${productId}_${wood}_${finish}_${upholstery}_${color}_${size}`
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_');

  if (cart[itemKey]) {
    cart[itemKey].quantity += 1;
  } else {
    cart[itemKey] = {
      productId,
      quantity: 1,
      options: { wood, finish, upholstery, color, size }
    };
  }

  saveCart();
  showToast(`${p.name} added to cart`);
}

// Adjust quantity
export function changeQty(itemKey, delta) {
  if (!cart[itemKey]) return;
  cart[itemKey].quantity += delta;
  if (cart[itemKey].quantity <= 0) {
    delete cart[itemKey];
  }
  saveCart();
}

// Remove item
export function removeItem(itemKey) {
  delete cart[itemKey];
  saveCart();
}

// Open / Close Cart Drawer
export function openCart() {
  const drawer = document.getElementById('cartDrawer');
  const overlay = document.getElementById('cartOverlay');
  if (drawer && overlay) {
    drawer.classList.add('open');
    overlay.classList.add('open');
  }
}

export function closeCart() {
  const drawer = document.getElementById('cartDrawer');
  const overlay = document.getElementById('cartOverlay');
  if (drawer && overlay) {
    drawer.classList.remove('open');
    overlay.classList.remove('open');
  }
}

// Trigger Toast message
let toastTimer;
export function showToast(msg) {
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toastMsg');
  if (!toast || !toastMsg) return;
  
  toastMsg.textContent = msg;
  toast.classList.add('show');
  
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 2400);
}

// Update all cart badges and item listings
function updateUI() {
  const subtotalEl = document.getElementById('cartSubtotal');
  const itemsEl = document.getElementById('cartItems');
  const countBadges = document.querySelectorAll('.cart-count');
  
  const keys = Object.keys(cart);
  const totalCount = keys.reduce((s, key) => s + cart[key].quantity, 0);
  
  // Update nav badges
  countBadges.forEach(badge => {
    badge.textContent = totalCount;
  });

  if (!itemsEl) return;

  if (keys.length === 0) {
    itemsEl.innerHTML = `
      <div class="cart-empty">
        Your cart is empty.<br>
        <a href="products.html" style="color: var(--brass); text-decoration: underline; margin-top: 10px; display: inline-block;">Browse catalogue</a> to start.
      </div>`;
    if (subtotalEl) subtotalEl.textContent = '₹ 0';
    return;
  }

  let subtotal = 0;
  itemsEl.innerHTML = keys.map(key => {
    const item = cart[key];
    const p = PRODUCTS.find(x => x.id === item.productId);
    if (!p) return '';
    const qty = item.quantity;
    
    // Upcharge for Grand Size
    let unitPrice = p.price;
    if (item.options.size && item.options.size.includes('Grand')) {
      unitPrice += 5000;
    }
    const itemTotal = unitPrice * qty;
    subtotal += itemTotal;

    // Layout configuration string
    const opt = item.options;
    const isFabric = ['chair', 'sofa', 'bed', 'lamp'].includes(p.builder);
    let optionsText = `${opt.wood} frame, ${opt.finish}`;
    if (isFabric && opt.color && opt.color !== 'No Cushion') {
      optionsText += `, ${opt.color} cushion (${opt.upholstery})`;
    }
    optionsText += `, ${opt.size}`;

    return `
      <div class="cart-item">
        <div class="ci-thumb">
          <svg viewBox="0 0 160 140" fill="none" style="stroke: var(--ink);">${p.icon}</svg>
        </div>
        <div class="ci-body">
          <div class="ci-name">${p.name}</div>
          <div class="ci-meta" style="font-size:10.5px; color:#8e8371; line-height:1.4; margin-top:3px;">${optionsText}</div>
          <div class="ci-qty">
            <button class="qty-btn" data-id="${key}" data-action="decrease">−</button>
            <span>${qty}</span>
            <button class="qty-btn" data-id="${key}" data-action="increase">+</button>
          </div>
          <button class="ci-remove" data-id="${key}">Remove</button>
        </div>
        <div class="ci-price">₹ ${itemTotal.toLocaleString()}</div>
      </div>`;
  }).join('');

  if (subtotalEl) {
    subtotalEl.textContent = `₹ ${subtotal.toLocaleString()}`;
  }
}

// Dynamically inject structural HTML for Cart and Backdrop overlay into current page
export function initCartDrawer() {
  if (!document.getElementById('cartDrawer')) {
    const drawerHtml = `
      <div class="cart-overlay" id="cartOverlay"></div>
      <aside class="cart-drawer" id="cartDrawer">
        <div class="cart-head">
          <h3>Your Cart</h3>
          <button class="cart-close" id="cartClose" aria-label="Close cart">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none"><path d="M5 5L19 19M19 5L5 19" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
          </button>
        </div>
        <div class="cart-items" id="cartItems"></div>
        <div class="cart-foot">
          <div class="cart-subtotal"><span>Subtotal</span><strong id="cartSubtotal">₹ 0</strong></div>
          <button class="btn btn-solid checkout-btn" id="checkoutBtn">Checkout →</button>
        </div>
      </aside>
      <div class="toast" id="toast">
        <svg viewBox="0 0 24 24" fill="none"><path d="M5 13L9.5 17.5L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <span id="toastMsg">Added to cart</span>
      </div>`;
    
    document.body.insertAdjacentHTML('beforeend', drawerHtml);
  }

  // Setup click triggers on document
  document.addEventListener('click', async e => {
    const toggle = e.target.closest('#cartToggle') || e.target.closest('.cart-btn');
    const close = e.target.closest('#cartClose') || e.target.closest('#cartOverlay');
    const qtyBtn = e.target.closest('.qty-btn');
    const removeBtn = e.target.closest('.ci-remove');
    const checkout = e.target.closest('#checkoutBtn');

    if (toggle) {
      e.preventDefault();
      openCart();
    } else if (close) {
      closeCart();
    } else if (qtyBtn) {
      const id = qtyBtn.dataset.id;
      const action = qtyBtn.dataset.action;
      if (action === 'increase') {
        changeQty(id, 1);
      } else {
        changeQty(id, -1);
      }
    } else if (removeBtn) {
      const id = removeBtn.dataset.id;
      removeItem(id);
    } else if (checkout) {
      const keys = Object.keys(cart);
      if (keys.length === 0) {
        showToast('Your cart is empty');
        return;
      }
      closeCart();
      openCheckoutWizard();
    }
  });

  loadCart();
}

// Full payment checkout wizard
export function openCheckoutWizard() {
  const keys = Object.keys(cart);
  const items = keys.map(key => {
    const item = cart[key];
    const p = PRODUCTS.find(x => x.id === item.productId);
    let unitPrice = p ? p.price : 0;
    if (item.options.size && item.options.size.includes('Grand')) {
      unitPrice += 5000;
    }
    return {
      product_id: item.productId,
      product_name: p ? p.name : item.productId,
      quantity: item.quantity,
      price: unitPrice,
      options: item.options
    };
  });
  
  const total = items.reduce((s, it) => s + (it.price * it.quantity), 0);
  const gstInitial = Math.round(total * 0.18);
  const deliveryCharge = 1000;
  let finalTotal = total + gstInitial + deliveryCharge;

  // Styles Injection
  const styles = `
    <style id="checkoutWizardStyles">
      .wizard-overlay {
        position: fixed; inset: 0; background: rgba(27,23,18,0.8); backdrop-filter: blur(6px);
        z-index: 100000; display: flex; align-items: center; justify-content: center; padding: 16px;
        box-sizing: border-box; overflow-y: auto;
      }
      .wizard-card {
        background: #FAF8F5; color: #1B1712; border: 1px solid #d5cebf; border-radius: 14px;
        width: 100%; max-width: 500px; padding: 28px; box-shadow: 0 24px 48px rgba(0,0,0,0.3);
        box-sizing: border-box; font-family: 'Inter', sans-serif; max-height: 94vh; overflow-y: auto;
      }
      .step-panel { display: none; }
      .step-panel.active { display: block; }
      .payment-options-row { display: flex; gap: 8px; margin-bottom: 20px; }
      .payment-tab {
        flex: 1; text-align: center; padding: 10px 6px; border: 1px solid #d5cebf; border-radius: 8px;
        font-family: 'Space Grotesk', sans-serif; font-size: 11px; text-transform: uppercase; font-weight: 600;
        cursor: pointer; transition: all 0.25s; color: #8e8371; background: #fff;
        display: flex; align-items: center; justify-content: center; gap: 6px;
      }
      .payment-tab:hover { border-color: #1B1712; color: #1B1712; }
      .payment-tab.active { background: #1B1712; color: #FAF8F5; border-color: #1B1712; box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
      .form-field { margin-bottom: 14px; }
      .form-field label { display: block; font-family: 'Space Grotesk', sans-serif; font-size: 10px; text-transform: uppercase; color: #8a8171; margin-bottom: 4px; font-weight: 600; }
      .form-input { width: 100%; background: #FAF8F5; border: 1px solid #d5cebf; border-radius: 8px; padding: 10px 14px; font-size: 13px; color: #1B1712; box-sizing: border-box; outline: none; transition: border-color 0.2s; }
      .form-input:focus { border-color: #1B1712; background: #fff; }

      /* PhonePe Dark Scanner Card */
      .phonepe-card {
        background: #12111A; color: #FAF8F5; border-radius: 16px; padding: 20px 16px;
        text-align: center; box-shadow: 0 16px 36px rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.08);
        margin-bottom: 18px; position: relative; overflow: hidden;
      }
      .phonepe-header { margin-bottom: 10px; }
      .phonepe-title {
        font-family: 'Space Grotesk', sans-serif; font-size: 15px; font-weight: 700;
        letter-spacing: 0.14em; color: #FAF8F5; text-transform: uppercase; margin-bottom: 6px;
      }
      .phonepe-bank-pill {
        display: inline-flex; align-items: center; gap: 8px; background: rgba(255,255,255,0.08);
        padding: 5px 14px; border-radius: 20px; font-size: 12px; color: #E2DED6;
        font-family: 'Inter', sans-serif; border: 1px solid rgba(255,255,255,0.06);
      }
      .phonepe-qr-wrap {
        background: #FFFFFF; border-radius: 14px; padding: 10px; display: inline-block;
        position: relative; box-shadow: 0 6px 20px rgba(0,0,0,0.3); margin: 12px 0 12px;
      }
      .phonepe-laser-line {
        position: absolute; left: 6px; right: 6px; height: 3px;
        background: linear-gradient(90deg, transparent, #25D366 20%, #00FF88 50%, #25D366 80%, transparent);
        box-shadow: 0 0 10px #25D366, 0 0 20px #25D366; border-radius: 3px;
        animation: phonepeScan 2.4s infinite ease-in-out; pointer-events: none; z-index: 10;
      }
      @keyframes phonepeScan {
        0% { top: 10px; opacity: 0.85; }
        50% { top: calc(100% - 13px); opacity: 1; }
        100% { top: 10px; opacity: 0.85; }
      }
      .phonepe-upi-row {
        display: flex; align-items: center; justify-content: center; gap: 8px;
        font-size: 13px; color: #D2CCE0; font-family: 'Space Grotesk', monospace; margin-bottom: 12px;
      }
      .phonepe-copy-btn {
        background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.18);
        color: #FAF8F5; border-radius: 6px; padding: 4px 8px; cursor: pointer;
        display: inline-flex; align-items: center; gap: 4px; font-size: 11px; transition: all 0.2s;
      }
      .phonepe-copy-btn:hover { background: #5f259f; border-color: #5f259f; }
      .phonepe-actions-row {
        display: flex; justify-content: center; gap: 8px; margin-bottom: 10px;
      }
      .phonepe-action-btn {
        background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12);
        color: #FAF8F5; border-radius: 8px; padding: 7px 14px; font-size: 11.5px;
        font-family: 'Space Grotesk', sans-serif; cursor: pointer; display: inline-flex;
        align-items: center; gap: 6px; transition: all 0.2s;
      }
      .phonepe-action-btn:hover { background: rgba(255,255,255,0.16); }
      .phonepe-deeplink-btn {
        display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%;
        background: linear-gradient(135deg, #5f259f, #7b32c6); color: #FFFFFF; border: none;
        border-radius: 8px; padding: 10px; font-size: 12px; font-weight: 600;
        font-family: 'Space Grotesk', sans-serif; text-decoration: none; cursor: pointer;
        box-shadow: 0 4px 12px rgba(95,37,159,0.35); transition: transform 0.2s, box-shadow 0.2s;
        box-sizing: border-box;
      }
      .phonepe-deeplink-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(95,37,159,0.5); }
      .sms-popup {
        position: fixed; top: 20px; right: 20px; background: #1B1712; color: #FAF8F5;
        border-radius: 8px; padding: 16px 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.35);
        z-index: 110000; font-family: 'Inter', sans-serif; font-size: 13px; max-width: 320px;
        transform: translateY(-150%); transition: transform 0.6s cubic-bezier(0.2, 0.8, 0.2, 1);
        border-left: 4px solid var(--brass);
      }
      .sms-popup.show { transform: translateY(0); }
    </style>
  `;
  document.body.insertAdjacentHTML('beforeend', styles);

  const wizardHtml = `
    <div class="wizard-overlay" id="checkoutWizardOverlay">
      <div class="wizard-card">
        
        <!-- STEP 1: SHIPPING ADDRESS -->
        <div class="step-panel active" id="step1">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
            <h3 style="font-family:'Fraunces', serif; font-size:22px; font-weight:400; margin:0;">Shipping Address</h3>
            <button type="button" onclick="document.getElementById('checkoutWizardOverlay').remove();" style="background:none; border:none; font-size:18px; cursor:pointer; color:#8e8371;">✕</button>
          </div>
          <form id="shippingForm" onsubmit="goStep2(event);">
            <div class="form-field">
              <label>Full Name</label>
              <input type="text" id="shipName" class="form-input" placeholder="Rajesh Kumar" required>
            </div>
            <div class="form-field">
              <label>Email Address</label>
              <input type="email" id="shipEmail" class="form-input" placeholder="rajesh@mail.in" required>
            </div>
            <div class="form-field">
              <label>Phone Number (with +91)</label>
              <input type="tel" id="shipPhone" class="form-input" placeholder="+919876543210" required>
            </div>
            <div class="form-field">
              <label>Delivery Address</label>
              <input type="text" id="shipAddress" class="form-input" placeholder="Flat 402, Block C, Wood Apartments" required>
            </div>
            <div class="form-field">
              <label>Pincode</label>
              <input type="text" id="shipPin" class="form-input" placeholder="560001" required pattern="[0-9]{6}">
            </div>
            <label style="font-size:12px; color:#5b5347; display:flex; align-items:center; gap:8px; margin-top:14px; cursor:pointer;">
              <input type="checkbox" id="saveAddressCheck" checked> Save address for future visits
            </label>
            <div style="display:flex; justify-content:space-between; margin-top:24px; align-items:center;">
              <span style="font-size:14px; font-weight:600;" id="wizardStep1Total">Total: ₹ ${finalTotal.toLocaleString()}</span>
              <button type="submit" class="btn btn-solid" style="padding:12px 24px;">Proceed to Payment →</button>
            </div>
          </form>
        </div>
 
        <!-- STEP 2: PAYMENT METHOD -->
        <div class="step-panel" id="step2">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
            <h3 style="font-family:'Fraunces', serif; font-size:22px; font-weight:400; margin:0;">Payment Method</h3>
            <button type="button" onclick="document.getElementById('step2').classList.remove('active'); document.getElementById('step1').classList.add('active');" style="background:none; border:none; font-size:12px; font-family:'Space Grotesk', sans-serif; cursor:pointer; color:#8e8371;">← Edit Address</button>
          </div>
          
          <!-- Coupon block -->
          <div style="display:flex; gap:8px; margin-bottom: 16px; border-bottom:1px solid #d5cebf; padding-bottom:14px;">
            <input type="text" id="couponCode" placeholder="Enter coupon (e.g. NOKKA20)" class="form-input" style="flex:1; text-transform:uppercase;">
            <button type="button" class="btn btn-ghost" id="applyCouponBtn" style="font-size:11px; padding:0 12px; font-family:'Space Grotesk', sans-serif;">Apply</button>
          </div>
          <div id="couponStatus" style="font-size:11px; color:var(--rust); margin-top:-10px; margin-bottom:14px; display:none; font-family:'Space Grotesk', sans-serif; font-weight:600;"></div>

          <div class="payment-options-row">
            <button class="payment-tab active" onclick="switchPayTab('upi');">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM17 17h4v4h-4z"/></svg>
              UPI Scanner
            </button>
            <button class="payment-tab" onclick="switchPayTab('card');">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
              Card
            </button>
            <button class="payment-tab" onclick="switchPayTab('cod');">Cash (COD)</button>
          </div>
 
          <!-- UPI PANEL (PhonePe QR Scanner Card) -->
          <div id="payUpiBlock">
            <div class="phonepe-card">
              <div class="phonepe-header">
                <div class="phonepe-title">MY QR</div>
                <div class="phonepe-bank-pill">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
                    <circle cx="12" cy="12" r="11" fill="#EE741D"/>
                    <path d="M12 4.5L6.5 15.5H17.5L12 4.5Z" fill="#FFFFFF"/>
                    <path d="M12 8L8.8 14.5H15.2L12 8Z" fill="#0D47A1"/>
                    <circle cx="12" cy="12.5" r="1.5" fill="#FFFFFF"/>
                  </svg>
                  <span>Indian Bank... - 9890</span>
                </div>
              </div>

              <!-- Animated Scanner Frame -->
              <div class="phonepe-qr-wrap">
                <div class="phonepe-laser-line"></div>
                <div id="phonepeQrContainer" style="display:flex; justify-content:center; align-items:center; width:200px; height:200px;">
                  <!-- QR Code will be rendered dynamically -->
                </div>
              </div>

              <div class="phonepe-upi-row">
                <span>UPI ID: <strong>9538831664@axl</strong></span>
                <button type="button" class="phonepe-copy-btn" id="phonepeCopyBtn" onclick="copyPhonePeUpiId();" title="Copy UPI ID">
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                </button>
              </div>

              <!-- Action buttons: Download & Share -->
              <div class="phonepe-actions-row">
                <button type="button" class="phonepe-action-btn" onclick="downloadPhonePeQR();">
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                  Download
                </button>
                <button type="button" class="phonepe-action-btn" onclick="sharePhonePeQR();">
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
                  Share
                </button>
              </div>

              <!-- Pay with UPI App Direct Link -->
              <a id="phonepeDeeplink" href="upi://pay?pa=9538831664@axl&pn=NOKKA%20FURNITURE&am=${finalTotal}&cu=INR" class="phonepe-deeplink-btn">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14h-2v-6h2v6zm4 0h-2v-6h2v6z"/></svg>
                Pay <span id="phonepeAmountBadge">₹ ${finalTotal.toLocaleString()}</span> via PhonePe / GPay
              </a>
            </div>

            <!-- UPI Payment Confirmation Form -->
            <form onsubmit="triggerOTP(event, 'upi');">
              <div class="form-field" style="margin-bottom:10px;">
                <label>Paid via UPI App</label>
                <select class="form-input" id="upiAppSelect" style="background:var(--paper); width:100%; box-sizing:border-box;">
                  <option value="PhonePe" selected>PhonePe</option>
                  <option value="GPay">Google Pay (GPay)</option>
                  <option value="Paytm">Paytm</option>
                  <option value="BHIM / Other UPI">BHIM / Cred / Other UPI</option>
                </select>
              </div>
              <div class="form-field" style="margin-bottom:10px;">
                <label>Your UPI ID (Optional)</label>
                <input type="text" class="form-input" id="upiIdInput" placeholder="e.g. customer@okaxis" value="user@ybl">
              </div>
              <div class="form-field" style="margin-bottom:14px;">
                <label>Transaction Reference ID / UTR</label>
                <div style="display:flex; gap:6px;">
                  <input type="text" class="form-input" id="upiTxnRefInput" placeholder="UPI-TXN-10245" required>
                  <button type="button" class="btn btn-ghost" onclick="document.getElementById('upiTxnRefInput').value = 'UPI-TXN-' + Math.floor(100000 + Math.random() * 900000);" style="font-size:10px; padding:0 8px; white-space:nowrap;">Auto</button>
                </div>
              </div>
              <button type="submit" id="upiPayBtn" class="btn btn-solid" style="width:100%; justify-content:center; padding:14px;">Verify UPI ID & Confirm Order (₹ ${finalTotal.toLocaleString()}) →</button>
            </form>
          </div>

          <!-- CARD FORM -->
          <form id="payCardForm" style="display:none;" onsubmit="triggerOTP(event, 'card');">
            <div class="form-field">
              <label>Cardholder Name</label>
              <input type="text" class="form-input" placeholder="RAJESH KUMAR" required>
            </div>
            <div class="form-field">
              <label>Card Number</label>
              <input type="text" class="form-input" placeholder="4321 8765 0987 1234" required pattern="[0-9\\s]{13,19}">
            </div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
              <div class="form-field">
                <label>Expiry (MM/YY)</label>
                <input type="text" class="form-input" placeholder="08/29" required pattern="[0-9]{2}/[0-9]{2}">
              </div>
              <div class="form-field">
                <label>CVV</label>
                <input type="password" class="form-input" placeholder="***" required pattern="[0-9]{3}">
              </div>
            </div>
            <button type="submit" id="cardPayBtn" class="btn btn-solid" style="width:100%; justify-content:center; padding:14px; margin-top:14px;">Pay ₹ ${finalTotal.toLocaleString()} →</button>
          </form>

          <!-- COD PANEL -->
          <div id="payCodBlock" style="display:none; text-align:center; padding:20px 0;">
            <p style="font-size:14px; line-height:1.6; color:#5b5347; margin-bottom:24px;">
              Pay in cash upon delivery. The 11-week Swedish joinery batch queue slots are limited. We will verify your order details via phone before preparation.
            </p>
            <button class="btn btn-solid" onclick="completeCheckout('COD');" style="width:100%; justify-content:center; padding:14px;">Confirm Order (COD) →</button>
          </div>
        </div>

        <!-- STEP 3: OTP VERIFICATION -->
        <div class="step-panel" id="step3">
          <h3 style="font-family:'Fraunces', serif; font-size:22px; font-weight:400; margin:0 0 10px;">Security Verification</h3>
          <p style="font-size:13px; color:#5b5347; margin-bottom:20px;">
            A simulated secure OTP has been dispatched. Check the slide-in message block on your screen and enter it below.
          </p>
          <form onsubmit="verifyOTP(event);">
            <div class="form-field">
              <label>Enter 4-Digit OTP</label>
              <input type="text" id="otpCodeField" class="form-input" placeholder="••••" required pattern="[0-9]{4}" style="text-align:center; font-size:24px; letter-spacing:8px;">
            </div>
            <button type="submit" class="btn btn-solid" style="width:100%; justify-content:center; padding:14px; margin-top:14px;">Verify & Confirm Checkout →</button>
          </form>
        </div>

      </div>
    </div>

    <!-- Simulated SMS OTP slide-in notification -->
    <div class="sms-popup" id="smsPopup">
      <strong style="display:block; margin-bottom:4px; font-family:'Space Grotesk', sans-serif; font-size:11px; letter-spacing:0.04em; color:var(--brass);">MESSAGES (JUST NOW)</strong>
      <span>NOKKA Secure Pay: Your checkout verification code is <strong>4826</strong>. Do not share this OTP.</span>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', wizardHtml);

  // Dynamic QR Code Rendering Function
  function renderPhonePeQR() {
    const container = document.getElementById('phonepeQrContainer');
    if (!container) return;
    const upiUri = `upi://pay?pa=9538831664@axl&pn=NOKKA%20FURNITURE&am=${finalTotal}&cu=INR&tn=NOKKA-Order`;
    
    if (QRCodeGen && QRCodeGen.generateSvg) {
      container.innerHTML = QRCodeGen.generateSvg(upiUri, { size: 190, logo: 'phonepe', level: 'Q' });
    } else {
      // Clean fallback SVG with PhonePe badge
      container.innerHTML = `
        <svg viewBox="0 0 100 100" width="180" height="180" style="fill:#121118; margin:0 auto;">
          <rect x="0" y="0" width="28" height="28" rx="2"/>
          <rect x="5" y="5" width="18" height="18" fill="#FFFFFF"/>
          <rect x="9" y="9" width="10" height="10" fill="#121118"/>
          <rect x="72" y="0" width="28" height="28" rx="2"/>
          <rect x="77" y="5" width="18" height="18" fill="#FFFFFF"/>
          <rect x="81" y="9" width="10" height="10" fill="#121118"/>
          <rect x="0" y="72" width="28" height="28" rx="2"/>
          <rect x="5" y="77" width="18" height="18" fill="#FFFFFF"/>
          <rect x="9" y="81" width="10" height="10" fill="#121118"/>
          <rect x="36" y="8" width="10" height="26"/>
          <rect x="54" y="8" width="10" height="12"/>
          <rect x="8" y="38" width="22" height="10"/>
          <rect x="38" y="38" width="24" height="24" fill="#5f259f" rx="12"/>
          <text x="50" y="54" fill="#FFFFFF" font-family="sans-serif" font-size="14" font-weight="bold" text-anchor="middle">पे</text>
          <rect x="70" y="38" width="22" height="10"/>
          <rect x="36" y="68" width="28" height="10"/>
          <rect x="72" y="72" width="20" height="20"/>
        </svg>
      `;
    }

    const deeplink = document.getElementById('phonepeDeeplink');
    if (deeplink) deeplink.href = upiUri;

    const amountBadge = document.getElementById('phonepeAmountBadge');
    if (amountBadge) amountBadge.textContent = `₹ ${finalTotal.toLocaleString()}`;
  }

  // Initial QR render
  renderPhonePeQR();

  let shipDetails = {};

  // Pre-populate if saved address exists
  try {
    const saved = localStorage.getItem('nokka_saved_address');
    if (saved) {
      const addr = JSON.parse(saved);
      document.getElementById('shipName').value = addr.name || '';
      document.getElementById('shipEmail').value = addr.email || '';
      document.getElementById('shipPhone').value = addr.phone || '';
      document.getElementById('shipAddress').value = addr.address || '';
      document.getElementById('shipPin').value = addr.pincode || '';
    }
  } catch (e) {}
  try {
    const u = JSON.parse(localStorage.getItem('nokka_user') || 'null');
    if (u) {
      if (!document.getElementById('shipName').value) document.getElementById('shipName').value = u.name || '';
      if (!document.getElementById('shipEmail').value) document.getElementById('shipEmail').value = u.email || '';
    }
  } catch (e) {}
  
  window.goStep2 = function(e) {
    e.preventDefault();
    shipDetails = {
      name: document.getElementById('shipName').value,
      email: document.getElementById('shipEmail').value,
      phone: document.getElementById('shipPhone').value,
      address: document.getElementById('shipAddress').value,
      pincode: document.getElementById('shipPin').value
    };

    const saveCheck = document.getElementById('saveAddressCheck');
    if (saveCheck && saveCheck.checked) {
      localStorage.setItem('nokka_saved_address', JSON.stringify(shipDetails));
    }

    document.getElementById('step1').classList.remove('active');
    document.getElementById('step2').classList.add('active');

    // Auto-populate random transaction reference
    const refInput = document.getElementById('upiTxnRefInput');
    if (refInput && !refInput.value) {
      refInput.value = 'UPI-TXN-' + Math.floor(100000 + Math.random() * 900000);
    }
    renderPhonePeQR();
  };

  // Copy UPI ID function
  window.copyPhonePeUpiId = function() {
    const upiId = '9538831664@axl';
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(upiId).then(() => {
        const btn = document.getElementById('phonepeCopyBtn');
        if (btn) {
          btn.innerHTML = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#25D366" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
          setTimeout(() => {
            btn.innerHTML = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
          }, 2000);
        }
        showToast('UPI ID (9538831664@axl) copied!');
      }).catch(() => {
        showToast('UPI ID: 9538831664@axl');
      });
    } else {
      showToast('UPI ID: 9538831664@axl');
    }
  };

  // Download QR Code function
  window.downloadPhonePeQR = function() {
    const canvas = document.createElement('canvas');
    const size = 480;
    canvas.width = size;
    canvas.height = size + 140;
    const ctx = canvas.getContext('2d');

    // Draw dark background card
    ctx.fillStyle = '#12111A';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw header
    ctx.fillStyle = '#FAF8F5';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('NOKKA FURNITURE — MY QR', canvas.width / 2, 45);

    ctx.fillStyle = '#E2DED6';
    ctx.font = '15px sans-serif';
    ctx.fillText('Indian Bank... - 9890', canvas.width / 2, 75);

    // Draw QR canvas
    const qrCanvas = document.createElement('canvas');
    const upiUri = `upi://pay?pa=9538831664@axl&pn=NOKKA%20FURNITURE&am=${finalTotal}&cu=INR&tn=NOKKA-Order`;
    if (QRCodeGen && QRCodeGen.renderToCanvas) {
      QRCodeGen.renderToCanvas(qrCanvas, upiUri, { size: 360, logo: 'phonepe', level: 'Q' });
      ctx.drawImage(qrCanvas, (canvas.width - 360) / 2, 100);
    }

    // Draw UPI ID
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 18px monospace';
    ctx.fillText('UPI ID: 9538831664@axl', canvas.width / 2, 500);

    ctx.fillStyle = '#25D366';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText(`Amount: ₹ ${finalTotal.toLocaleString()}`, canvas.width / 2, 535);

    ctx.fillStyle = '#8e8371';
    ctx.font = '12px sans-serif';
    ctx.fillText('Scan with PhonePe, Google Pay, Paytm, or any UPI App', canvas.width / 2, 575);

    // Download
    const a = document.createElement('a');
    a.download = `PhonePe_NOKKA_QR_${finalTotal}.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
    showToast('PhonePe QR saved to downloads');
  };

  // Share PhonePe QR function
  window.sharePhonePeQR = function() {
    const upiUri = `upi://pay?pa=9538831664@axl&pn=NOKKA%20FURNITURE&am=${finalTotal}&cu=INR`;
    if (navigator.share) {
      navigator.share({
        title: 'Pay NOKKA Furniture via PhonePe / UPI',
        text: `Pay ₹${finalTotal.toLocaleString()} to NOKKA Furniture using UPI ID: 9538831664@axl`,
        url: upiUri
      }).catch(() => {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(upiUri);
      showToast('UPI Payment Link copied to clipboard');
    }
  };

  // Bind coupon listener
  const applyBtn = document.getElementById('applyCouponBtn');
  const couponInput = document.getElementById('couponCode');
  const statusEl = document.getElementById('couponStatus');
  
  if (applyBtn) {
    applyBtn.addEventListener('click', () => {
      const val = couponInput.value.trim().toUpperCase();
      let discount = 0;
      if (val === 'GOWDA10') {
        discount = Math.round(total * 0.1);
        statusEl.style.color = '#25D366';
        statusEl.textContent = 'Coupon GOWDA10 applied: Save 10% on checkout!';
        statusEl.style.display = 'block';
      } else if (val === 'NOKKA20') {
        discount = Math.round(total * 0.2);
        statusEl.style.color = '#25D366';
        statusEl.textContent = 'Coupon NOKKA20 applied: Save 20% on checkout!';
        statusEl.style.display = 'block';
      } else if (val === 'WELCOME5') {
        discount = Math.round(total * 0.05);
        statusEl.style.color = '#25D366';
        statusEl.textContent = 'Coupon WELCOME5 applied: Save 5% on checkout!';
        statusEl.style.display = 'block';
      } else if (val === 'FLAT3000') {
        discount = Math.min(3000, total);
        statusEl.style.color = '#25D366';
        statusEl.textContent = 'Coupon FLAT3000 applied: Save ₹3,000!';
        statusEl.style.display = 'block';
      } else if (val === '') {
        discount = 0;
        statusEl.style.display = 'none';
      } else {
        discount = 0;
        statusEl.style.color = 'var(--rust)';
        statusEl.textContent = 'Invalid coupon code.';
        statusEl.style.display = 'block';
      }
      
      const net = total - discount;
      const gst = Math.round(net * 0.18);
      finalTotal = net + gst + 1000;

      // Update total indicator on Step 1 if back-referenced
      const totalStep1 = document.getElementById('wizardStep1Total');
      if (totalStep1) totalStep1.textContent = `Total: ₹ ${finalTotal.toLocaleString()}`;
      
      // Update pay buttons labels
      const cardBtn = document.getElementById('cardPayBtn');
      if (cardBtn) cardBtn.textContent = `Pay ₹ ${finalTotal.toLocaleString()} →`;
      
      const upiBtn = document.getElementById('upiPayBtn');
      if (upiBtn) upiBtn.textContent = `Verify UPI ID & Confirm Order (₹ ${finalTotal.toLocaleString()}) →`;

      // Regenerate dynamic PhonePe QR
      renderPhonePeQR();
    });
  }

  window.switchPayTab = function(type) {
    const tabs = document.querySelectorAll('.payment-tab');
    tabs.forEach(t => t.classList.remove('active'));
    
    document.getElementById('payCardForm').style.display = 'none';
    document.getElementById('payUpiBlock').style.display = 'none';
    document.getElementById('payCodBlock').style.display = 'none';

    if (type === 'upi') {
      tabs[0].classList.add('active');
      document.getElementById('payUpiBlock').style.display = 'block';
      renderPhonePeQR();
    } else if (type === 'card') {
      tabs[1].classList.add('active');
      document.getElementById('payCardForm').style.display = 'block';
    } else {
      tabs[2].classList.add('active');
      document.getElementById('payCodBlock').style.display = 'block';
    }
  };

  window.triggerOTP = function(e, payType) {
    e.preventDefault();
    if (payType === 'upi') {
      window.upiPaymentDetails = {
        upi_app: document.getElementById('upiAppSelect').value,
        txn_ref: document.getElementById('upiTxnRefInput').value.trim() || ('UPI-TXN-' + Math.floor(100000 + Math.random() * 900000))
      };
      window.checkoutPayMethod = 'UPI';
    } else {
      window.upiPaymentDetails = null;
      window.checkoutPayMethod = 'Card';
    }

    document.getElementById('step2').classList.remove('active');
    document.getElementById('step3').classList.add('active');

    // Slide in SMS OTP popup notification
    setTimeout(() => {
      const popup = document.getElementById('smsPopup');
      if (popup) popup.classList.add('show');
    }, 800);
  };

  window.verifyOTP = function(e) {
    e.preventDefault();
    const entered = document.getElementById('otpCodeField').value;
    if (entered === '4826' || entered === '1234') {
      completeCheckout(window.checkoutPayMethod || 'Online');
    } else {
      alert("Invalid OTP code. Please check the SMS simulator code (4826).");
    }
  };

  window.completeCheckout = async function(payMethod) {
    // Remove Overlay
    const overlay = document.getElementById('checkoutWizardOverlay');
    const styl = document.getElementById('checkoutWizardStyles');
    if (overlay) overlay.remove();
    if (styl) styl.remove();
    
    const couponApplied = couponInput ? couponInput.value.trim().toUpperCase() : null;
    const upiDetails = window.upiPaymentDetails || {};

    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name: shipDetails.name,
          client_email: shipDetails.email,
          client_phone: shipDetails.phone,
          delivery_address: `${shipDetails.address}, Pincode: ${shipDetails.pincode}`,
          total_value: finalTotal,
          coupon: couponApplied,
          paymentMethod: payMethod,
          txn_ref: upiDetails.txn_ref || null,
          upi_app: upiDetails.upi_app || null,
          items: items
        })
      });
      if (response.ok) {
        const data = await response.json();
        showToast('Order queue slot secured!');
        cart = {};
        saveCart();

        // Save order ID to localStorage for Customer Dashboard auto loading
        localStorage.setItem('nokka_recent_order', data.orderId);
        
        // Open Invoice in new window
        window.open(`invoice.html?id=${data.orderId}`, '_blank');
      } else {
        const err = await response.json();
        alert("Checkout Failed: " + (err.error || "Server error"));
      }
    } catch (err) {
      console.error('API checkout offline, falling back to mock:', err);
      const orderId = 'NOKKA-ORD-' + Math.random().toString(36).substring(2, 8).toUpperCase();
      showToast('Offline Mock Order Placed');
      cart = {};
      saveCart();
      window.open(`invoice.html?id=${orderId}`, '_blank');
    }
  };
}

