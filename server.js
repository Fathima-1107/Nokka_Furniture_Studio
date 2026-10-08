// NOKKA Furniture — REST API Server & Static File Hosting

import express from 'express';
import cors from 'cors';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { initDb, query, run, get, getCollection } from './db.js';
import { adminRouter, adminAuth } from './admin-api.js';
import { signToken, verifyToken, hashPassword, checkPassword, isHashed, normEmail, bearer } from './auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(express.json());

// Host static assets and HTML pages
app.use(express.static(__dirname));

const ADMIN_PASSCODE = process.env.ADMIN_PASSCODE || 'NOKKA-STUDIO-2026';
app.post('/api/admin/login', (req, res) => {
  if (String(req.body.password || '').trim() === ADMIN_PASSCODE) return res.json({ token: signToken({ role: 'admin' }) });
  res.status(401).json({ error: 'Invalid passcode.' });
});
app.use(adminRouter);

// Initialize Database Table Structures
try {
  await initDb();
} catch (e) {
  console.error('Database schema creation failed:', e.message);
}

/* ======================================================================
   API ENDPOINTS
   ====================================================================== */

// --- AUTHENTICATION ENDPOINTS ---
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, loyalty_tier: u.loyalty_tier, token: signToken({ role: 'user', id: u.id, email: u.email }, 24 * 30) });
const findUser = async (email) => await getCollection('users').findOne({ email: normEmail(email) }) ||
  (await getCollection('users').find({}).toArray()).find(u => normEmail(u.email) === normEmail(email));

app.post('/api/auth/register', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim(), email = normEmail(req.body.email), password = String(req.body.password || '');
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, and password are required.' });
    if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    if (await findUser(email)) return res.status(400).json({ error: 'Email already registered. Please sign in.' });
    const user = { id: `USR-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`, name, email, password: hashPassword(password), loyalty_tier: 'Silver', status: 'active', created_at: new Date().toISOString().replace('T', ' ').substring(0, 19) };
    await getCollection('users').insertOne(user);
    res.status(201).json({ success: true, user: publicUser(user) });
  } catch (err) { res.status(500).json({ error: 'Registration failed: ' + err.message }); }
});

const attempts = new Map();
app.post('/api/auth/login', async (req, res) => {
  try {
    const key = normEmail(req.body.email) + '|' + req.ip, a = attempts.get(key);
    if (a && a.n >= 8 && Date.now() - a.t < 10 * 60e3) return res.status(429).json({ error: 'Too many failed attempts. Try again in a few minutes.' });
    const user = await findUser(req.body.email);
    if (!user || !checkPassword(String(req.body.password || ''), user.password)) {
      const c = attempts.get(key) || { n: 0 }; attempts.set(key, { n: c.n + 1, t: Date.now() });
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    attempts.delete(key);
    if (user.status === 'blocked' || user.loyalty_tier === 'Blocked') return res.status(403).json({ error: 'This account has been blocked. Please contact support.' });
    if (!isHashed(user.password)) await getCollection('users').updateOne({ id: user.id }, { $set: { password: hashPassword(req.body.password) } });
    res.json({ success: true, token: publicUser(user).token, user: publicUser(user) });
  } catch (err) { res.status(500).json({ error: 'Login failed: ' + err.message }); }
});

// --- Session helper: resolves the logged-in user from the Bearer token ---
async function sessionUser(req) {
  const p = verifyToken(bearer(req));
  if (!p || p.role !== 'user') return null;
  const u = await getCollection('users').findOne({ id: p.id });
  if (!u || u.status === 'blocked' || u.loyalty_tier === 'Blocked') return null;
  return u;
}

app.get('/api/auth/me', async (req, res) => {
  const u = await sessionUser(req);
  if (!u) return res.status(401).json({ error: 'Session expired. Please sign in again.' });
  res.json({ success: true, user: { id: u.id, name: u.name, email: u.email, loyalty_tier: u.loyalty_tier } });
});

app.post('/api/auth/change-password', async (req, res) => {
  try {
    const user = await sessionUser(req);
    if (!user) return res.status(401).json({ error: 'Please sign in again.' });
    const { oldPassword, newPassword } = req.body;
    if (!newPassword || String(newPassword).length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters.' });
    if (!checkPassword(String(oldPassword || ''), user.password)) return res.status(401).json({ error: 'Current password is incorrect.' });
    if (oldPassword === newPassword) return res.status(400).json({ error: 'New password must be different from the current one.' });
    await getCollection('users').updateOne({ id: user.id }, { $set: { password: hashPassword(newPassword) } });
    res.json({ success: true, message: 'Password updated successfully.' });
  } catch (err) { res.status(500).json({ error: 'Failed to update password: ' + err.message }); }
});

// Forgot password: one-time 6-digit code (valid 10 min, max 5 tries).
// No email provider is configured, so the code is printed in the server console and,
// unless NOKKA_SHOW_RESET_CODE=false, also returned to the page (demo mode).
const resetCodes = new Map();
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const email = normEmail(req.body.email);
    const user = email && await findUser(email);
    if (!user) return res.status(404).json({ error: 'No account found with this email.' });
    const code = String(Math.floor(100000 + Math.random() * 900000));
    resetCodes.set(user.id, { code, exp: Date.now() + 10 * 60e3, tries: 0 });
    console.log(`[NOKKA] Password reset code for ${user.email}: ${code}`);
    const show = process.env.NOKKA_SHOW_RESET_CODE !== 'false';
    res.json({ success: true, message: 'A 6-digit reset code has been generated.', ...(show ? { dev_code: code } : {}) });
  } catch (err) { res.status(500).json({ error: 'Could not start password reset: ' + err.message }); }
});

app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const user = await findUser(req.body.email);
    const rec = user && resetCodes.get(user.id);
    if (!user || !rec || rec.exp < Date.now()) return res.status(400).json({ error: 'Reset code expired. Please request a new one.' });
    if (!req.body.newPassword || String(req.body.newPassword).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    if (++rec.tries > 5) { resetCodes.delete(user.id); return res.status(429).json({ error: 'Too many attempts. Request a new code.' }); }
    if (String(req.body.code || '').trim() !== rec.code) return res.status(400).json({ error: 'Incorrect reset code.' });
    await getCollection('users').updateOne({ id: user.id }, { $set: { password: hashPassword(req.body.newPassword) } });
    resetCodes.delete(user.id);
    for (const k of [...attempts.keys()]) if (k.startsWith(normEmail(user.email) + '|')) attempts.delete(k);
    res.json({ success: true, message: 'Password reset successfully. You can now sign in.' });
  } catch (err) { res.status(500).json({ error: 'Failed to reset password: ' + err.message }); }
});

// 1. GET /api/products — Retrieve all items
app.get('/api/products', async (req, res) => {
  try {
    const products = await query('SELECT * FROM products');
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve products: ' + err.message });
  }
});

// 2. POST /api/products — Add custom prototype
app.post('/api/products', async (req, res) => {
  try {
    const { name, price, desc, material, dims, specs_joint, specs_finish, specs_fabric, builder, icon } = req.body;
    
    if (!name || !price) {
      return res.status(400).json({ error: 'Name and Price fields are mandatory.' });
    }

    const id = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    
    await run(`
      INSERT INTO products (id, name, price, material, dims, desc, specs_joint, specs_finish, specs_fabric, builder, icon, is_custom)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `, [
      id,
      name,
      parseInt(price),
      material || 'Solid Wood',
      dims || '120 × 40 × 85 cm',
      desc || 'Custom prototype bench.',
      specs_joint || 'Mortise-and-tenon joints.',
      specs_finish || 'Linseed oil coat.',
      specs_fabric || 'No fabric.',
      builder || 'bench',
      icon || '<rect x="20" y="30" width="120" height="60" stroke="currentColor" stroke-width="2.4" fill="none"/>'
    ]);

    const created = await get('SELECT * FROM products WHERE id = ?', [id]);
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create product prototype: ' + err.message });
  }
});

// 3. PUT /api/products/:id/price — Update product price (Admin CMS)
app.put('/api/products/:id/price', async (req, res) => {
  try {
    const { id } = req.params;
    const { price } = req.body;

    if (!price || isNaN(price)) {
      return res.status(400).json({ error: 'Valid price is required.' });
    }

    const result = await run('UPDATE products SET price = ? WHERE id = ?', [parseInt(price), id]);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    const updated = await get('SELECT * FROM products WHERE id = ?', [id]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update product price: ' + err.message });
  }
});

// 4. POST /api/enquiries — Submit customer consultation booking
app.post('/api/enquiries', async (req, res) => {
  try {
    const { user_name, user_email, enquiry_type, message } = req.body;
    
    if (!user_name || !user_email || !message) {
      return res.status(400).json({ error: 'Name, email, and message are required.' });
    }

    const result = await run(`
      INSERT INTO enquiries (user_name, user_email, enquiry_type, message)
      VALUES (?, ?, ?, ?)
    `, [user_name, user_email, enquiry_type || 'showroom', message]);

    const created = await get('SELECT * FROM enquiries WHERE id = ?', [result.id]);
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save enquiry booking: ' + err.message });
  }
});

// 5. GET /api/enquiries — Fetch all enquiry records (Admin)
app.get('/api/enquiries', async (req, res) => {
  try {
    const enquiries = await query('SELECT * FROM enquiries ORDER BY created_at DESC');
    res.json(enquiries);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve enquiries: ' + err.message });
  }
});

// 6. POST /api/orders — Secure order checkout
app.post('/api/orders', async (req, res) => {
  try {
    const { client_name, client_email, client_phone, total_value, items, coupon, delivery_address } = req.body;

    if (!client_name || !client_email || !client_phone || !delivery_address || !items || !items.length) {
      return res.status(400).json({ error: 'Checkout name, email, phone, address, and items are required.' });
    }

    // Calculate subtotal
    let subtotal = 0;
    for (const item of items) {
      subtotal += item.price * item.quantity;
    }

    // Calculate discount based on coupon
    let discount = 0;
    if (coupon) {
      const code = coupon.trim().toUpperCase();
      if (code === 'GOWDA10') {
        discount = Math.round(subtotal * 0.10);
      } else if (code === 'NOKKA20') {
        discount = Math.round(subtotal * 0.20);
      } else if (code === 'WELCOME5') {
        discount = Math.round(subtotal * 0.05);
      } else if (code === 'FLAT3000') {
        discount = Math.min(3000, subtotal);
      }
    }

    const netSubtotal = subtotal - discount;
    const gstTax = Math.round(netSubtotal * 0.18); // 18% GST for furniture
    const deliveryCharge = 1000;
    const installationCharge = 0;
    const grandTotal = netSubtotal + gstTax + deliveryCharge + installationCharge;

    // Generate Invoice Number
    const year = new Date().getFullYear();
    const orderYearCount = await get(`
      SELECT COUNT(*) AS count FROM orders 
      WHERE strftime('%Y', created_at) = ? 
         OR created_at LIKE ?
    `, [String(year), `${year}-%`]);
    const sequence = (orderYearCount ? orderYearCount.count : 0) + 128; // starting sequence helper
    const invoiceNumber = `NOK-${year}-${String(sequence).padStart(6, '0')}`;
    const orderId = 'NOKKA-ORD-' + Math.random().toString(36).substring(2, 8).toUpperCase();

    // 3 Days delivery timeframe (as requested for live delivery countdowns)
    const expectedDelivery = new Date();
    expectedDelivery.setDate(expectedDelivery.getDate() + 3); // 3 days
    const expectedDeliveryStr = expectedDelivery.toISOString().slice(0, 19).replace('T', ' ');

    const expectedDispatch = new Date();
    expectedDispatch.setDate(expectedDispatch.getDate() + 1); // 1 day
    const expectedDispatchStr = expectedDispatch.toISOString().slice(0, 19).replace('T', ' ');

    const paymentMethod = req.body.paymentMethod || 'Online';
    const paymentStatus = paymentMethod === 'COD' ? 'PENDING' : 'PAID';

    // Save order inside database transaction block
    await run(`
      INSERT INTO orders (id, invoice_number, customer_name, email, phone, delivery_address, coupon, discount, gst_tax, delivery_charge, installation_charge, grand_total, payment_method, payment_status, order_status, expected_delivery_date, expected_dispatch_date, delivery_window)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ORDER_PLACED', ?, ?, ?)
    `, [orderId, invoiceNumber, client_name, client_email, client_phone, delivery_address, coupon || null, discount, gstTax, deliveryCharge, installationCharge, grandTotal, paymentMethod, paymentStatus, expectedDeliveryStr, expectedDispatchStr, '10:00 AM – 6:00 PM']);

    // Save order items
    for (const item of items) {
      const opt = item.options || {};
      const wood = opt.wood || 'Teak Wood';
      const finish = opt.finish || 'Natural Finish';
      const fabric = opt.color || 'No Cushion';
      const sizeStr = opt.size || 'Standard Size';
      const materialDesc = `${wood.toUpperCase()} Frame, ${finish.toUpperCase()}`;
      
      // SKU Generation: NOK-[prod]-[wood]-[uph]-[color]
      const prodShort = item.product_id.replace('nokka_', '').substring(0, 5).toUpperCase();
      const woodShort = wood.substring(0, 4).toUpperCase();
      const uphShort = (opt.upholstery || 'wood').substring(0, 4).toUpperCase();
      const colorShort = fabric.substring(0, 4).toUpperCase();
      const productSku = `NOK-${prodShort}-${woodShort}-${uphShort}-${colorShort}`;

      await run(`
        INSERT INTO order_items (order_id, product_id, product_name, product_sku, material, color, size, quantity, unit_price)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [orderId, item.product_id, item.product_name || item.product_id.replace(/_/g, ' '), productSku, materialDesc, fabric, sizeStr, item.quantity, item.price]);
    }

    // Insert tracking logs
    await run('INSERT INTO order_tracking_log (order_id, status) VALUES (?, ?)', [orderId, 'ORDER_PLACED']);
    if (paymentStatus === 'PAID') {
      await run('INSERT INTO order_tracking_log (order_id, status) VALUES (?, ?)', [orderId, 'PAYMENT_CONFIRMED']);
    }

    // Insert UPI Payment details if paid via UPI
    if (paymentMethod === 'UPI') {
      const { txn_ref, upi_app } = req.body;
      if (txn_ref) {
        await run(`
          INSERT INTO upi_payments (payment_id, order_id, amount, payment_method, payment_status)
          VALUES (?, ?, ?, ?, 'PAID')
        `, [txn_ref, orderId, grandTotal, upi_app || 'UPI Web']);
      }
    }

    // Dispatch Simulated SMS & WhatsApp receipts
    if (client_phone) {
      const receiptMsg = `NOKKA Studio Receipt\nInvoice: ${invoiceNumber}\nOrder ID: ${orderId}\nClient: ${client_name}\nTotal: ₹ ${grandTotal.toLocaleString()}\nStatus: PAID (Swedish Batch Queue)\nExpected Delivery: ${expectedDelivery.toLocaleDateString('en-IN', {day:'2-digit', month:'short', year:'numeric'})}\nThank you!`;
      
      sendTwilioMessage(client_phone, receiptMsg, false).catch(err => {
        console.warn('SMS dispatch failed:', err.message);
      });
      sendTwilioMessage(client_phone, receiptMsg, true).catch(err => {
        console.warn('WhatsApp dispatch failed:', err.message);
      });
    }

    res.status(201).json({ success: true, orderId, invoiceNumber, total: grandTotal });
  } catch (err) {
    res.status(500).json({ error: 'Failed to place order: ' + err.message });
  }
});

// Twilio Helper for SMS/WhatsApp API calls
async function sendTwilioMessage(to, body, isWhatsApp = false) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = isWhatsApp ? process.env.TWILIO_WHATSAPP_NUMBER : process.env.TWILIO_PHONE_NUMBER;

  if (!sid || !token || !from) {
    console.log(`\n=================== [MESSAGING SIMULATOR] ===================\nTo: ${to}\nChannel: ${isWhatsApp ? 'WhatsApp' : 'SMS'}\nMessage:\n${body}\n=============================================================\n`);
    return false;
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const auth = Buffer.from(`${sid}:${token}`).toString('base64');
  
  const formattedFrom = isWhatsApp ? `whatsapp:${from}` : from;
  const formattedTo = isWhatsApp && !to.startsWith('whatsapp:') ? `whatsapp:${to}` : to;

  const params = new URLSearchParams();
  params.append('To', formattedTo);
  params.append('From', formattedFrom);
  params.append('Body', body);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params
    });
    return res.ok;
  } catch (err) {
    console.error('Twilio dispatch error:', err.message);
    return false;
  }
}

// 7. GET /api/orders — Fetch order transactions history
app.get('/api/orders', adminAuth, async (req, res) => {
  try {
    const orders = await query('SELECT * FROM orders ORDER BY created_at DESC');
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve orders: ' + err.message });
  }
});

// GET /api/orders/lookup — Customer dashboard lookup by email/phone/ID
app.get('/api/orders/lookup', async (req, res) => {
  try {
    const user = await sessionUser(req);
    if (!user) return res.status(401).json({ error: 'Please sign in to view your orders.' });
    const mine = normEmail(user.email);
    const orders = (await getCollection('orders').find({}).toArray())
      .filter(o => normEmail(o.email) === mine)
      .sort((x, y) => (y.created_at || '').localeCompare(x.created_at || ''));
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: 'Failed to lookup orders: ' + err.message });
  }
});

// GET /api/orders/:id — Fetch full order detail with items and logs
app.get('/api/orders/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const order = await get('SELECT * FROM orders WHERE id = ? OR invoice_number = ?', [id, id]);
    if (!order) {
      return res.status(404).json({ error: 'Order not found.' });
    }
    const items = await query('SELECT * FROM order_items WHERE order_id = ?', [order.id]);
    const logs = await query('SELECT * FROM order_tracking_log WHERE order_id = ? ORDER BY created_at ASC', [order.id]);
    const warranties = await query('SELECT * FROM warranties WHERE order_id = ?', [order.id]);
    res.json({ ...order, items, logs, warranties });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve order: ' + err.message });
  }
});

// PUT /api/orders/:id/status — Admin status updater
app.put('/api/orders/:id/status', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Status parameter is required.' });
    }

    const order = await get('SELECT * FROM orders WHERE id = ?', [id]);
    if (!order) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    await run('UPDATE orders SET order_status = ? WHERE id = ?', [status, id]);
    
    // Log action to audit logs
    await run('INSERT INTO audit_logs (action) VALUES (?)', [`Changed Order status of #${id} to ${status.replace(/_/g, ' ')}`]);
    
    // Auto pay / collect cash if delivered
    if (status === 'DELIVERED') {
      if (order.payment_method === 'COD') {
        const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
        await run("UPDATE orders SET payment_status = 'CASH_COLLECTED', collected_at = ? WHERE id = ?", [now, id]);
        await run('INSERT INTO audit_logs (action) VALUES (?)', [`Collected CASH ON DELIVERY payment of ₹${order.grand_total} for Order #${id}`]);
      } else {
        await run("UPDATE orders SET payment_status = 'PAID' WHERE id = ?", [id]);
      }
    }
    
    // Add tracking event log
    await run('INSERT INTO order_tracking_log (order_id, status) VALUES (?, ?)', [id, status]);

    res.json({ success: true, status });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update status: ' + err.message });
  }
});

// POST /api/orders/:id/cancel — Customer cancellation
app.post('/api/orders/:id/cancel', async (req, res) => {
  try {
    const { id } = req.params;
    const order = await get('SELECT * FROM orders WHERE id = ?', [id]);
    if (!order) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    const unallowed = ['SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'RETURNED', 'RETURN_REQUESTED'];
    if (unallowed.includes(order.order_status)) {
      return res.status(400).json({ error: `Cannot cancel order in status: ${order.order_status}` });
    }

    await run("UPDATE orders SET order_status = 'CANCELLED', payment_status = 'REFUNDED' WHERE id = ?", [id]);
    await run("INSERT INTO order_tracking_log (order_id, status) VALUES (?, 'CANCELLED')", [id]);

    res.json({ success: true, message: 'Order cancelled successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to cancel order: ' + err.message });
  }
});

// POST /api/orders/:id/return — Customer return
app.post('/api/orders/:id/return', async (req, res) => {
  try {
    const { id } = req.params;
    const { message } = req.body;
    const order = await get('SELECT * FROM orders WHERE id = ?', [id]);
    if (!order) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    if (order.order_status !== 'DELIVERED') {
      return res.status(400).json({ error: 'Return request only allowed for DELIVERED orders.' });
    }

    await run("UPDATE orders SET order_status = 'RETURN_REQUESTED' WHERE id = ?", [id]);
    await run("INSERT INTO order_tracking_log (order_id, status) VALUES (?, 'RETURN_REQUESTED')", [id]);
    
    // Add return enquiry
    await run(`
      INSERT INTO enquiries (user_name, user_email, enquiry_type, message)
      VALUES (?, ?, 'return', ?)
    `, [order.customer_name, order.email, `Return Request for Order #${id}: ${message || 'No details provided.'}`]);

    res.json({ success: true, message: 'Return request filed.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to process return: ' + err.message });
  }
});

// POST /api/orders/:id/warranty/register — Warranty registration
app.post('/api/orders/:id/warranty/register', async (req, res) => {
  try {
    const { id } = req.params;
    const { product_id, product_name } = req.body;

    const order = await get('SELECT * FROM orders WHERE id = ?', [id]);
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    const item = await get('SELECT * FROM order_items WHERE order_id = ? AND product_id = ?', [id, product_id]);
    if (!item) return res.status(400).json({ error: 'Product not in this order.' });

    // Check if already registered
    const existing = await get('SELECT * FROM warranties WHERE order_id = ? AND product_id = ?', [id, product_id]);
    if (existing) return res.status(400).json({ error: 'Warranty already registered for this item.' });

    await run(`
      INSERT INTO warranties (order_id, product_id, product_name, customer_name, customer_email, warranty_years, status)
      VALUES (?, ?, ?, ?, ?, 5, 'ACTIVE')
    `, [id, product_id, product_name, order.customer_name, order.email]);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Warranty registration failed: ' + err.message });
  }
});

// POST /api/orders/:id/warranty/claim — Warranty claim
app.post('/api/orders/:id/warranty/claim', async (req, res) => {
  try {
    const { id } = req.params;
    const { product_id, reason } = req.body;

    const wr = await get('SELECT * FROM warranties WHERE order_id = ? AND product_id = ?', [id, product_id]);
    if (!wr) return res.status(404).json({ error: 'Active warranty registration not found.' });

    await run(`
      UPDATE warranties 
      SET status = 'CLAIM_PENDING', claim_reason = ?, claim_date = CURRENT_TIMESTAMP
      WHERE order_id = ? AND product_id = ?
    `, [reason, id, product_id]);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Warranty claim failed: ' + err.message });
  }
});

// PUT /api/warranties/:id/status — Admin update warranty claim status
app.put('/api/warranties/:id/status', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // CLAIM_APPROVED or CLAIM_REJECTED or ACTIVE
    await run('UPDATE warranties SET status = ? WHERE id = ?', [status, id]);
    
    // Log action to audit logs
    await run('INSERT INTO audit_logs (action) VALUES (?)', [`Resolved Warranty Claim #${id} to status ${status.replace(/_/g, ' ')}`]);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update claim: ' + err.message });
  }
});

// GET /api/reports/:type — Admin report compiler
app.get('/api/reports/:type', adminAuth, async (req, res) => {
  try {
    const { type } = req.params;
    let data = [];
    
    if (type === 'daily') {
      data = await query(`
        SELECT date(created_at) AS date, COUNT(*) AS orders_count, SUM(grand_total) AS total_revenue, SUM(gst_tax) AS total_gst
        FROM orders
        WHERE order_status != 'CANCELLED'
        GROUP BY date(created_at)
        ORDER BY date DESC
      `);
    } else if (type === 'monthly') {
      data = await query(`
        SELECT strftime('%Y-%m', created_at) AS month, COUNT(*) AS orders_count, SUM(grand_total) AS total_revenue, SUM(gst_tax) AS total_gst
        FROM orders
        WHERE order_status != 'CANCELLED'
        GROUP BY strftime('%Y-%m', created_at)
        ORDER BY month DESC
      `);
    } else if (type === 'gst') {
      data = await query(`
        SELECT id AS order_id, invoice_number, customer_name, grand_total, (grand_total - gst_tax - delivery_charge) AS net_taxable, gst_tax AS gst_collected, created_at
        FROM orders
        WHERE order_status != 'CANCELLED'
        ORDER BY created_at DESC
      `);
    } else if (type === 'invoice') {
      data = await query(`
        SELECT id AS order_id, invoice_number, customer_name, email, grand_total, payment_status, created_at
        FROM orders
        ORDER BY created_at DESC
      `);
    } else if (type === 'products') {
      data = await query(`
        SELECT product_id, product_name, SUM(quantity) AS quantity_sold, SUM(quantity * unit_price) AS total_revenue
        FROM order_items
        INNER JOIN orders ON order_items.order_id = orders.id
        WHERE orders.order_status != 'CANCELLED'
        GROUP BY product_id, product_name
        ORDER BY quantity_sold DESC
      `);
    } else if (type === 'customers') {
      data = await query(`
        SELECT customer_name, email, phone, COUNT(id) AS orders_count, SUM(grand_total) AS total_spent
        FROM orders
        GROUP BY email
        ORDER BY total_spent DESC
      `);
    } else if (type === 'cancelled') {
      data = await query(`
        SELECT id AS order_id, invoice_number, customer_name, grand_total, payment_status, created_at
        FROM orders
        WHERE order_status = 'CANCELLED'
        ORDER BY created_at DESC
      `);
    } else if (type === 'warranty') {
      data = await query(`
        SELECT id AS warranty_id, order_id, product_name, customer_name, customer_email, status, claim_reason, claim_date
        FROM warranties
        ORDER BY claim_date DESC
      `);
    } else {
      return res.status(400).json({ error: 'Invalid report type.' });
    }
    
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate report: ' + err.message });
  }
});

// 8. GET /api/analytics — Fetch admin analytics
app.get('/api/analytics', async (req, res) => {
  try {
    const revenue = await get("SELECT SUM(grand_total) AS total FROM orders WHERE order_status != 'CANCELLED'");
    const orderCount = await get("SELECT COUNT(*) AS count FROM orders WHERE order_status != 'CANCELLED'");
    const avgTicket = await get("SELECT AVG(grand_total) AS avg FROM orders WHERE order_status != 'CANCELLED'");
    const customs = await get('SELECT COUNT(*) AS count FROM products WHERE is_custom = 1');
    const pendingWarranties = await get("SELECT COUNT(*) AS count FROM warranties WHERE status = 'CLAIM_PENDING'");

    res.json({
      revenue: revenue.total || 0,
      orderCount: orderCount.count || 0,
      avgTicket: Math.round(avgTicket.avg || 0),
      customPrototypes: customs.count || 0,
      pendingWarranties: pendingWarranties.count || 0,
      queueSlotsLeft: Math.max(1, 4 - ((orderCount.count || 0) % 4)) // Mock remaining queue slots left dynamically
    });
  } catch (err) {
    res.status(500).json({ error: 'Analytics compilation failed: ' + err.message });
  }
});

// 9. GET /api/admin/sales-analytics — Retrieve dynamic sales metrics
app.get('/api/admin/sales-analytics', adminAuth, async (req, res) => {
  try {
    const { range, start, end } = req.query;
    let sqlFilter = "1=1";
    let sqlParams = [];

    if (range === 'today') {
      sqlFilter = "strftime('%Y-%m-%d', created_at) = strftime('%Y-%m-%d', 'now')";
    } else if (range === 'yesterday') {
      sqlFilter = "strftime('%Y-%m-%d', created_at) = strftime('%Y-%m-%d', 'now', '-1 day')";
    } else if (range === '7days') {
      sqlFilter = "created_at >= datetime('now', '-7 days')";
    } else if (range === 'month') {
      sqlFilter = "strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')";
    } else if (range === 'lastmonth') {
      sqlFilter = "strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now', '-1 month')";
    } else if (range === 'custom' && start && end) {
      sqlFilter = "created_at BETWEEN ? AND ?";
      sqlParams = [start + ' 00:00:00', end + ' 23:59:59'];
    }

    const stats = await get(`
      SELECT 
        SUM(CASE WHEN order_status != 'CANCELLED' THEN grand_total ELSE 0 END) AS totalRevenue,
        COUNT(CASE WHEN order_status != 'CANCELLED' THEN 1 END) AS orderCount,
        SUM(CASE WHEN payment_status IN ('PAID', 'CASH_COLLECTED') AND order_status != 'CANCELLED' THEN grand_total ELSE 0 END) AS paidTotal,
        COUNT(CASE WHEN payment_status IN ('PAID', 'CASH_COLLECTED') AND order_status != 'CANCELLED' THEN 1 END) AS paidCount,
        SUM(CASE WHEN payment_status = 'PENDING' AND order_status != 'CANCELLED' THEN grand_total ELSE 0 END) AS pendingTotal,
        COUNT(CASE WHEN payment_status = 'PENDING' AND order_status != 'CANCELLED' THEN 1 END) AS pendingCount,
        SUM(CASE WHEN payment_status = 'REFUNDED' OR order_status = 'CANCELLED' THEN grand_total ELSE 0 END) AS refundedTotal,
        COUNT(CASE WHEN payment_status = 'REFUNDED' OR order_status = 'CANCELLED' THEN 1 END) AS refundedCount,
        SUM(CASE WHEN order_status = 'CANCELLED' THEN grand_total ELSE 0 END) AS cancelledTotal,
        COUNT(CASE WHEN order_status = 'CANCELLED' THEN 1 END) AS cancelledCount
      FROM orders
      WHERE ${sqlFilter}
    `, sqlParams);

    const revenue = stats.totalRevenue || 0;
    const orders = stats.orderCount || 0;
    const aov = orders > 0 ? Math.round(revenue / orders) : 0;

    res.json({
      totalRevenue: revenue,
      orderCount: orders,
      aov,
      paidTotal: stats.paidTotal || 0,
      paidCount: stats.paidCount || 0,
      pendingTotal: stats.pendingTotal || 0,
      pendingCount: stats.pendingCount || 0,
      refundedTotal: stats.refundedTotal || 0,
      refundedCount: stats.refundedCount || 0,
      cancelledTotal: stats.cancelledTotal || 0,
      cancelledCount: stats.cancelledCount || 0
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to compute sales analytics: ' + err.message });
  }
});

// GET /api/admin/payments-breakdown — Payment breakdown summary counts
app.get('/api/admin/payments-breakdown', adminAuth, async (req, res) => {
  try {
    const breakdown = await query(`
      SELECT payment_method, COUNT(*) AS count, SUM(grand_total) AS total 
      FROM orders 
      WHERE order_status != 'CANCELLED' 
      GROUP BY payment_method
    `);
    res.json(breakdown);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve payments breakdown: ' + err.message });
  }
});

// GET /api/admin/products/:id/stats — Product stats drilldown modal data
app.get('/api/admin/products/:id/stats', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const prod = await get('SELECT name, price FROM products WHERE id = ?', [id]);
    if (!prod) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    const stats = await get(`
      SELECT 
        SUM(quantity) AS unitsSold,
        SUM(quantity * unit_price) AS revenue
      FROM order_items
      JOIN orders ON order_items.order_id = orders.id
      WHERE order_items.product_id = ? AND orders.order_status != 'CANCELLED'
    `, [id]);

    const returns = await get(`
      SELECT COUNT(*) AS count
      FROM orders
      JOIN order_items ON orders.id = order_items.order_id
      WHERE order_items.product_id = ? AND orders.order_status = 'RETURN_REQUESTED'
    `, [id]);

    res.json({
      id,
      name: prod.name,
      unitsSold: stats.unitsSold || 0,
      revenue: stats.revenue || 0,
      stock: 45, // dynamic simulated stock level
      returns: returns.count || 0,
      rating: 4.8
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch product stats: ' + err.message });
  }
});

// PUT /api/orders/:id/status — Update order status
app.put('/api/orders/:id/status', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    await run('UPDATE orders SET order_status = ? WHERE id = ?', [status, id]);
    res.json({ success: true, status });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update order: ' + err.message });
  }
});

// PUT /api/products/:id — Edit product
app.put('/api/products/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, price, desc, category, images, model, stock } = req.body;
    await run('UPDATE products SET name=?, price=?, desc=?, category=?, images=?, model=?, stock=? WHERE id=?', 
      [name, parseInt(price), desc, category || 'Chairs', images || '', model || '', parseInt(stock) || 10, id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update product: ' + err.message });
  }
});

// DELETE /api/products/:id — Delete product
app.delete('/api/products/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    await run('DELETE FROM products WHERE id=?', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete product: ' + err.message });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`NOKKA backend listening on: http://localhost:${PORT}`);
});
