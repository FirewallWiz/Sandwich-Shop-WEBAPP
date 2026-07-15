/*
 * This file handles all database operations related to the Sandwich Shop orders.
 * Because the data is highly relational (spread across 4 tables: orders, order_sandwiches, 
 * sandwich_ingredients, sandwich_dressings), the SQL queries and Javascript Promises are 
 * much more complex than the single-table user management file.
 * 
 * -------------------------------------------------------------------------
 * DATABASE SCHEMA REFERENCE
 * -------------------------------------------------------------------------
 * TABLE: sandwich_sizes
 * - size (PK)
 * - base_price
 * - included_ingredients
 * - max_dressings
 * - daily_limit
 * 
 * TABLE: orders
 * - id (PK)
 * - user_id (FK -> users.id)
 * - total_price
 * 
 * TABLE: order_sandwiches
 * - id (PK)
 * - order_id (FK -> orders.id)
 * - size (FK -> sandwich_sizes.size)
 * - main_ingredient
 * - bread_type
 * - quantity
 * - unit_price
 * 
 * TABLE: sandwich_ingredients
 * - id (PK)
 * - sandwich_id (FK -> order_sandwiches.id)
 * - ingredient
 * 
 * TABLE: sandwich_dressings
 * - id (PK)
 * - sandwich_id (FK -> order_sandwiches.id)
 * - dressing
 * -------------------------------------------------------------------------
 */
import db from './db.mjs';

/*
 * -------------------------------------------------------------------------
 * PART 1: The "Read-Only" Functions
 * -------------------------------------------------------------------------
 */

/*
 * getMenu()
 * This simply fetches the static configuration from the sandwich_sizes table.
 * It also attaches the hardcoded valid ingredients/dressings.
 */
const getMenu = () => {
  return new Promise((resolve, reject) => {
    const sql = 'SELECT * FROM sandwich_sizes';
    db.all(sql, (err, rows) => {
      if (err) reject(err);
      else {
        const sizes = rows.map(r => ({
          size: r.size,
          basePrice: r.base_price,
          includedIngredients: r.included_ingredients,
          maxDressings: r.max_dressings,
          dailyLimit: r.daily_limit
        }));
        resolve({
          sizes: sizes,
          mainIngredients: ['roast beef', 'ham', 'bacon'],
          breadTypes: ['wheat', 'brown'],
          ingredients: ['lettuce', 'olives', 'onions', 'cucumber', 'yellow cheese', 'tomatoes', 'mozzarella'],
          dressings: ['olive oil', 'mustard', 'mayonnaise']
        });
      }
    });
  });
};

/*
 * getAvailability()
 * Calculates how many sandwiches of each size can still be sold today.
 * 
 * THE SQL MAGIC: 
 * - LEFT JOIN: Links the sandwich_sizes table with all confirmed order_sandwiches.
 * - COALESCE(SUM(os.quantity), 0): If a size (e.g., 'L') hasn't been ordered yet today, 
 *   SUM() would normally return NULL. COALESCE catches that NULL and replaces it with 0, 
 *   allowing us to safely subtract the 'used' amount from the 'daily_limit'.
 */
const getAvailability = () => {
  return new Promise((resolve, reject) => {
    const sql = `SELECT ss.size, ss.daily_limit, 
                 COALESCE(SUM(os.quantity), 0) as used
                 FROM sandwich_sizes ss
                 LEFT JOIN order_sandwiches os ON ss.size = os.size
                 LEFT JOIN orders o ON os.order_id = o.id
                 GROUP BY ss.size`;
    db.all(sql, (err, rows) => {
      if (err) reject(err);
      else {
        const availability = {};
        rows.forEach(r => {
          availability[r.size] = r.daily_limit - r.used;
        });
        resolve(availability);
      }
    });
  });
};

/*
 * -------------------------------------------------------------------------
 * PART 2: The "Nested Read" (Fetching Orders)
 * -------------------------------------------------------------------------
 * getOrdersByUser()
 * Reconstructs the giant Javascript Object containing an order, its sandwiches, 
 * and their ingredients. Because we must query 4 different tables asynchronously, 
 * we use nested callbacks. We use manual counters (e.g., `let processed = 0`) to track 
 * when all the loops have finished reading before finally calling `resolve(orders)`.
 */
const getOrdersByUser = (userId) => {
  return new Promise((resolve, reject) => {
    const sql = 'SELECT * FROM orders WHERE user_id=?';
    db.all(sql, [userId], (err, orderRows) => {
      if (err) { reject(err); return; }
      if (orderRows.length === 0) { resolve([]); return; }
      
      const orders = [];
      let processed = 0; // Tracks how many master orders are fully assembled
      
      orderRows.forEach((orderRow) => {
        const order = { id: orderRow.id, userId: orderRow.user_id, totalPrice: orderRow.total_price, sandwiches: [] };
        
        const sqlSandwiches = 'SELECT * FROM order_sandwiches WHERE order_id=?';
        db.all(sqlSandwiches, [orderRow.id], (err2, sandwichRows) => {
          if (err2) { reject(err2); return; }
          
          if (sandwichRows.length === 0) {
            orders.push(order);
            processed++;
            if (processed === orderRows.length) resolve(orders);
            return;
          }
          
          let sandwichProcessed = 0; // Tracks how many sandwiches in this specific order are assembled
          sandwichRows.forEach((sRow) => {
            const sandwich = {
              id: sRow.id,
              size: sRow.size,
              mainIngredient: sRow.main_ingredient,
              breadType: sRow.bread_type,
              quantity: sRow.quantity,
              unitPrice: sRow.unit_price,
              ingredients: [],
              dressings: []
            };
            
            const sqlIng = 'SELECT ingredient FROM sandwich_ingredients WHERE sandwich_id=?';
            const sqlDress = 'SELECT dressing FROM sandwich_dressings WHERE sandwich_id=?';
            
            db.all(sqlIng, [sRow.id], (err3, ingRows) => {
              if (err3) { reject(err3); return; }
              sandwich.ingredients = ingRows.map(r => r.ingredient);
              
              db.all(sqlDress, [sRow.id], (err4, dressRows) => {
                if (err4) { reject(err4); return; }
                sandwich.dressings = dressRows.map(r => r.dressing);
                
                order.sandwiches.push(sandwich);
                sandwichProcessed++;
                
                // If all sandwiches for this order are done, push the order and increment master counter
                if (sandwichProcessed === sandwichRows.length) {
                  orders.push(order);
                  processed++;
                  // If all master orders are done, resolve the giant assembled array!
                  if (processed === orderRows.length) resolve(orders);
                }
              });
            });
          });
        });
      });
    });
  });
};

/*
 * -------------------------------------------------------------------------
 * PART 3: The "Nested Write" (Creating an Order)
 * -------------------------------------------------------------------------
 * createOrder()
 * Inserts data across 4 tables. Like fetching, we use nested callbacks ("Pyramid of Doom").
 * 
 * KEY SYNTAX TO EXPLAIN: `this.lastID`
 * When using `db.run(INSERT...)`, sqlite3 populates `this.lastID` inside the callback with 
 * the brand-new ID of the row it just created. We use this to link the tables together 
 * (e.g., getting the `orderId` to use when inserting `order_sandwiches`).
 */
const createOrder = (userId, sandwiches, totalPrice) => {
  return new Promise((resolve, reject) => {
    const sqlOrder = 'INSERT INTO orders (user_id, total_price) VALUES(?, ?)';
    db.run(sqlOrder, [userId, totalPrice], function (err) {
      if (err) { reject(err); return; }
      const orderId = this.lastID; // The newly created Order's ID
      
      let sandwichCount = 0; // Manual execution tracker
      sandwiches.forEach((s) => {
        const sqlSandwich = 'INSERT INTO order_sandwiches (order_id, size, main_ingredient, bread_type, quantity, unit_price) VALUES(?, ?, ?, ?, ?, ?)';
        db.run(sqlSandwich, [orderId, s.size, s.mainIngredient, s.breadType, s.quantity, s.unitPrice], function (err2) {
          if (err2) { reject(err2); return; }
          const sandwichId = this.lastID; // The newly created Sandwich's ID
          
          let ingCount = 0;
          const totalIng = (s.ingredients ? s.ingredients.length : 0) + (s.dressings ? s.dressings.length : 0);
          
          if (totalIng === 0) {
            sandwichCount++;
            if (sandwichCount === sandwiches.length) resolve({ id: orderId, totalPrice: totalPrice });
            return;
          }
          
          if (s.ingredients) {
            s.ingredients.forEach((ing) => {
              db.run('INSERT INTO sandwich_ingredients (sandwich_id, ingredient) VALUES(?, ?)', [sandwichId, ing], function (err3) {
                if (err3) { reject(err3); return; }
                ingCount++;
                if (ingCount === totalIng) {
                  sandwichCount++;
                  if (sandwichCount === sandwiches.length) resolve({ id: orderId, totalPrice: totalPrice });
                }
              });
            });
          }
          
          if (s.dressings) {
            s.dressings.forEach((dress) => {
              db.run('INSERT INTO sandwich_dressings (sandwich_id, dressing) VALUES(?, ?)', [sandwichId, dress], function (err3) {
                if (err3) { reject(err3); return; }
                ingCount++;
                if (ingCount === totalIng) {
                  sandwichCount++;
                  if (sandwichCount === sandwiches.length) resolve({ id: orderId, totalPrice: totalPrice });
                }
              });
            });
          }
        });
      });
    });
  });
};

/*
 * -------------------------------------------------------------------------
 * PART 4: The "Nested Delete" (Deleting an Order)
 * -------------------------------------------------------------------------
 * deleteOrder()
 * Cleans up the database in reverse to prevent orphaned data.
 * 
 * KEY SYNTAX TO EXPLAIN: Dynamic "IN (?,?)" Queries
 * To delete all ingredients for all sandwiches at once, we need a query like: 
 * DELETE FROM table WHERE sandwich_id IN (?, ?, ?). 
 * We build those question marks dynamically based on the length of the array using:
 * `const placeholders = sandwichIds.map(() => '?').join(',');`
 */
const deleteOrder = (userId, orderId) => {
  return new Promise((resolve, reject) => {
    // First, verify the order belongs to the user and get the original total price for refunding
    const sqlCheck = 'SELECT * FROM orders WHERE id=? AND user_id=?';
    db.get(sqlCheck, [orderId, userId], (err, row) => {
      if (err) { reject(err); return; }
      if (row === undefined) { resolve({ error: 'Order not found.' }); return; }
      
      const totalPrice = row.total_price;
      
      // Find all sandwiches tied to this order
      const sqlSandwiches = 'SELECT id FROM order_sandwiches WHERE order_id=?';
      db.all(sqlSandwiches, [orderId], (err2, sandwichRows) => {
        if (err2) { reject(err2); return; }
        
        const sandwichIds = sandwichRows.map(r => r.id);
        
        if (sandwichIds.length > 0) {
          // Dynamic query generation to bulk-delete ingredients
          const placeholders = sandwichIds.map(() => '?').join(',');
          db.run(`DELETE FROM sandwich_ingredients WHERE sandwich_id IN (${placeholders})`, sandwichIds, function(err3) {
            if (err3) { reject(err3); return; }
            db.run(`DELETE FROM sandwich_dressings WHERE sandwich_id IN (${placeholders})`, sandwichIds, function(err4) {
              if (err4) { reject(err4); return; }
              // Delete the sandwiches
              db.run('DELETE FROM order_sandwiches WHERE order_id=?', [orderId], function(err5) {
                if (err5) { reject(err5); return; }
                // Finally, delete the master order
                db.run('DELETE FROM orders WHERE id=? AND user_id=?', [orderId, userId], function(err6) {
                  if (err6) { reject(err6); return; }
                  if (this.changes !== 1) resolve({ error: 'Order not found.' });
                  else resolve({ totalPrice: totalPrice });
                });
              });
            });
          });
        } else {
          // If the order somehow had zero sandwiches, just delete the master order
          db.run('DELETE FROM orders WHERE id=? AND user_id=?', [orderId, userId], function(err3) {
            if (err3) { reject(err3); return; }
            if (this.changes !== 1) resolve({ error: 'Order not found.' });
            else resolve({ totalPrice: totalPrice });
          });
        }
      });
    });
  });
};

export default { getMenu, getAvailability, getOrdersByUser, createOrder, deleteOrder };
