import fs from 'fs';
import path from 'path';
import { MongoClient } from 'mongodb';

// Local file-based mock collection system to act as a fallback in case MongoDB is stopped
class FileCollection {
  constructor(name) {
    this.name = name;
    this.dir = './data/db';
    if (!fs.existsSync(this.dir)) {
      fs.mkdirSync(this.dir, { recursive: true });
    }
    this.file = path.join(this.dir, `${name}.json`);
  }

  read() {
    if (!fs.existsSync(this.file)) return [];
    try {
      return JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch (e) {
      return [];
    }
  }

  write(data) {
    fs.writeFileSync(this.file, JSON.stringify(data, null, 2), 'utf8');
  }

  find(query = {}) {
    let docs = this.read();
    
    // Support MongoDB query operators like $or, $ne, $regex
    docs = docs.filter(doc => {
      for (const key in query) {
        const val = query[key];
        if (key === '$or') {
          return val.some(subQuery => {
            return Object.keys(subQuery).every(k => doc[k] === subQuery[k]);
          });
        }
        if (val && typeof val === 'object') {
          if ('$ne' in val && doc[key] === val.$ne) return false;
          if ('$regex' in val) {
            const re = new RegExp(val.$regex);
            if (!re.test(doc[key] || '')) return false;
          }
        } else if (doc[key] !== val) {
          return false;
        }
      }
      return true;
    });

    return {
      sort: (sortObj) => {
        const key = Object.keys(sortObj)[0];
        const dir = sortObj[key];
        docs.sort((a, b) => {
          if (a[key] < b[key]) return -1 * dir;
          if (a[key] > b[key]) return 1 * dir;
          return 0;
        });
        return {
          limit: (n) => {
            return {
              toArray: async () => docs.slice(0, n)
            };
          },
          toArray: async () => docs
        };
      },
      limit: (n) => {
        return {
          toArray: async () => docs.slice(0, n)
        };
      },
      toArray: async () => docs
    };
  }

  async findOne(query = {}) {
    let docs = this.read();
    return docs.find(doc => {
      for (const key in query) {
        if (doc[key] !== query[key]) return false;
      }
      return true;
    }) || null;
  }

  async insertOne(doc) {
    let docs = this.read();
    docs.push(doc);
    this.write(docs);
    return { insertedId: doc._id || doc.id };
  }

  async insertMany(newDocs) {
    let docs = this.read();
    docs.push(...newDocs);
    this.write(docs);
    return { insertedCount: newDocs.length };
  }

  async updateOne(query, update) {
    let docs = this.read();
    let index = docs.findIndex(doc => {
      for (const key in query) {
        if (doc[key] !== query[key]) return false;
      }
      return true;
    });
    if (index !== -1 && update.$set) {
      docs[index] = { ...docs[index], ...update.$set };
      this.write(docs);
      return { modifiedCount: 1 };
    }
    return { modifiedCount: 0 };
  }

  async updateMany(query, update) {
    let docs = this.read();
    let count = 0;
    docs.forEach(doc => {
      let match = true;
      for (const key in query) {
        if (doc[key] !== query[key]) match = false;
      }
      if (match && update.$set) {
        Object.assign(doc, update.$set);
        count++;
      }
    });
    if (count > 0) this.write(docs);
    return { modifiedCount: count };
  }

  async deleteOne(query = {}) {
    const docs = this.read();
    const idx = docs.findIndex(doc => Object.keys(query).every(k => doc[k] === query[k]));
    if (idx >= 0) { docs.splice(idx, 1); this.write(docs); }
    return { deletedCount: idx >= 0 ? 1 : 0 };
  }

  async deleteMany(query = {}) {
    let docs = this.read();
    const initialLen = docs.length;
    docs = docs.filter(doc => {
      for (const key in query) {
        if (doc[key] === query[key]) return false;
      }
      return true;
    });
    this.write(docs);
    return { deletedCount: initialLen - docs.length };
  }

  async countDocuments(query = {}) {
    let docs = this.read();
    docs = docs.filter(doc => {
      for (const key in query) {
        if (doc[key] !== query[key]) return false;
      }
      return true;
    });
    return docs.length;
  }
}

let useRealMongo = false;
let mongoDb = null;

export async function connectMongo() {
  try {
    const client = new MongoClient('mongodb://localhost:27017', { connectTimeoutMS: 2000, serverSelectionTimeoutMS: 2000 });
    await client.connect();
    mongoDb = client.db('nokka');
    useRealMongo = true;
    console.log('Connected to real MongoDB Server at: mongodb://localhost:27017');
  } catch (e) {
    console.log('MongoDB server not running or connection failed. Falling back to local file-based MongoDB engine.');
  }
}

export function getCollection(name) {
  if (useRealMongo && mongoDb) {
    return mongoDb.collection(name);
  } else {
    return new FileCollection(name);
  }
}

// Backward-compatible query handlers that translate SQL calls to MongoDB operations
async function translateAndExecute(sql, params = []) {
  const norm = sql.trim().replace(/\s+/g, ' ');
  const normLower = norm.toLowerCase();
  
  if (normLower === 'select * from products') {
    return await getCollection('products').find({}).toArray();
  }
  
  if (normLower === 'select * from users order by created_at desc') {
    return await getCollection('users').find({}).sort({ created_at: -1 }).toArray();
  }

  if (normLower.startsWith('select * from users where email = ?')) {
    return await getCollection('users').find({ email: params[0] }).toArray();
  }
  
  if (normLower === 'select * from enquiries order by created_at desc') {
    return await getCollection('enquiries').find({}).sort({ created_at: -1 }).toArray();
  }
  
  if (normLower === 'select * from orders order by created_at desc') {
    return await getCollection('orders').find({}).sort({ created_at: -1 }).toArray();
  }
  
  if (normLower.startsWith('select * from orders where email = ? or phone = ?')) {
    return await getCollection('orders').find({ $or: [{ email: params[0] }, { phone: params[1] }] }).toArray();
  }
  
  if (normLower.startsWith('select * from orders where id = ?')) {
    return await getCollection('orders').find({ id: params[0] }).toArray();
  }
  
  if (normLower.startsWith('select * from order_items where order_id = ?')) {
    return await getCollection('order_items').find({ order_id: params[0] }).toArray();
  }
  
  if (normLower.startsWith('select * from order_tracking_log where order_id = ? order by created_at asc')) {
    return await getCollection('order_tracking_log').find({ order_id: params[0] }).sort({ created_at: 1 }).toArray();
  }
  
  if (normLower.startsWith('select * from warranties where order_id = ?')) {
    return await getCollection('warranties').find({ order_id: params[0] }).toArray();
  }
  
  if (normLower.startsWith('select * from warranties where id = ?')) {
    return await getCollection('warranties').find({ id: parseInt(params[0]) }).toArray();
  }
  
  if (normLower.startsWith('select * from audit_logs order by created_at desc limit 50')) {
    return await getCollection('audit_logs').find({}).sort({ created_at: -1 }).limit(50).toArray();
  }
  
  if (normLower.startsWith('select rating from products where id = ?')) {
    const products = await getCollection('products').find({ id: params[0] }).toArray();
    return products.map(p => ({ rating: p.rating }));
  }
  
  if (normLower.includes("where strftime('%y', created_at) = ?")) {
    const yearStr = params[0];
    const c = await getCollection('orders').countDocuments({ created_at: { $regex: '^' + yearStr } });
    return [{ count: c }];
  }

  if (normLower === 'select count(*) as count from orders') {
    const c = await getCollection('orders').countDocuments({});
    return [{ count: c }];
  }
  
  if (normLower === "select count(*) as count from orders where date(created_at) = date('now')") {
    const todayStr = new Date().toISOString().split('T')[0];
    const c = await getCollection('orders').countDocuments({ created_at: { $regex: '^' + todayStr } });
    return [{ count: c }];
  }
  
  if (normLower === "select sum(grand_total) as total from orders where payment_status = 'paid' and order_status != 'cancelled'") {
    const docs = await getCollection('orders').find({ payment_status: 'PAID', order_status: { $ne: 'CANCELLED' } }).toArray();
    const sum = docs.reduce((acc, d) => acc + d.grand_total, 0);
    return [{ total: sum }];
  }
  
  if (normLower === 'select count(distinct email) as count from orders') {
    const docs = await getCollection('orders').find({}).toArray();
    const uniq = new Set(docs.map(d => d.email));
    return [{ count: uniq.size }];
  }
  
  if (normLower === "select sum(grand_total) as total from orders where date(created_at) = date('now') and order_status != 'cancelled'") {
    const todayStr = new Date().toISOString().split('T')[0];
    const docs = await getCollection('orders').find({ created_at: { $regex: '^' + todayStr }, order_status: { $ne: 'CANCELLED' } }).toArray();
    const sum = docs.reduce((acc, d) => acc + d.grand_total, 0);
    return [{ total: sum }];
  }
  
  if (normLower === "select payment_method, count(*) as count, sum(grand_total) as total_amount from orders where order_status != 'cancelled' group by payment_method") {
    const docs = await getCollection('orders').find({ order_status: { $ne: 'CANCELLED' } }).toArray();
    const groups = {};
    docs.forEach(d => {
      const pm = d.payment_method;
      if (!groups[pm]) groups[pm] = { payment_method: pm, count: 0, total_amount: 0 };
      groups[pm].count++;
      groups[pm].total_amount += d.grand_total;
    });
    return Object.values(groups);
  }
  
  if (normLower.startsWith('select count(*) as count, sum(unit_price * quantity) as total_revenue from order_items where product_id = ?')) {
    const docs = await getCollection('order_items').find({ product_id: params[0] }).toArray();
    const sum = docs.reduce((acc, d) => acc + (d.unit_price * d.quantity), 0);
    return [{ count: docs.length, total_revenue: sum }];
  }
  
  if (normLower.startsWith("select count(*) as return_count from warranties where product_id = ? and status = 'claimed'")) {
    const count = await getCollection('warranties').countDocuments({ product_id: params[0], status: 'CLAIMED' });
    return [{ return_count: count }];
  }

  // --- REPORT COMPILER MAPPINGS ---
  if (normLower.includes('group by date(created_at)')) { // daily report
    const docs = await getCollection('orders').find({ order_status: { $ne: 'CANCELLED' } }).toArray();
    const groups = {};
    docs.forEach(d => {
      const date = d.created_at.substring(0, 10);
      if (!groups[date]) groups[date] = { date, orders_count: 0, total_revenue: 0, total_gst: 0 };
      groups[date].orders_count++;
      groups[date].total_revenue += d.grand_total;
      groups[date].total_gst += d.gst_tax;
    });
    return Object.values(groups).sort((a, b) => b.date.localeCompare(a.date));
  }

  if (normLower.includes("group by strftime('%y-%m', created_at)")) { // monthly report
    const docs = await getCollection('orders').find({ order_status: { $ne: 'CANCELLED' } }).toArray();
    const groups = {};
    docs.forEach(d => {
      const month = d.created_at.substring(0, 7);
      if (!groups[month]) groups[month] = { month, orders_count: 0, total_revenue: 0, total_gst: 0 };
      groups[month].orders_count++;
      groups[month].total_revenue += d.grand_total;
      groups[month].total_gst += d.gst_tax;
    });
    return Object.values(groups).sort((a, b) => b.month.localeCompare(a.month));
  }

  if (normLower.includes('net_taxable') && normLower.includes('gst_collected')) { // gst report
    const docs = await getCollection('orders').find({ order_status: { $ne: 'CANCELLED' } }).toArray();
    return docs.map(d => ({
      order_id: d.id,
      invoice_number: d.invoice_number,
      customer_name: d.customer_name,
      grand_total: d.grand_total,
      net_taxable: d.grand_total - d.gst_tax - d.delivery_charge,
      gst_collected: d.gst_tax,
      created_at: d.created_at
    })).sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  if (normLower.includes('customer_name, email, grand_total, payment_status') && !normLower.includes('where order_status')) { // invoice list report
    const docs = await getCollection('orders').find({}).toArray();
    return docs.map(d => ({
      order_id: d.id,
      invoice_number: d.invoice_number,
      customer_name: d.customer_name,
      email: d.email,
      grand_total: d.grand_total,
      payment_status: d.payment_status,
      created_at: d.created_at
    })).sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  if (normLower.includes('quantity_sold') && normLower.includes('total_revenue')) { // products report
    const items = await getCollection('order_items').find({}).toArray();
    const orders = await getCollection('orders').find({ order_status: { $ne: 'CANCELLED' } }).toArray();
    const validOrderIds = new Set(orders.map(o => o.id));
    
    const groups = {};
    items.forEach(item => {
      if (validOrderIds.has(item.order_id)) {
        const pid = item.product_id;
        if (!groups[pid]) groups[pid] = { product_id: pid, product_name: item.product_name, quantity_sold: 0, total_revenue: 0 };
        groups[pid].quantity_sold += item.quantity;
        groups[pid].total_revenue += (item.quantity * item.unit_price);
      }
    });
    return Object.values(groups).sort((a, b) => b.quantity_sold - a.quantity_sold);
  }

  if (normLower.includes('group by email') && normLower.includes('total_spent')) { // customers report
    const docs = await getCollection('orders').find({}).toArray();
    const groups = {};
    docs.forEach(d => {
      const email = d.email;
      if (!groups[email]) groups[email] = { customer_name: d.customer_name, email, phone: d.phone, orders_count: 0, total_spent: 0 };
      groups[email].orders_count++;
      groups[email].total_spent += d.grand_total;
    });
    return Object.values(groups).sort((a, b) => b.total_spent - a.total_spent);
  }

  if (normLower.includes("where order_status = 'cancelled'")) { // cancelled report
    const docs = await getCollection('orders').find({ order_status: 'CANCELLED' }).toArray();
    return docs.map(d => ({
      order_id: d.id,
      invoice_number: d.invoice_number,
      customer_name: d.customer_name,
      grand_total: d.grand_total,
      payment_status: d.payment_status,
      created_at: d.created_at
    })).sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  if (normLower.includes('warranty_id') && normLower.includes('claim_date')) { // warranty report
    const docs = await getCollection('warranties').find({}).toArray();
    return docs.map(d => ({
      warranty_id: d.id,
      order_id: d.order_id,
      product_name: d.product_name,
      customer_name: d.customer_name,
      customer_email: d.customer_email,
      status: d.status,
      claim_reason: d.claim_reason,
      claim_date: d.claim_date
    })).sort((a, b) => (b.claim_date || '').localeCompare(a.claim_date || ''));
  }

  // --- INSERTS ---
  if (normLower.startsWith('insert into products')) {
    await getCollection('products').insertOne({
      id: params[0],
      name: params[1],
      price: params[2],
      original_price: params[2] * 1.2,
      material: params[3],
      dims: params[4],
      desc: params[5],
      specs: {
        joint: params[6],
        finish: params[7],
        fabric: params[8]
      },
      builder: params[9],
      icon: params[10],
      is_custom: 1
    });
    return { changes: 1 };
  }
  if (normLower.startsWith('insert into users')) {
    await getCollection('users').insertOne({
      id: params[0],
      name: params[1],
      email: params[2],
      password: params[3],
      loyalty_tier: params[4],
      created_at: params[5] || new Date().toISOString().replace('T', ' ').substring(0, 19)
    });
    return { changes: 1 };
  }
  if (normLower.startsWith('insert into enquiries')) {
    await getCollection('enquiries').insertOne({
      user_name: params[0],
      user_email: params[1],
      enquiry_type: params[2],
      message: params[3],
      created_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
    });
    return { changes: 1 };
  }

  if (normLower.startsWith('insert into orders')) {
    const isHardcodedPlaced = normLower.includes("'order_placed'");
    const orderStatus = isHardcodedPlaced ? 'ORDER_PLACED' : params[14];
    const expectedDelivery = isHardcodedPlaced ? params[14] : params[15];
    const expectedDispatch = isHardcodedPlaced ? params[15] : params[16];
    const deliveryWindow = isHardcodedPlaced ? params[16] : params[17];
    const collectedAt = isHardcodedPlaced ? (params[17] || null) : (params[18] || null);
    const createdAt = isHardcodedPlaced ? (params[18] || new Date().toISOString().replace('T', ' ').substring(0, 19)) : (params[19] || new Date().toISOString().replace('T', ' ').substring(0, 19));

    await getCollection('orders').insertOne({
      id: params[0],
      invoice_number: params[1],
      customer_name: params[2],
      email: params[3],
      phone: params[4],
      delivery_address: params[5],
      coupon: params[6],
      discount: params[7],
      gst_tax: params[8],
      delivery_charge: params[9],
      installation_charge: params[10],
      grand_total: params[11],
      payment_method: params[12],
      payment_status: params[13],
      order_status: orderStatus,
      expected_delivery_date: expectedDelivery,
      expected_dispatch_date: expectedDispatch,
      delivery_window: deliveryWindow,
      collected_at: collectedAt,
      created_at: createdAt
    });
    return { changes: 1 };
  }

  if (normLower.startsWith('insert into order_items')) {
    await getCollection('order_items').insertOne({
      order_id: params[0],
      product_id: params[1],
      product_name: params[2],
      product_sku: params[3],
      material: params[4],
      color: params[5],
      size: params[6],
      quantity: params[7],
      unit_price: params[8]
    });
    return { changes: 1 };
  }

  if (normLower.startsWith('insert into order_tracking_log')) {
    await getCollection('order_tracking_log').insertOne({
      order_id: params[0],
      status: params[1],
      created_at: params[2] || new Date().toISOString().replace('T', ' ').substring(0, 19)
    });
    return { changes: 1 };
  }

  if (normLower.startsWith('insert into upi_payments')) {
    await getCollection('upi_payments').insertOne({
      payment_id: params[0],
      order_id: params[1],
      amount: params[2],
      payment_method: params[3],
      payment_status: params[4],
      created_at: params[5] || new Date().toISOString().replace('T', ' ').substring(0, 19)
    });
    return { changes: 1 };
  }

  if (normLower.startsWith('insert into audit_logs')) {
    await getCollection('audit_logs').insertOne({
      action: params[0],
      admin_user: params[1] || 'admin',
      created_at: params[2] || new Date().toISOString().replace('T', ' ').substring(0, 19)
    });
    return { changes: 1 };
  }

  if (normLower.startsWith('insert into warranties')) {
    const nextId = Date.now() + Math.floor(Math.random() * 1000);
    await getCollection('warranties').insertOne({
      id: nextId,
      order_id: params[0],
      product_id: params[1],
      product_name: params[2],
      customer_name: params[3],
      customer_email: params[4],
      warranty_years: params[5],
      registered_at: params[6] || new Date().toISOString().replace('T', ' ').substring(0, 19),
      status: params[7] || 'ACTIVE',
      claim_reason: params[8] || null,
      claim_date: params[9] || null
    });
    return { changes: 1 };
  }

  // --- UPDATES ---
  if (normLower.startsWith('update warranties set status = ? where id = ?') && !normLower.includes('claim_reason')) {
    await getCollection('warranties').updateOne({ id: parseInt(params[1]) }, { $set: { status: params[0] } });
    return { changes: 1 };
  }

  if (normLower.startsWith('update warranties set status = ?, claim_reason = ?, claim_date = ? where id = ?')) {
    await getCollection('warranties').updateOne({ id: parseInt(params[3]) }, { $set: { status: params[0], claim_reason: params[1], claim_date: params[2] } });
    return { changes: 1 };
  }

  if (normLower.startsWith('update orders set order_status = ?') && normLower.includes('where id = ?')) {
    await getCollection('orders').updateOne({ id: params[1] }, { $set: { order_status: params[0] } });
    return { changes: 1 };
  }

  if (normLower.startsWith('update orders set payment_status = ?, collected_at = ? where id = ?')) {
    await getCollection('orders').updateOne({ id: params[2] }, { $set: { payment_status: params[0], collected_at: params[1] } });
    return { changes: 1 };
  }

  if (normLower.startsWith('update products set name=?, price=?, desc=?, category=?, images=?, model=?, stock=? where id=?')) {
    await getCollection('products').updateOne({ id: params[7] }, { $set: { name: params[0], price: params[1], desc: params[2], category: params[3], images: params[4], model: params[5], stock: params[6] } });
    return { changes: 1 };
  }

  if (normLower.startsWith('update products set price = ? where id = ?')) {
    await getCollection('products').updateOne({ id: params[1] }, { $set: { price: params[0] } });
    return { changes: 1 };
  }

  if (normLower.startsWith('update users set loyalty_tier = ? where id = ?')) {
    await getCollection('users').updateOne({ id: params[1] }, { $set: { loyalty_tier: params[0] } });
    return { changes: 1 };
  }

  if (normLower.startsWith('update users set password = ? where email = ?')) {
    await getCollection('users').updateOne({ email: params[1] }, { $set: { password: params[0] } });
    return { changes: 1 };
  }

  if (normLower.startsWith('update users set password = ? where id = ?')) {
    await getCollection('users').updateOne({ id: params[1] }, { $set: { password: params[0] } });
    return { changes: 1 };
  }

  // --- DELETES ---
  if (normLower.startsWith('insert into products (id, name, price, desc, category, material, stock, builder) values (?, ?, ?, ?, ?, ?, ?, ?)')) {
    await getCollection('products').insertOne({
      id: params[0],
      name: params[1],
      price: parseInt(params[2]),
      desc: params[3],
      category: params[4],
      material: params[5],
      stock: parseInt(params[6]),
      builder: params[7],
      rating: 5.0,
      is_custom: 0,
      icon: '<path d="M40 60 Q40 20 80 20 Q120 20 120 60 L120 100 M40 60 L40 100 M40 100 L30 130 M120 100 L130 130 M45 65 Q80 80 115 65" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>'
    });
    return { changes: 1 };
  }

  if (normLower.startsWith('delete from products where id=?')) {
    await getCollection('products').deleteOne({ id: params[0] });
    return { changes: 1 };
  }

  console.warn('Unhandled SQL query in translation layer:', sql);
  return [];
}

export async function query(sql, params = []) {
  return await translateAndExecute(sql, params);
}

export async function get(sql, params = []) {
  const rows = await translateAndExecute(sql, params);
  return rows[0] || null;
}

export async function run(sql, params = []) {
  return await translateAndExecute(sql, params);
}

// Database Seeding and Initialization
export async function initDb() {
  await connectMongo();
  console.log('Initializing database collections in MongoDB...');

  const productsCol = getCollection('products');
  const count = await productsCol.countDocuments({ id: 'gaming_chair' });
  if (count === 0) {
    console.log('Seeding products collection in MongoDB...');
    await productsCol.deleteMany({});

    const itemsMetadata = {
      living: [
        { id: 'one_seater_sofa', name: '1-Seater Sofa', price: 24999, original_price: 29999, builder: 'sofa', desc: 'Compact premium 1-seater sofa designed for single seating comfort.' },
        { id: 'two_seater_sofa', name: '2-Seater Sofa', price: 34999, original_price: 42999, builder: 'sofa', desc: 'Elegant 2-seater companion sofa featuring high-resilience support.' },
        { id: 'three_seater_sofa', name: '3-Seater Sofa', price: 38999, original_price: 47999, builder: 'sofa', desc: 'Comfortable family 3-seater sofa with traditional joint reinforcement.' },
        { id: 'four_seater_sofa', name: '4-Seater Sofa', price: 48999, original_price: 59999, builder: 'sofa', desc: 'Spacious 4-seater sofa built for grand living spaces.' },
        { id: 'l_shape_sofa', name: 'L-Shape Sofa', price: 74999, original_price: 89999, builder: 'sofa', desc: 'Bespoke corner L-shape sofa maximizing room utility and seating area.' },
        { id: 'u_shape_sofa', name: 'U-Shape Sofa', price: 94999, original_price: 114999, builder: 'sofa', desc: 'Grand U-shape conversational sofa for complete living room immersion.' },
        { id: 'sectional_sofa', name: 'Sectional Sofa', price: 82999, original_price: 99999, builder: 'sofa', desc: 'Flexible modular sectional sofa configuration built to grow with your home.' },
        { id: 'recliner_sofa', name: 'Recliner Sofa', price: 54999, original_price: 66999, builder: 'sofa', desc: 'Premium dual-motor recliner sofa with full flat lay utility.' },
        { id: 'sofa_cum_bed', name: 'Sofa Cum Bed', price: 42999, original_price: 52000, builder: 'sofa', desc: 'Convertible sofa cum bed featuring easy slide-out joinery and memory foam.' },
        { id: 'chesterfield_sofa', name: 'Chesterfield Sofa', price: 88999, original_price: 109999, builder: 'sofa', desc: 'Classic Chesterfield sofa with deep diamond tufting and rolled armrests.' },
        { id: 'loveseat', name: 'Loveseat', price: 28999, original_price: 34999, builder: 'sofa', desc: 'Cosy 2-seater loveseat ideal for master bedrooms or reading nooks.' },
        { id: 'modular_sofa', name: 'Modular Sofa', price: 114999, original_price: 139999, builder: 'sofa', desc: 'Infinite arrangement modular sofa blocks with low-profile styling.' },
        { id: 'lounge_sofa', name: 'Lounge Sofa', price: 58999, original_price: 72999, builder: 'sofa', desc: 'Relaxed modern lounge sofa with deep seats and angled backrests.' },
        { id: 'corner_sofa', name: 'Corner Sofa', price: 79999, original_price: 96999, builder: 'sofa', desc: 'Space-saving geometric corner sofa with premium joint finishes.' },
        { id: 'accent_chair', name: 'Accent Chair', price: 15499, original_price: 19000, builder: 'chair', desc: 'Minimalist accent chair featuring high-contrast joinery.' },
        { id: 'lounge_chair', name: 'Lounge Chair', price: 18999, original_price: 23000, builder: 'chair', desc: 'Gothenburg profile reading lounge chair.' },
        { id: 'armchair', name: 'Armchair', price: 16999, original_price: 20999, builder: 'chair', desc: 'Classic cushioned armchair with sculptured arm support.' },
        { id: 'recliner_chair', name: 'Recliner Chair', price: 29999, original_price: 36999, builder: 'chair', desc: 'Single-seater manual recliner chair with footrest pop-up.' },
        { id: 'rocking_chair', name: 'Rocking Chair', price: 22999, original_price: 27999, builder: 'chair', desc: 'Hand-crafted rocking chair with double-curved runner tracks.' },
        { id: 'wooden_chair', name: 'Wooden Chair', price: 7999, original_price: 9999, builder: 'chair', desc: 'Solid wood joinery chair showcasing raw grain aesthetics.' },
        { id: 'cane_chair', name: 'Cane Chair', price: 12999, original_price: 15999, builder: 'chair', desc: 'Hand-woven natural cane backing on a sturdy solid wood frame.' },
        { id: 'bean_bag_chair', name: 'Bean Bag Chair', price: 5999, original_price: 7499, builder: 'chair', desc: 'Soft and comfortable canvas bean bag chair for casual relaxation.' },
        { id: 'luxury_sofa', name: 'Luxury Sofa', price: 48999, original_price: 59999, builder: 'sofa', desc: 'Premium 3-seater living room velvet sofa.' },
        { id: 'l_shape_sectional_sofa', name: 'L-Shape Sectional Sofa', price: 78999, original_price: 95999, builder: 'sofa', desc: 'Spacious sectional sofa for the family.' },
        { id: 'bookshelf', name: 'Bookshelf', price: 17999, original_price: 22000, builder: 'shelf', desc: 'Modular white ash bookshelf.' },
        { id: 'display_cabinet', name: 'Display Cabinet', price: 26499, original_price: 32000, builder: 'shelf', desc: 'Glass paneled solid oak display cabinet.' }
      ],
      bedroom: [
        { id: 'king_size_bed', name: 'King Size Bed', price: 45999, original_price: 56000, builder: 'bed', desc: 'Platform wooden King bed frame.' },
        { id: 'queen_size_bed', name: 'Queen Size Bed', price: 39999, original_price: 48000, builder: 'bed', desc: 'Platform wooden Queen bed frame.' },
        { id: 'upholstered_bed', name: 'Upholstered Bed', price: 48999, original_price: 59000, builder: 'bed', desc: 'King bed with upholstered fabric headboard.' },
        { id: 'storage_bed', name: 'Storage Bed', price: 52999, original_price: 64000, builder: 'bed', desc: 'Solid wood bed with pull-out drawers.' },
        { id: 'hydraulic_bed', name: 'Hydraulic Bed', price: 58999, original_price: 70000, builder: 'bed', desc: 'Bespoke bed with hydraulic lift storage.' },
        { id: 'bedside_table', name: 'Bedside Table', price: 4499, original_price: 5500, builder: 'table', desc: 'Two-drawer floating nightstand.' },
        { id: 'two_door_wardrobe', name: '2-Door Wardrobe', price: 24999, original_price: 30000, builder: 'shelf', desc: 'Compact two-door clothes wardrobe.' },
        { id: 'three_door_wardrobe', name: '3-Door Wardrobe', price: 34999, original_price: 42000, builder: 'shelf', desc: 'Spacious three-door solid wood wardrobe.' },
        { id: 'sliding_wardrobe', name: 'Sliding Wardrobe', price: 48999, original_price: 60000, builder: 'shelf', desc: 'Premium sliding door storage wardrobe.' },
        { id: 'dressing_table', name: 'Dressing Table', price: 18999, original_price: 23000, builder: 'table', desc: 'Vanity table with storage drawers.' },
        { id: 'dressing_mirror', name: 'Dressing Mirror', price: 7999, original_price: 9800, builder: 'shelf', desc: 'Floor-standing solid wood mirror frame.' },
        { id: 'chest_of_drawers', name: 'Chest of Drawers', price: 21999, original_price: 27000, builder: 'shelf', desc: 'Five-drawer bedroom dresser cabinet.' },
        { id: 'bedroom_bench', name: 'Bedroom Bench', price: 9499, original_price: 11500, builder: 'bench', desc: 'End-of-bed upholstered wooden bench.' }
      ],
      dining: [
        { id: 'dining_chair_single', name: 'Dining Chair', price: 6499, original_price: 7999, builder: 'chair', desc: 'Ergonomic solid wood dining room chair.' },
        { id: 'bar_stool_single', name: 'Bar Stool', price: 4999, original_price: 5999, builder: 'chair', desc: 'High counter-height bar stool with brass foot ring.' },
        { id: 'counter_stool', name: 'Counter Stool', price: 5499, original_price: 6799, builder: 'chair', desc: 'Mid-height kitchen counter wood stool.' },
        { id: 'four_seater_dining_set', name: '4-Seater Dining Set', price: 34999, original_price: 42000, builder: 'table', desc: 'Square dining table with four matching chairs.' },
        { id: 'six_seater_dining_set', name: '6-Seater Dining Set', price: 48999, original_price: 60000, builder: 'table', desc: 'Rectangular dining table with six hand-carved chairs.' },
        { id: 'eight_seater_dining_set', name: '8-Seater Dining Set', price: 68999, original_price: 84000, builder: 'table', desc: 'Grand family dining table with eight chairs.' },
        { id: 'extendable_dining_table', name: 'Extendable Dining Table', price: 29999, original_price: 36000, builder: 'table', desc: 'Solid wood table with slide-out leaves.' },
        { id: 'dining_chairs', name: 'Dining Chairs Set of 2', price: 8999, original_price: 11000, builder: 'chair', desc: 'Pair of tenoned solid wood dining chairs.' },
        { id: 'bar_table', name: 'Bar Table', price: 14999, original_price: 18000, builder: 'table', desc: 'High-profile solid wood bar counter.' },
        { id: 'bar_stools', name: 'Bar Stools Set of 2', price: 7999, original_price: 9800, builder: 'stool', desc: 'Pair of revolving high bar stools.' },
        { id: 'crockery_cabinet', name: 'Crockery Cabinet', price: 29999, original_price: 36000, builder: 'shelf', desc: 'Glass-front dining room showcase cabinet.' }
      ],
      office: [
        { id: 'ergonomic_office_chair', name: 'Ergonomic Office Chair', price: 17999, original_price: 21999, builder: 'chair', desc: 'Fully adjustable ergonomic home office task chair.' },
        { id: 'study_chair', name: 'Study Chair', price: 9999, original_price: 11999, builder: 'chair', desc: 'Minimalist study desk chair with contoured lumbar support.' },
        { id: 'gaming_chair', name: 'Gaming Chair', price: 24999, original_price: 29999, builder: 'chair', desc: 'High-performance gaming chair with lumbar pillow and side wings.' },
        { id: 'executive_desk', name: 'Executive Desk', price: 28999, original_price: 35000, builder: 'desk', desc: 'Luxury desk with integrated cable channels.' },
        { id: 'computer_desk', name: 'Computer Desk', price: 14999, original_price: 18000, builder: 'desk', desc: 'Minimalist study desk with drawer.' },
        { id: 'study_table', name: 'Study Table', price: 11999, original_price: 15000, builder: 'desk', desc: 'Solid wood student writing desk.' },
        { id: 'office_chair', name: 'Office Chair', price: 8999, original_price: 11000, builder: 'chair', desc: 'Adjustable mesh office task chair.' },
        { id: 'executive_chair', name: 'Executive Chair', price: 19999, original_price: 24000, builder: 'chair', desc: 'Walnut frame high-back leather executive chair.' },
        { id: 'ergonomic_chair', name: 'Ergonomic Chair', price: 16999, original_price: 21000, builder: 'chair', desc: 'Fully adjustable orthopedic task chair.' },
        { id: 'conference_table', name: 'Conference Table', price: 54999, original_price: 66000, builder: 'table', desc: 'Twelve-seater boardroom conference table.' },
        { id: 'filing_cabinet', name: 'Filing Cabinet', price: 9999, original_price: 12000, builder: 'shelf', desc: 'Three-drawer rolling office cabinet.' },
        { id: 'office_bookshelf', name: 'Office Bookshelf', price: 14999, original_price: 18000, builder: 'shelf', desc: 'Open shelf catalog cabinet.' },
        { id: 'reception_desk', name: 'Reception Desk', price: 32999, original_price: 40000, builder: 'desk', desc: 'Angular solid wood lobby reception desk.' }
      ],
      decor: [
        { id: 'floor_lamp', name: 'Floor Lamp', price: 6999, original_price: 8500, builder: 'lamp', desc: 'Bespoke Nordic floor-standing lamp.' },
        { id: 'table_lamp', name: 'Table Lamp', price: 3499, original_price: 4300, builder: 'lamp', desc: 'Minimalist table study lamp.' },
        { id: 'wall_mirror', name: 'Wall Mirror', price: 5499, original_price: 6700, builder: 'shelf', desc: 'Circular solid wood mirror frame.' },
        { id: 'full_length_mirror', name: 'Full-Length Mirror', price: 12999, original_price: 16000, builder: 'shelf', desc: 'Standing full-length dressing mirror.' },
        { id: 'wall_shelf', name: 'Wall Shelf', price: 2499, original_price: 3100, builder: 'shelf', desc: 'Floating solid walnut wall shelf.' },
        { id: 'console_table', name: 'Console Table', price: 15999, original_price: 19000, builder: 'table', desc: 'Slim entryway wood console table.' },
        { id: 'shoe_rack', name: 'Shoe Rack', price: 8999, original_price: 11000, builder: 'bench', desc: 'Three-tier slatted wood shoe bench.' },
        { id: 'plant_stand', name: 'Plant Stand', price: 3499, original_price: 4300, builder: 'stool', desc: 'Three-legged wood plant stand.' },
        { id: 'room_divider', name: 'Room Divider', price: 12999, original_price: 16000, builder: 'shelf', desc: 'Three-panel wooden privacy screen.' },
        { id: 'wall_panel', name: 'Wall Panel', price: 6999, original_price: 8500, builder: 'shelf', desc: 'Slatted acoustic timber wall panels.' },
        { id: 'decorative_cabinet', name: 'Decorative Cabinet', price: 19999, original_price: 24000, builder: 'shelf', desc: 'Intricately carved wood accent chest.' }
      ],
      outdoor: [
        { id: 'folding_chair', name: 'Folding Chair', price: 3499, original_price: 4299, builder: 'chair', desc: 'Compact slatted wood outdoor folding chair.' },
        { id: 'outdoor_chair', name: 'Outdoor Chair', price: 8999, original_price: 10999, builder: 'chair', desc: 'Weather-resistant teak frame outdoor seating.' },
        { id: 'garden_sofa', name: 'Garden Sofa', price: 38999, original_price: 48000, builder: 'sofa', desc: 'Weatherproof rattan garden sofa.' },
        { id: 'outdoor_lounge_chair', name: 'Outdoor Lounge Chair', price: 14999, original_price: 18000, builder: 'chair', desc: 'Teak pool sun lounger.' },
        { id: 'patio_table', name: 'Patio Table', price: 11999, original_price: 15000, builder: 'table', desc: 'Round outdoor metal patio dining table.' },
        { id: 'outdoor_dining_set', name: 'Outdoor Dining Set', price: 45999, original_price: 56000, builder: 'table', desc: 'Six-chair slatted wood outdoor table set.' },
        { id: 'swing_chair', name: 'Swing Chair', price: 18999, original_price: 23000, builder: 'chair', desc: 'Hanging egg swing chair with support stand.' },
        { id: 'wooden_bench', name: 'Wooden Bench', price: 10999, original_price: 13000, builder: 'bench', desc: 'Slatted teak park bench.' },
        { id: 'balcony_set', name: 'Balcony Set', price: 14999, original_price: 18000, builder: 'table', desc: 'Three-piece folding metal bistro set.' }
      ],
      premium: [
        { id: 'nokka_royal_leather_sofa', name: 'NOKKA Royal Leather Sofa', price: 88999, original_price: 109999, builder: 'sofa', desc: 'Royal top-grain leather sofa with a solid teak frame and double-mortise tenon joints.', material: 'Top-Grain Leather', dims: '220 × 95 × 85 cm', joint: 'Teak peg-joined corner braces', finish: 'Walnut oil finish', fabric: 'Premium Tan Leather' },
        { id: 'nokka_velvet_lounge_chair', name: 'NOKKA Velvet Lounge Chair', price: 28999, original_price: 35999, builder: 'chair', desc: 'Lounge chair featuring plush velvet upholstery on a hand-turned walnut frame.', material: 'Premium Velvet', dims: '85 × 90 × 95 cm', joint: 'Hand-tuned dowel joinery', finish: 'Natural wax coat', fabric: 'Velvet Cushion' },
        { id: 'nokka_teak_armchair', name: 'NOKKA Teak Wood Armchair', price: 24999, original_price: 31000, builder: 'chair', desc: 'Accent armchair crafted from prime Burma teak wood with hand-woven cane backing.', material: 'Solid Teak Wood', dims: '70 × 65 × 80 cm', joint: 'Blind mortise-and-tenon', finish: 'Warm Tung Oil', fabric: 'Undyed Linen' },
        { id: 'nokka_cloud_modular_sofa', name: 'NOKKA Cloud Modular Sofa', price: 119999, original_price: 145000, builder: 'sofa', desc: 'Ultra-comfortable modular sectional with cloud-like padding and premium white bouclé wool.', material: 'White Bouclé Wool', dims: '300 × 180 × 75 cm', joint: 'Modular interlocking plates', finish: 'Matte linseed finish', fabric: 'Bouclé Upholstery' },
        { id: 'nokka_executive_leather_chair', name: 'NOKKA Executive Leather Chair', price: 35999, original_price: 44000, builder: 'chair', desc: 'Sleek ergonomic executive desk chair in full black top-grain leather with walnut arm accents.', material: 'Genuine Leather', dims: '70 × 70 × 120 cm', joint: 'Swivel mechanical mounts', finish: 'Polished wax', fabric: 'Genuine Leather' },
        { id: 'nokka_heritage_chesterfield', name: 'NOKKA Heritage Chesterfield', price: 94999, original_price: 115000, builder: 'sofa', desc: 'Classic Chesterfield sofa with deep diamond tufting, rolled arms, and sheesham wood bun feet.', material: 'Suede Leather', dims: '240 × 90 × 80 cm', joint: 'Dovetail corner bracing', finish: 'Classic brown oil', fabric: 'Tufted Suede' },
        { id: 'nokka_luxury_recliner', name: 'NOKKA Luxury Recliner', price: 42999, original_price: 52000, builder: 'chair', desc: 'Single-motor luxury recliner featuring full flat lay utility and premium leather cushioning.', material: 'Top-Grain Leather', dims: '90 × 100 × 105 cm', joint: 'Steel reclining frame mount', finish: 'Hand-polished wax', fabric: 'Top-Grain Leather' }
      ]
    };

    const icons = {
      chair: '<path d="M40 60 Q40 20 80 20 Q120 20 120 60 L120 100 M40 60 L40 100 M40 100 L30 130 M120 100 L130 130 M45 65 Q80 80 115 65" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
      sofa: '<path d="M15 90 L15 60 Q15 50 25 50 L135 50 Q145 50 145 60 L145 90 M15 90 L10 120 M15 90 L145 90 M145 90 L150 120 M15 60 L145 60" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
      table: '<ellipse cx="80" cy="45" rx="65" ry="14" stroke="currentColor" stroke-width="2.4"/><path d="M25 48 L35 120 M135 48 L125 120 M80 59 L80 120" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
      bench: '<rect x="20" y="55" width="120" height="16" rx="2" stroke="currentColor" stroke-width="2.4"/><path d="M32 71 L28 115 M128 71 L132 115" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
      shelf: '<path d="M25 20 L25 120 M135 20 L135 120 M25 40 L135 40 M25 75 L135 75 M25 105 L135 105" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
      stool: '<path d="M55 45 Q80 30 105 45 L100 100 Q80 108 60 100 Z" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/>',
      bed: '<rect x="15" y="40" width="130" height="60" rx="6" stroke="currentColor" stroke-width="2.4"/><path d="M15 65 L145 65 M30 40 L30 65 M130 40 L130 65 M15 100 L10 125 M145 100 L150 125" stroke="currentColor" stroke-width="2.4"/>',
      desk: '<rect x="20" y="35" width="120" height="30" rx="3" stroke="currentColor" stroke-width="2.4"/><path d="M30 65 L30 115 M130 65 L130 115 M55 65 L55 115 M105 65 L105 115" stroke="currentColor" stroke-width="2.4"/>',
      lamp: '<circle cx="80" cy="30" r="14" stroke="currentColor" stroke-width="2.4" fill="none"/><path d="M80 44 L80 110 M60 110 L100 110" stroke="currentColor" stroke-width="2.4"/>'
    };

    const productsList = [];
    for (const [category, products] of Object.entries(itemsMetadata)) {
      for (const p of products) {
        const rating = parseFloat((4.7 + Math.random() * 0.3).toFixed(1));
        const iconTag = icons[p.builder] || icons.bench;
        productsList.push({
          id: p.id,
          name: p.name,
          price: p.price,
          original_price: p.original_price,
          rating: rating,
          category: category,
          material: p.material || (category === 'premium' ? 'Premium Velvet & Italian Leather' : 'Solid Gothenburg Walnut & Ash'),
          dims: p.dims || 'Standard Size',
          desc: p.desc,
          specs_joint: p.joint || 'Exposed mortise joinery.',
          specs_finish: p.finish || 'Natural rubbed beeswax.',
          specs_fabric: p.fabric || 'Swedish felt wool cushion.',
          builder: p.builder,
          icon: iconTag,
          is_custom: 0
        });
      }
    }
    await productsCol.insertMany(productsList);
    console.log('Seeded products database successfully.');
  }

  // Seed Relational transactional database (284 distributed orders)
  const ordersCol = getCollection('orders');
  const ordersCount = await ordersCol.countDocuments({});
  if (ordersCount < 10) {
    console.log('Seeding relational orders, order_items, upi_payments, and audit_logs in MongoDB...');

    const orderItemsCol = getCollection('order_items');
    const orderTrackingCol = getCollection('order_tracking_log');
    const warrantiesCol = getCollection('warranties');
    const upiPaymentsCol = getCollection('upi_payments');
    const auditLogsCol = getCollection('audit_logs');
    const usersCol = getCollection('users');

    await usersCol.deleteMany({});
    await ordersCol.deleteMany({});
    await orderItemsCol.deleteMany({});
    await orderTrackingCol.deleteMany({});
    await warrantiesCol.deleteMany({});
    await upiPaymentsCol.deleteMany({});
    await auditLogsCol.deleteMany({});

    // Seeding distribution config targets
    const upiTarget = { count: 126, sum: 642500 };
    const codTarget = { count: 74, sum: 318000 };
    const cardTarget = { count: 48, sum: 241000 };
    const netBankingTarget = { count: 21, sum: 64000 };
    const otherTarget = { count: 15, sum: 19000 };

    function generateDistributedAmounts(count, totalSum) {
      let remaining = totalSum;
      const amounts = [];
      const avg = Math.round(totalSum / count);
      for (let i = 0; i < count - 1; i++) {
        const dev = Math.round((Math.random() - 0.5) * 0.4 * avg);
        const val = Math.max(1000, avg + dev);
        amounts.push(val);
        remaining -= val;
      }
      amounts.push(remaining);
      return amounts;
    }

    const upiAmounts = generateDistributedAmounts(upiTarget.count, upiTarget.sum);
    const codAmounts = generateDistributedAmounts(codTarget.count, codTarget.sum);
    const cardAmounts = generateDistributedAmounts(cardTarget.count, cardTarget.sum);
    const nbAmounts = generateDistributedAmounts(netBankingTarget.count, netBankingTarget.sum);
    const otherAmounts = generateDistributedAmounts(otherTarget.count, otherTarget.sum);

    const customers = [
      { name: 'Rahul Sharma', email: 'rahul.sharma@yahoo.com', phone: '9845012345' },
      { name: 'Varun Gowda', email: 'varun.gowda@gmail.com', phone: '9538831664' },
      { name: 'Priyanka Sen', email: 'priyanka.sen@gmail.com', phone: '9123456789' },
      { name: 'Amit Verma', email: 'amit.verma@hotmail.com', phone: '9988776655' },
      { name: 'Sneha Patel', email: 'sneha.patel@gmail.com', phone: '9876543210' }
    ];

    for (let i = 0; i < customers.length; i++) {
      await usersCol.insertOne({
        id: `USR-${1000 + i}`,
        name: customers[i].name,
        email: customers[i].email,
        password: 'password123',
        loyalty_tier: 'Gold',
        created_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
      });
    }

    const catalogItems = await productsCol.find({}).toArray();

    async function seedOrderBatch(amounts, method, startSeq) {
      let seq = startSeq;
      for (let i = 0; i < amounts.length; i++) {
        const grandTotal = amounts[i];
        const cust = customers[Math.floor(Math.random() * customers.length)];
        const orderId = `NOKKA-ORD-${method.toUpperCase().substring(0, 3)}-${Math.floor(100000 + Math.random() * 899999)}`;
        const invoiceNo = `NOK-2026-${String(seq).padStart(6, '0')}`;
        seq++;

        // Calculate breakdown
        const deliveryCharge = 1000;
        const installationCharge = 0;
        const subtotal = grandTotal - deliveryCharge - installationCharge;
        const discount = Math.round(subtotal * 0.05);
        const gstTax = Math.round((subtotal - discount) * 0.18);

        // Date calculation for the last 90 days
        const daysAgo = Math.floor(Math.random() * 90);
        const orderDate = new Date();
        orderDate.setDate(orderDate.getDate() - daysAgo);
        const createdStr = orderDate.toISOString().replace('T', ' ').substring(0, 19);

        // Dispatch & Delivery Windows
        const dispatchDate = new Date(orderDate);
        dispatchDate.setDate(dispatchDate.getDate() + 2);
        const expectedDispatchStr = dispatchDate.toISOString().replace('T', ' ').substring(0, 19);

        const deliveryDate = new Date(orderDate);
        deliveryDate.setDate(deliveryDate.getDate() + 4);
        const expectedDeliveryStr = deliveryDate.toISOString().replace('T', ' ').substring(0, 19);

        const statusOptions = ['ORDER_PLACED', 'PAYMENT_CONFIRMED', 'PROCESSING', 'PREPARING', 'QUALITY_CHECKED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED'];
        let orderStatus = 'DELIVERED';
        if (daysAgo < 5) {
          orderStatus = statusOptions[Math.floor(Math.random() * statusOptions.length)];
        }

        let paymentStatus = 'PAID';
        let collectedAt = null;
        if (method === 'COD') {
          paymentStatus = orderStatus === 'DELIVERED' ? 'CASH_COLLECTED' : 'PENDING';
          collectedAt = orderStatus === 'DELIVERED' ? expectedDeliveryStr : null;
        }

        // Insert Order
        await ordersCol.insertOne({
          id: orderId,
          invoice_number: invoiceNo,
          customer_name: cust.name,
          email: cust.email,
          phone: cust.phone,
          delivery_address: 'Apartment C-302, Palm Heights, Whitefield, Bengaluru, Karnataka',
          coupon: 'WELCOME5',
          discount: discount,
          gst_tax: gstTax,
          delivery_charge: deliveryCharge,
          installation_charge: installationCharge,
          grand_total: grandTotal,
          payment_method: method,
          payment_status: paymentStatus,
          order_status: orderStatus,
          expected_delivery_date: expectedDeliveryStr,
          expected_dispatch_date: expectedDispatchStr,
          delivery_window: '10:00 AM – 6:00 PM',
          collected_at: collectedAt,
          created_at: createdStr
        });

        // Insert Order Items (1 to 2 random items)
        const itemsCount = 1 + Math.floor(Math.random() * 2);
        for (let j = 0; j < itemsCount; j++) {
          const prod = catalogItems[Math.floor(Math.random() * catalogItems.length)];
          await orderItemsCol.insertOne({
            order_id: orderId,
            product_id: prod.id,
            product_name: prod.name,
            product_sku: `NOK-${prod.builder.toUpperCase()}-${prod.id.toUpperCase().substring(0, 4)}-GEN`,
            material: 'Solid Teak Wood',
            color: 'Black Leather',
            size: 'Standard Size',
            quantity: 1,
            unit_price: Math.round(grandTotal / itemsCount)
          });

          // Register active warranty certificate
          if (orderStatus === 'DELIVERED') {
            const nextWarrantyId = Date.now() + Math.floor(Math.random() * 10000);
            await warrantiesCol.insertOne({
              id: nextWarrantyId,
              order_id: orderId,
              product_id: prod.id,
              product_name: prod.name,
              customer_name: cust.name,
              customer_email: cust.email,
              warranty_years: 5,
              registered_at: expectedDeliveryStr,
              status: 'ACTIVE',
              claim_reason: null,
              claim_date: null
            });
          }
        }

        // Seeding logs timeline
        const statusIdx = statusOptions.indexOf(orderStatus);
        const limitLogs = statusIdx >= 0 ? statusIdx : 0;
        for (let k = 0; k <= limitLogs; k++) {
          const logDate = new Date(orderDate);
          logDate.setHours(logDate.getHours() + (k * 4));
          await orderTrackingCol.insertOne({
            order_id: orderId,
            status: statusOptions[k],
            created_at: logDate.toISOString().replace('T', ' ').substring(0, 19)
          });
        }

        // Seed UPI transaction logs
        if (method === 'UPI') {
          const upiApps = ['GPay', 'PhonePe', 'Paytm', 'UPI Web'];
          await upiPaymentsCol.insertOne({
            payment_id: `UPI-TXN-${cust.name.substring(0, 4).toUpperCase()}-${Math.floor(100000 + Math.random() * 899999)}`,
            order_id: orderId,
            amount: grandTotal,
            payment_method: upiApps[Math.floor(Math.random() * upiApps.length)],
            payment_status: 'PAID',
            created_at: createdStr
          });
        }
      }
      return seq;
    }

    let seq = 1;
    seq = await seedOrderBatch(upiAmounts, 'UPI', seq);
    seq = await seedOrderBatch(codAmounts, 'COD', seq);
    seq = await seedOrderBatch(cardAmounts, 'Card', seq);
    seq = await seedOrderBatch(nbAmounts, 'Net Banking', seq);
    seq = await seedOrderBatch(otherAmounts, 'Other', seq);

    console.log('MongoDB successfully seeded with 284 multi-item relational orders.');
  }

  // Ensure users collection is populated if empty
  const usersCol = getCollection('users');
  const usersCount = await usersCol.countDocuments({});
  if (usersCount === 0) {
    const usersFile = path.join('./data/db', 'users.json');
    if (fs.existsSync(usersFile)) {
      try {
        const fileUsers = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
        if (fileUsers && fileUsers.length > 0) {
          await usersCol.insertMany(fileUsers);
          console.log(`Seeded ${fileUsers.length} users into MongoDB from users.json`);
        }
      } catch (err) {
        console.error('Error reading users.json for seeding:', err);
      }
    }
  }
}
