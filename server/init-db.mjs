import sqlite3 from 'sqlite3';
import crypto from 'crypto';
import fs from 'fs';

// Delete existing DB
if (fs.existsSync('sandwiches.db')) {
  fs.unlinkSync('sandwiches.db');
}

const db = new sqlite3.Database('sandwiches.db');

function hashPassword(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 32, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey.toString('hex'));
    });
  });
}

async function init() {
  db.serialize();

  // Create tables
  db.run(`CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    secret TEXT,
    lastTotpStep INTEGER,
    credit REAL DEFAULT 0
  )`);

  db.run(`CREATE TABLE sandwich_sizes (
    size TEXT PRIMARY KEY,
    base_price REAL NOT NULL,
    included_ingredients INTEGER NOT NULL,
    max_dressings INTEGER NOT NULL,
    daily_limit INTEGER NOT NULL
  )`);

  db.run(`CREATE TABLE orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    total_price REAL NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE order_sandwiches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    size TEXT NOT NULL,
    main_ingredient TEXT NOT NULL,
    bread_type TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price REAL NOT NULL,
    FOREIGN KEY(order_id) REFERENCES orders(id),
    FOREIGN KEY(size) REFERENCES sandwich_sizes(size)
  )`);

  db.run(`CREATE TABLE sandwich_ingredients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sandwich_id INTEGER NOT NULL,
    ingredient TEXT NOT NULL,
    FOREIGN KEY(sandwich_id) REFERENCES order_sandwiches(id)
  )`);

  db.run(`CREATE TABLE sandwich_dressings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sandwich_id INTEGER NOT NULL,
    dressing TEXT NOT NULL,
    FOREIGN KEY(sandwich_id) REFERENCES order_sandwiches(id)
  )`);

  // Insert sizes
  const sizes = [
    ['S', 5.0, 2, 1, 10],
    ['M', 7.0, 3, 2, 8],
    ['L', 10.0, 4, 2, 6]
  ];
  const stmtSizes = db.prepare('INSERT INTO sandwich_sizes VALUES (?, ?, ?, ?, ?)');
  sizes.forEach(s => stmtSizes.run(s));
  stmtSizes.finalize();

  // Insert users
  const users = [
    { email: 'u1@p.it', name: 'Alice', secret: 'LXBSMDTMSP2I5XFXIYRGFVWSFI', lastTotpStep: 0, credit: 57.50 },
    { email: 'u2@p.it', name: 'Bob', secret: 'LXBSMDTMSP2I5XFXIYRGFVWSFI', lastTotpStep: 0, credit: 56.80 },
    { email: 'u3@p.it', name: 'Charlie', secret: 'LXBSMDTMSP2I5XFXIYRGFVWSFI', lastTotpStep: 0, credit: 100 },
    { email: 'u4@p.it', name: 'Diana', secret: 'LXBSMDTMSP2I5XFXIYRGFVWSFI', lastTotpStep: 0, credit: 100 }
  ];

  for (const u of users) {
    const salt = crypto.randomBytes(8).toString('hex');
    const hash = await hashPassword('pwd', salt);
    db.run('INSERT INTO users (email, name, hash, salt, secret, lastTotpStep, credit) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [u.email, u.name, hash, salt, u.secret, u.lastTotpStep, u.credit]);
  }

  // Insert orders for Alice (u1@p.it) -> ID 1
  // Order 1
  db.run('INSERT INTO orders (user_id, total_price) VALUES (1, 15.00)', function() {
    const orderId = this.lastID;
    db.run('INSERT INTO order_sandwiches (order_id, size, main_ingredient, bread_type, quantity, unit_price) VALUES (?, ?, ?, ?, ?, ?)', [orderId, 'S', 'ham', 'wheat', 1, 5.00], function() {
      const sid = this.lastID;
      db.run('INSERT INTO sandwich_ingredients (sandwich_id, ingredient) VALUES (?, ?)', [sid, 'lettuce']);
      db.run('INSERT INTO sandwich_ingredients (sandwich_id, ingredient) VALUES (?, ?)', [sid, 'olives']);
    });
    db.run('INSERT INTO order_sandwiches (order_id, size, main_ingredient, bread_type, quantity, unit_price) VALUES (?, ?, ?, ?, ?, ?)', [orderId, 'L', 'bacon', 'brown', 1, 10.00], function() {
      const sid = this.lastID;
      db.run('INSERT INTO sandwich_ingredients (sandwich_id, ingredient) VALUES (?, ?)', [sid, 'lettuce']);
      db.run('INSERT INTO sandwich_ingredients (sandwich_id, ingredient) VALUES (?, ?)', [sid, 'olives']);
      db.run('INSERT INTO sandwich_ingredients (sandwich_id, ingredient) VALUES (?, ?)', [sid, 'onions']);
      db.run('INSERT INTO sandwich_ingredients (sandwich_id, ingredient) VALUES (?, ?)', [sid, 'tomatoes']);
      db.run('INSERT INTO sandwich_dressings (sandwich_id, dressing) VALUES (?, ?)', [sid, 'olive oil']);
    });
  });

  // Order 2
  db.run('INSERT INTO orders (user_id, total_price) VALUES (1, 21.00)', function() {
    const orderId = this.lastID;
    db.run('INSERT INTO order_sandwiches (order_id, size, main_ingredient, bread_type, quantity, unit_price) VALUES (?, ?, ?, ?, ?, ?)', [orderId, 'M', 'roast beef', 'wheat', 3, 7.00], function() {
      const sid = this.lastID;
      db.run('INSERT INTO sandwich_ingredients (sandwich_id, ingredient) VALUES (?, ?)', [sid, 'lettuce']);
      db.run('INSERT INTO sandwich_ingredients (sandwich_id, ingredient) VALUES (?, ?)', [sid, 'cucumber']);
      db.run('INSERT INTO sandwich_ingredients (sandwich_id, ingredient) VALUES (?, ?)', [sid, 'yellow cheese']);
      db.run('INSERT INTO sandwich_dressings (sandwich_id, dressing) VALUES (?, ?)', [sid, 'mustard']);
    });
  });

  // Order 3
  db.run('INSERT INTO orders (user_id, total_price) VALUES (1, 6.50)', function() {
    const orderId = this.lastID;
    db.run('INSERT INTO order_sandwiches (order_id, size, main_ingredient, bread_type, quantity, unit_price) VALUES (?, ?, ?, ?, ?, ?)', [orderId, 'S', 'bacon', 'brown', 1, 6.50], function() {
      const sid = this.lastID;
      db.run('INSERT INTO sandwich_ingredients (sandwich_id, ingredient) VALUES (?, ?)', [sid, 'lettuce']);
      db.run('INSERT INTO sandwich_ingredients (sandwich_id, ingredient) VALUES (?, ?)', [sid, 'olives']);
      db.run('INSERT INTO sandwich_ingredients (sandwich_id, ingredient) VALUES (?, ?)', [sid, 'tomatoes']);
      db.run('INSERT INTO sandwich_dressings (sandwich_id, dressing) VALUES (?, ?)', [sid, 'mayonnaise']);
    });
  });

  // Insert orders for Bob (u2@p.it) -> ID 2
  // Order 4
  db.run('INSERT INTO orders (user_id, total_price) VALUES (2, 19.20)', function() {
    const orderId = this.lastID;
    db.run('INSERT INTO order_sandwiches (order_id, size, main_ingredient, bread_type, quantity, unit_price) VALUES (?, ?, ?, ?, ?, ?)', [orderId, 'S', 'ham', 'wheat', 2, 5.00], function() {
      const sid = this.lastID;
      db.run('INSERT INTO sandwich_ingredients (sandwich_id, ingredient) VALUES (?, ?)', [sid, 'cucumber']);
      db.run('INSERT INTO sandwich_ingredients (sandwich_id, ingredient) VALUES (?, ?)', [sid, 'mozzarella']);
    });
    db.run('INSERT INTO order_sandwiches (order_id, size, main_ingredient, bread_type, quantity, unit_price) VALUES (?, ?, ?, ?, ?, ?)', [orderId, 'M', 'bacon', 'brown', 2, 7.00], function() {
      const sid = this.lastID;
      db.run('INSERT INTO sandwich_ingredients (sandwich_id, ingredient) VALUES (?, ?)', [sid, 'lettuce']);
      db.run('INSERT INTO sandwich_ingredients (sandwich_id, ingredient) VALUES (?, ?)', [sid, 'tomatoes']);
      db.run('INSERT INTO sandwich_ingredients (sandwich_id, ingredient) VALUES (?, ?)', [sid, 'mozzarella']);
      db.run('INSERT INTO sandwich_dressings (sandwich_id, dressing) VALUES (?, ?)', [sid, 'olive oil']);
    });
  });

  // Order 5
  db.run('INSERT INTO orders (user_id, total_price) VALUES (2, 10.00)', function() {
    const orderId = this.lastID;
    db.run('INSERT INTO order_sandwiches (order_id, size, main_ingredient, bread_type, quantity, unit_price) VALUES (?, ?, ?, ?, ?, ?)', [orderId, 'L', 'roast beef', 'wheat', 1, 10.00], function() {
      const sid = this.lastID;
      db.run('INSERT INTO sandwich_ingredients (sandwich_id, ingredient) VALUES (?, ?)', [sid, 'onions']);
      db.run('INSERT INTO sandwich_ingredients (sandwich_id, ingredient) VALUES (?, ?)', [sid, 'cucumber']);
      db.run('INSERT INTO sandwich_ingredients (sandwich_id, ingredient) VALUES (?, ?)', [sid, 'yellow cheese']);
      db.run('INSERT INTO sandwich_ingredients (sandwich_id, ingredient) VALUES (?, ?)', [sid, 'tomatoes']);
      db.run('INSERT INTO sandwich_dressings (sandwich_id, dressing) VALUES (?, ?)', [sid, 'mustard']);
      db.run('INSERT INTO sandwich_dressings (sandwich_id, dressing) VALUES (?, ?)', [sid, 'mayonnaise']);
    });
  });

  // Order 6
  db.run('INSERT INTO orders (user_id, total_price) VALUES (2, 14.00)', function() {
    const orderId = this.lastID;
    db.run('INSERT INTO order_sandwiches (order_id, size, main_ingredient, bread_type, quantity, unit_price) VALUES (?, ?, ?, ?, ?, ?)', [orderId, 'M', 'ham', 'wheat', 2, 7.00], function() {
      const sid = this.lastID;
      db.run('INSERT INTO sandwich_ingredients (sandwich_id, ingredient) VALUES (?, ?)', [sid, 'olives']);
      db.run('INSERT INTO sandwich_ingredients (sandwich_id, ingredient) VALUES (?, ?)', [sid, 'onions']);
      db.run('INSERT INTO sandwich_ingredients (sandwich_id, ingredient) VALUES (?, ?)', [sid, 'cucumber']);
      db.run('INSERT INTO sandwich_dressings (sandwich_id, dressing) VALUES (?, ?)', [sid, 'olive oil']);
      db.run('INSERT INTO sandwich_dressings (sandwich_id, dressing) VALUES (?, ?)', [sid, 'mustard']);
    });
  });

  setTimeout(() => {
    console.log('Database initialized successfully');
    db.close();
  }, 1000);
}

init();
