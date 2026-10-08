// NOKKA — Admin REST API (orders, users, products, overview, audit log)
import { Router } from 'express';
import { getCollection } from './db.js';
import { verifyToken, hashPassword, bearer } from './auth.js';

export const adminRouter = Router();
const now = () => new Date().toISOString().replace('T', ' ').substring(0, 19);
const col = (n) => getCollection(n);
const all = async (n) => await col(n).find({}).toArray();
const audit = (action) => col('audit_logs').insertOne({ action, admin_user: 'admin', created_at: now() });
const safeUser = ({ password, ...u }) => u;

export function adminAuth(req, res, next) {
  const p = verifyToken(bearer(req));
  if (!p || p.role !== 'admin') return res.status(401).json({ error: 'Session expired. Please sign in again.' });
  next();
}
const wrap = (fn) => async (req, res) => { try { await fn(req, res); } catch (e) { res.status(500).json({ error: e.message }); } };
adminRouter.use('/api/admin', (req, res, next) => (req.path === '/login' ? next() : adminAuth(req, res, next)));

adminRouter.get('/api/admin/overview', wrap(async (req, res) => {
  const [orders, users, products] = await Promise.all([all('orders'), all('users'), all('products')]);
  const live = orders.filter(o => o.order_status !== 'CANCELLED');
  const byStatus = {}, byPay = {}, daily = {}, topMap = {};
  orders.forEach(o => { byStatus[o.order_status] = (byStatus[o.order_status] || 0) + 1; });
  live.forEach(o => {
    const m = o.payment_method || 'Other'; byPay[m] = byPay[m] || { count: 0, total: 0 };
    byPay[m].count++; byPay[m].total += o.grand_total || 0;
    const d = (o.created_at || '').substring(0, 10); daily[d] = (daily[d] || 0) + (o.grand_total || 0);
  });
  (await all('order_items')).forEach(i => {
    const k = i.product_name || i.product_id; topMap[k] = topMap[k] || { name: k, qty: 0, revenue: 0 };
    topMap[k].qty += i.quantity || 1; topMap[k].revenue += (i.quantity || 1) * (i.unit_price || 0);
  });
  const days = Object.keys(daily).sort().slice(-14).map(d => ({ date: d, revenue: daily[d] }));
  res.json({
    revenue: live.reduce((s, o) => s + (o.grand_total || 0), 0), orders: orders.length, users: users.length, products: products.length,
    pending: orders.filter(o => !['DELIVERED', 'CANCELLED', 'RETURNED', 'REFUNDED'].includes(o.order_status)).length,
    byStatus, byPay, days, lowStock: products.filter(p => (p.stock ?? 25) < 5).length,
    top: Object.values(topMap).sort((a, b) => b.revenue - a.revenue).slice(0, 5),
    recent: orders.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')).slice(0, 6),
    logs: (await all('audit_logs')).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')).slice(0, 8)
  });
}));

adminRouter.get('/api/admin/orders', wrap(async (req, res) => {
  res.json((await all('orders')).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')));
}));
adminRouter.get('/api/admin/orders/:id', wrap(async (req, res) => {
  const order = await col('orders').findOne({ id: req.params.id });
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  const items = (await col('order_items').find({ order_id: order.id }).toArray());
  const logs = (await col('order_tracking_log').find({ order_id: order.id }).toArray());
  res.json({ ...order, items, logs });
}));
adminRouter.put('/api/admin/orders/:id/status', wrap(async (req, res) => {
  const { id } = req.params, { status } = req.body;
  const valid = ['ORDER_PLACED', 'PAYMENT_CONFIRMED', 'PROCESSING', 'PREPARING', 'QUALITY_CHECKED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'RETURN_REQUESTED', 'RETURNED', 'REFUNDED'];
  if (!valid.includes(status)) return res.status(400).json({ error: 'Invalid status.' });
  const order = await col('orders').findOne({ id });
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  const set = { order_status: status };
  if (status === 'DELIVERED') { if (order.payment_method === 'COD') { set.payment_status = 'CASH_COLLECTED'; set.collected_at = now(); } else set.payment_status = 'PAID'; }
  await col('orders').updateOne({ id }, { $set: set });
  await col('order_tracking_log').insertOne({ order_id: id, status, created_at: now() });
  await audit(`Changed order #${id} status to ${status.replace(/_/g, ' ')}`);
  res.json({ success: true, ...set });
}));

adminRouter.get('/api/admin/users', wrap(async (req, res) => {
  const [users, orders] = await Promise.all([all('users'), all('orders')]);
  res.json(users.map(u => {
    const mine = orders.filter(o => (o.email || '').toLowerCase() === (u.email || '').toLowerCase());
    return { ...safeUser(u), status: u.status || 'active', orders_count: mine.length, total_spent: mine.filter(o => o.order_status !== 'CANCELLED').reduce((s, o) => s + (o.grand_total || 0), 0) };
  }));
}));
adminRouter.put('/api/admin/users/:id/block', wrap(async (req, res) => {
  const status = req.body.status === 'blocked' || req.body.status === 'Blocked' ? 'blocked' : 'active';
  const u = await col('users').findOne({ id: req.params.id });
  if (!u) return res.status(404).json({ error: 'User not found.' });
  await col('users').updateOne({ id: u.id }, { $set: { status } });
  await audit(`${status === 'blocked' ? 'Blocked' : 'Unblocked'} user ${u.email}`);
  res.json({ success: true, status });
}));
adminRouter.post('/api/admin/users/:id/reset-password', wrap(async (req, res) => {
  const pw = String(req.body.password || '');
  if (pw.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  const u = await col('users').findOne({ id: req.params.id });
  if (!u) return res.status(404).json({ error: 'User not found.' });
  await col('users').updateOne({ id: u.id }, { $set: { password: hashPassword(pw) } });
  await audit(`Reset password for ${u.email}`);
  res.json({ success: true });
}));
adminRouter.delete('/api/admin/users/:id', wrap(async (req, res) => {
  const u = await col('users').findOne({ id: req.params.id });
  if (!u) return res.status(404).json({ error: 'User not found.' });
  await col('users').deleteOne({ id: u.id });
  await audit(`Deleted user ${u.email}`);
  res.json({ success: true });
}));

const pick = (b) => ({ name: b.name, price: parseInt(b.price) || 0, category: b.category || 'other', desc: b.desc || '', material: b.material || 'Solid Wood', stock: parseInt(b.stock) || 0 });
adminRouter.get('/api/admin/products', wrap(async (req, res) => res.json(await all('products'))));
adminRouter.post('/api/admin/products', wrap(async (req, res) => {
  const p = pick(req.body);
  if (!p.name || !p.price) return res.status(400).json({ error: 'Name and price are required.' });
  const id = p.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  if (await col('products').findOne({ id })) return res.status(400).json({ error: 'A product with this name already exists.' });
  await col('products').insertOne({ id, ...p, builder: 'bench', rating: 5.0, is_custom: 0, icon: '<rect x="20" y="30" width="120" height="60" stroke="currentColor" stroke-width="2.4" fill="none"/>' });
  await audit(`Added product ${p.name}`);
  res.status(201).json({ success: true, id });
}));
adminRouter.put('/api/admin/products/:id', wrap(async (req, res) => {
  const p = pick(req.body);
  if (!(await col('products').findOne({ id: req.params.id }))) return res.status(404).json({ error: 'Product not found.' });
  await col('products').updateOne({ id: req.params.id }, { $set: p });
  await audit(`Edited product ${p.name}`);
  res.json({ success: true });
}));
adminRouter.delete('/api/admin/products/:id', wrap(async (req, res) => {
  await col('products').deleteOne({ id: req.params.id });
  await audit(`Deleted product ${req.params.id}`);
  res.json({ success: true });
}));
adminRouter.get('/api/admin/audit-logs', wrap(async (req, res) => {
  res.json((await all('audit_logs')).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')).slice(0, 100));
}));
