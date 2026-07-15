# 🥪 FirewallWiz Sandwich Shop

A full-stack web application built for the Web Applications II Exam. This project is a complete sandwich ordering system featuring a dynamic custom sandwich configurator, real-time inventory management, a digital wallet credit system, and robust security featuring Two-Factor Authentication (TOTP).

---

## ✨ Key Features

- **Dynamic Sandwich Configurator:** Build custom sandwiches by selecting size, bread, main ingredient, and multiple toppings/dressings.
- **Live Pricing Engine:** Calculates prices instantly based on base size costs and extra ingredients.
- **Inventory Tracking:** Real-time checking against daily availability limits for each sandwich size.
- **Digital Wallet:** Users have a credit balance used to purchase orders, which is updated automatically.
- **Order Management:** Users can view past confirmed orders, duplicate them to start a new draft, or cancel them (with a 90% wallet refund).
- **Advanced Security (2FA):** Multi-step login process utilizing `passport-local` for session management and `otpauth` for Time-based One-Time Passwords (TOTP), including replay attack protection.

---

## 🏗️ Project Architecture

### 🖥️ React Client (Frontend)

The frontend is a Single Page Application (SPA) built with React and Vite. 

**Main Components:**
- `App.jsx`: The main router and global state holder (manages authentication status and the shopping cart).
- `Home.jsx`: The landing page displaying menu configurations and live daily availability stock.
- `Configurator.jsx`: A complex state manager for building new sandwiches, validating business rules, calculating dynamic pricing, and submitting orders.
- `OrderList.jsx`: Displays previously confirmed orders. Handles order duplication mapping and authenticated deletion operations.
- `Auth.jsx`: Contains `LoginForm` and `TotpForm` components managing the multi-step login strategy.

**Client Routes:**
- `/` - Home page (Menu and Availability)
- `/login` - 2FA authentication flow
- `/configurator` - Custom sandwich builder
- `/orders` - User's order history and management

### ⚙️ API Server (Backend)

The backend is built with Express.js and interfaces with an SQLite database using the DAO (Data Access Object) pattern.

**API Endpoints:**
- **Public:**
  - `GET /api/menu` - Returns JSON configuration arrays (sizes, ingredients, dressings).
  - `GET /api/availability` - Returns a mapping of sizes to their remaining daily limits.
- **Authentication:**
  - `POST /api/sessions` - Initial login (checks username/password).
  - `GET /api/sessions/current` - Validates current session cookie.
  - `DELETE /api/sessions/current` - Logs the user out.
  - `POST /api/login-totp` - Validates the 6-digit TOTP code and upgrades the session.
- **Protected (Requires Login):**
  - `GET /api/orders` - Fetches the user's order history (with nested sandwich details).
  - `POST /api/orders` - Submits a new order, deducts cost from wallet, and decreases availability.
  - `DELETE /api/orders/:id` - Deletes an order, restores availability, and refunds 90% of the cost to the wallet. *(Requires TOTP validation via session check)*.

---

## 🗄️ Database Schema (SQLite)

The database is highly relational to support complex order configurations:

- `users`: id, email, name, hash, salt, secret, lastTotpStep, credit
- `sandwich_sizes`: size, base_price, included_ingredients, max_dressings, daily_limit
- `orders`: id, user_id, total_price
- `order_sandwiches`: id, order_id, size, main_ingredient, bread_type, quantity, unit_price
- `sandwich_ingredients`: id, sandwich_id, ingredient
- `sandwich_dressings`: id, sandwich_id, dressing

---

## 🔐 Demo Credentials

All users have Two-Factor Authentication enabled.
The TOTP Secret for all users is: `LXBSMDTMSP2I5XFXIYRGFVWSFI`

| Email | Password | Role / Name |
| :--- | :--- | :--- |
| `u1@p.it` | `pwd` | Alice |
| `u2@p.it` | `pwd` | Bob |
| `u3@p.it` | `pwd` | Charlie |
| `u4@p.it` | `pwd` | Diana |

---

## 📸 Screenshots

![Application Screenshot](./img/image.png)

---

## 🚀 Setup & Installation

1. **Install Dependencies:**
   - In the `server/` directory: run `npm install`
   - In the `client/` directory: run `npm install`

2. **Initialize Database:**
   - In the `server/` directory, run: `node init-db.mjs`

3. **Start the Application:**
   - Start the server: `npm run dev` (inside `server/`)
   - Start the client: `npm run dev` (inside `client/`)
