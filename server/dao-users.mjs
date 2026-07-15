/*
 * This file is the "User Management" control center for your app. It handles fetching user profiles, 
 * verifying passwords for login, and updating account details (like credits and security settings).
 *
 * Key concepts used throughout this file:
 * 
 * 1. Promises: Every function returns a `new Promise`. Because reading or writing to a database 
 *    takes a fraction of a second, JavaScript uses Promises to say: "I promise to do this task in 
 *    the background. If it works, I will `resolve` it and give you the data. If it breaks, I will 
 *    `reject` it and give you the error."
 * 
 * 2. The `?` in SQL (`WHERE id=?`): This is a security feature. Instead of pasting user input 
 *    directly into the database command, the `?` acts as a placeholder. The database fills it in 
 *    safely later, which completely prevents hackers from using a technique called "SQL Injection" 
 *    to steal your data.
 *
 * ---------------------------------------------------------
 * SECURITY VOCABULARY CHEAT SHEET
 * 
 * Team 1: Password Security (Verifying standard passwords)
 * - `row.hash`: The scrambled password. You can't un-scramble it. To verify a login, 
 *   we take the typed password, scramble it the exact same way, and see if the hashes match.
 * - `row.salt`: A random string generated when a user signs up. It's mixed into their password 
 *   *before* scrambling. This ensures that if two users have the password "Password123", 
 *   their final hashes look completely different in the database, protecting them from hackers.
 * 
 * Team 2: Two-Factor Authentication (TOTP)
 * - `row.secret`: The permanent master key. It's shared between our server and the user's phone 
 *   authenticator app (via QR code). Both sides use this secret + the current time to generate 
 *   the identical changing 6-digit codes.
 * - `row.lastTotpStep`: The anti-hacker guard. Because codes change every 30 seconds, this stores 
 *   the specific 30-second time block where the user last logged in. If a hacker intercepts the code 
 *   and tries to use it 10 seconds later, the server blocks it because that time block was already 
 *   marked as used (preventing a Replay Attack).
 * ---------------------------------------------------------
 */

/*
 * The Imports
 * - `db`: This brings in that exact database connection you set up in the db.mjs file.
 * - `crypto`: This is a built-in Node.js security toolbelt. You use it here to securely handle 
 *   and verify user passwords.
 */
import db from './db.mjs';
import crypto from 'crypto';

/*
 * Finding a User by their ID
 * This function is basically a digital ID scanner. You hand it an `id` number, and it asks the 
 * database (`db.get`) to find the matching row.
 * - If there's an error: It rejects the promise.
 * - If the row is `undefined`: It means no user exists with that ID, so it resolves with an error message.
 * - If the user is found: It packages up their safe details (omitting sensitive stuff like the password hash) 
 *   into a tidy `user` object and sends it back (`resolve(user)`).
 */
const getUserById = (id) => {
  return new Promise((resolve, reject) => {
    const sql = 'SELECT * FROM users WHERE id=?';
    db.get(sql, [id], (err, row) => {
      if (err) reject(err);
      else if (row === undefined) resolve({ error: 'User not found.' });
      else {
        const user = { id: row.id, username: row.email, name: row.name, secret: row.secret, lastTotpStep: row.lastTotpStep, credit: row.credit };
        resolve(user);
      }
    });
  });
};

/*
 * The Login Function (Email & Password)
 * This is the most complex function because it handles secure logins.
 * 1. Find the email: It first checks if the email exists in the database. If not, it rejects the login by resolving `false`.
 * 2. Verify the password: If the email exists, it uses the `crypto` library to check the password.
 *    - It takes the typed-in password and mixes it with the user's secret `salt` (random data used to make passwords unguessable).
 *    - It uses a complex algorithm (`scrypt`) to turn that mix into a "hashed" password.
 *    - Finally, it uses `crypto.timingSafeEqual` to compare this new hash against the hash saved in the database. 
 *      (Using `timingSafeEqual` prevents hackers from guessing passwords based on how many milliseconds the comparison takes).
 * 3. The Result: If the passwords match, you get the `user` object back. If they don't match, it resolves `false`.
 */
const getUser = (email, password) => {
  return new Promise((resolve, reject) => {
    const sql = 'SELECT * FROM users WHERE email=?';
    db.get(sql, [email], (err, row) => {
      if (err) { reject(err); }
      else if (row === undefined) { resolve(false); }
      else {
        const user = { id: row.id, username: row.email, name: row.name, secret: row.secret, lastTotpStep: row.lastTotpStep, credit: row.credit };
        crypto.scrypt(password, row.salt, 32, function (err, hashedPassword) {
          if (err) reject(err);
          if (!crypto.timingSafeEqual(Buffer.from(row.hash, 'hex'), hashedPassword))
            resolve(false);
          else
            resolve(user);
        });
      }
    });
  });
};

/*
 * Updating User Information
 * These two functions (`updateLastTotpStep` and `updateCredit`) do exactly the same type of job, 
 * just for different pieces of data. Notice they use `db.run` instead of `db.get`. You use `run` 
 * when you want to *change* data (UPDATE, INSERT, DELETE) rather than just *read* data (SELECT).
 * 
 * - `this.changes`: After running an update, the database reports how many rows were changed. 
 *   If `this.changes !== 1`, it means the update failed (likely because the user ID doesn't exist), 
 *   so it returns an error.
 */

// Updates a security setting (for Two-Factor Authentication replay protection) for a specific user.
const updateLastTotpStep = (userId, lastTotpStep) => {
  return new Promise((resolve, reject) => {
    const sql = 'UPDATE users SET lastTotpStep = ? WHERE id = ?';
    db.run(sql, [lastTotpStep, userId], function (err) {
      if (err) reject(err);
      if (this.changes !== 1) resolve({ error: 'User not found.' });
      else resolve(this.changes);
    });
  });
};

// Updates the financial/credit balance for a specific user.
const updateCredit = (userId, newCredit) => {
  return new Promise((resolve, reject) => {
    const sql = 'UPDATE users SET credit = ? WHERE id = ?';
    db.run(sql, [newCredit, userId], function (err) {
      if (err) reject(err);
      else if (this.changes !== 1) resolve({ error: 'User not found.' });
      else resolve(this.changes);
    });
  });
};

/*
 * Checking the Balance
 * This is a lightweight version of `getUserById`. Instead of grabbing the whole user profile, 
 * it only asks the database for one specific column: `credit`. It returns just that number.
 */
const getUserCredit = (userId) => {
  return new Promise((resolve, reject) => {
    const sql = 'SELECT credit FROM users WHERE id=?';
    db.get(sql, [userId], (err, row) => {
      if (err) reject(err);
      else if (row === undefined) resolve({ error: 'User not found.' });
      else resolve(row.credit);
    });
  });
};

/*
 * The Export
 * Just like the previous file exported the database connection, this file bundles all five 
 * of these functions into one neat object and exports them as the "default."
 * 
 * Now, anywhere else in your app, you can write `import userDao from './dao-users.mjs'` 
 * and use `userDao.getUser()` to securely log someone in!
 */
export default { getUserById, getUser, updateLastTotpStep, updateCredit, getUserCredit };
