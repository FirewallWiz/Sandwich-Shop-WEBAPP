/** DB access module **/

/*
 * The `.mjs` extension is important because it tells Node.js to treat this file as an 
 * ECMAScript Module (ES Module). This allows you to use modern `import` and `export` 
 * syntax rather than the older `require()` syntax.
 */

/*
 * This line brings the `sqlite3` library (which you presumably installed via npm) into your file. 
 * It assigns the library's functionality to the variable `sqlite` so you can use it in the rest of the script.
 */
import sqlite from 'sqlite3';

/*
 * "open the database" is a single-line comment. The JavaScript engine ignores anything after `//`. 
 * It's just there as a helpful note for you or other developers reading the code.
 */
// open the database

/*
 * This line does a lot of heavy lifting. Let's break it into three parts:
 * - `const db =`: This creates a constant variable named `db` to store your active database connection.
 * - `new sqlite.Database('sandwiches.db', ...)`: This creates a new database object. It tells the `sqlite3` 
 *   library to look for a file named `sandwiches.db` in your project folder and open it. If that file doesn't 
 *   exist yet, SQLite will automatically create it for you.
 * - `(err) => {`: This is an "arrow function" that acts as a callback. It executes immediately after SQLite 
 *   attempts to open the database file. If something goes wrong (like a permissions issue), the `err` variable 
 *   will contain the error details. If it succeeds, `err` will be `null`.
 */
const db = new sqlite.Database('sandwiches.db', (err) => {
  /*
   * This line lives inside the callback function mentioned above. It checks if an error occurred 
   * during the connection attempt. If `err` exists, `throw err;` immediately stops the program and 
   * prints the error message to your console. This is a "fail-fast" approach—if your server can't connect 
   * to its database, it's usually best to crash immediately rather than running broken.
   */
  if (err) throw err;
/*
 * This simply closes the callback function block `}` and the `sqlite.Database()` method call `)`.
 */
});

/*
 * This makes your configured database connection (`db`) available to the rest of your application. 
 * When other files in your project need to read or write to the database, they can simply write 
 * `import db from './server/db.mjs'` to use this exact, already-opened connection.
 * 
 * You use this when a file is designed to do exactly one main thing. A file can only have one default export.
 * 
 * Why it's useful: Because it is the "default," whoever imports it doesn't need to know its exact original name, 
 * and they don't have to use curly braces. They can just grab the main export and name it whatever makes sense 
 * in their current file:
 * 
 * // You can import it with the same name:
 * import db from './db.mjs';
 * 
 * // Or you can rename it on the fly, and JS knows you mean the default export:
 * import myDatabaseConnection from './db.mjs'; 
 * 
 * In your database example, server/db.mjs only exists to set up and provide that specific database connection. 
 * So, making db the default export makes perfect sense.
 */
export default db;
