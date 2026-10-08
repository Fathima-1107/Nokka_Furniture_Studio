# NOKKA — Bespoke Furniture Studio

An interactive 3D e-commerce and studio operations platform built with Three.js procedural graphics, Node.js REST API backend, dual-mode database engine (MongoDB + JSON fallback), and PhonePe UPI QR Scanner integration.

---

## 🚀 How to Run in Terminal

### 1. Install Dependencies
Open your terminal in the project directory and run:
```bash
npm install
```

### 2. Start the Server
```bash
npm start
```
Or for auto-reloading development mode:
```bash
npm run dev
```

### 3. Open in Browser
Once running, open:
👉 **[http://localhost:8080](http://localhost:8080)**

---

## 🌐 Quick Links & Directory

| Portal | URL | Description |
|---|---|---|
| **Main Website** | [http://localhost:8080/](http://localhost:8080/) | Studio homepage with 3D draggable hero chair, story & craft. |
| **Catalog** | [http://localhost:8080/products.html](http://localhost:8080/products.html) | Full collection with search, filters, 3D preview & cart drawer. |
| **Custom Configurator** | [http://localhost:8080/product.html](http://localhost:8080/product.html) | 3D model viewer with wood finish & upholstery customization. |
| **3D Showroom** | [http://localhost:8080/3d-showroom.html](http://localhost:8080/3d-showroom.html) | Interactive 3D showroom with orbit controls & lighting switches. |
| **Customer Orders Portal** | [http://localhost:8080/dashboard.html](http://localhost:8080/dashboard.html) | Track wood queue, manage 5-yr warranties, file returns & get invoices. |
| **Studio Admin Panel** | [http://localhost:8080/admin.html](http://localhost:8080/admin.html) | Business analytics, 284+ customer database & UPI ledger (`NOKKA-STUDIO-2026`). |
| **Sample Invoice** | [http://localhost:8080/invoice.html?id=NOKKA-ORD-UPI-392701](http://localhost:8080/invoice.html?id=NOKKA-ORD-UPI-392701) | Print-ready GST invoice with PhonePe verification QR badge. |

---

---

### Login flow (all steps work)
1. **Sign up** → logged in automatically and sent to the page you were trying to open.
2. **Log in** → wrong password shows an error; 8 bad tries locks that email for 10 minutes.
3. **Forgot password** → enter email → 6-digit code (valid 10 min) → set new password. With no email service configured, the code is shown on screen (demo mode) and printed in the server console. For production set `NOKKA_SHOW_RESET_CODE=false`.
4. **Change password** → My Orders page → *Change Password*.
5. **Sign out** → button in the nav on every page (and on My Orders).
6. Every page re-checks your session with the server, so expired, forged or blocked sessions are sent back to login.
7. *My Orders* only ever shows the logged-in customer's own orders.

## 🛠️ Admin Panel (`/admin-login.html`)
Dashboard (sales, charts, top products, activity), Orders (search, filter, full order detail, status updates, invoice link), Users (search, block/unblock, reset password, delete), Products (add / edit / delete), Activity Log.
Set a custom passcode with the `ADMIN_PASSCODE` environment variable.


