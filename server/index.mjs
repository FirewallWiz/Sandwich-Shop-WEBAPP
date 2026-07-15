import express from 'express';
import morgan from 'morgan';
import { check, validationResult } from 'express-validator';
import cors from 'cors';
import passport from 'passport';
import LocalStrategy from 'passport-local';
import session from 'express-session';
import { TOTP } from 'otpauth';

import orderDao from './dao-orders.mjs';
import userDao from './dao-users.mjs';

const app = express();
app.use(morgan('dev'));
app.use(express.json());

const corsOptions = {
  origin: 'http://localhost:5173',
  credentials: true,
};
app.use(cors(corsOptions));

passport.use(new LocalStrategy(async function verify(username, password, callback) {
  const user = await userDao.getUser(username, password)
  if(!user)
    return callback(null, false, 'Incorrect username or password');  
    
  return callback(null, user);
}));

passport.serializeUser(function (user, callback) {
  callback(null, user);
});

passport.deserializeUser(function (user, callback) {
  return callback(null, user);
});

app.use(session({
  secret: "shhhhh... it's a secret! - change it for the exam!",
  resave: false,
  saveUninitialized: false,
}));
app.use(passport.authenticate('session'));

const isLoggedIn = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  return res.status(401).json({ error: 'Not authenticated' });
}

function isTotp(req, res, next) {
  if(req.session.method === 'totp')
    return next();
  return res.status(401).json({ error: 'Missing TOTP authentication'});
}

function verifyTotpToken(user, token) {
  const totp = new TOTP({
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: user.secret
  });

  const delta = totp.validate({ token, window: 1 });
  if (delta === null) {
    return false;
  }

  const currentCounter = totp.counter();
  const actualStep = currentCounter + delta;

  if (actualStep <= user.lastTotpStep)
    return false;

  user.lastTotpStep = actualStep;
  return true;
}

function clientUserInfo(req) {
  const user = req.user;
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    credit: user.credit,
    canDoTotp: user.secret ? true : false,
    isTotp: req.session.method === 'totp'
  };
}

const errorFormatter = ({ location, msg, param, value, nestedErrors }) => {
  return `${location}[${param}]: ${msg}`;
};


// PUBLIC APIs
app.get('/api/menu', async (req, res) => {
  try {
    const menu = await orderDao.getMenu();
    res.json(menu);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/availability', async (req, res) => {
  try {
    const availability = await orderDao.getAvailability();
    res.json(availability);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// AUTH APIs
app.post('/api/sessions', function (req, res, next) {
  passport.authenticate('local', (err, user, info) => {
    if (err) return next(err);
    if (!user) {
      return res.status(401).json({ error: info });
    }
    req.login(user, (err) => {
      if (err) return next(err);
      return res.json(clientUserInfo(req));
    });
  })(req, res, next);
});

app.get('/api/sessions/current', (req, res) => {
  if (req.isAuthenticated()) {
    res.status(200).json(clientUserInfo(req));
  } else
    res.status(401).json({ error: 'Not authenticated' });
});

app.delete('/api/sessions/current', (req, res) => {
  req.logout(() => {
    res.status(200).json({});
  });
});

app.post('/api/login-totp', isLoggedIn, async (req, res) => {
  if (!req.user.secret) {
    return res.status(400).json({ error: 'Cannot authenticate with TOTP' });
  }
  const success = verifyTotpToken(req.user, req.body.code);
  if (success) {
    req.session.method = 'totp';
    try {
      await userDao.updateLastTotpStep(req.user.id, req.user.lastTotpStep);
    } catch (err) {
      return res.status(503).json({ error: 'Database error' });
    }
    return res.json(clientUserInfo(req));
  } else {
    return res.status(401).json({ error: 'Cannot authenticate with TOTP' });
  }
});

// PROTECTED APIs
app.get('/api/orders', isLoggedIn, async (req, res) => {
  try {
    const orders = await orderDao.getOrdersByUser(req.user.id);
    res.json(orders);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/orders', isLoggedIn, [
  check('sandwiches').isArray({ min: 1 })
], async (req, res) => {
  const errors = validationResult(req).formatWith(errorFormatter);
  if (!errors.isEmpty()) {
    return res.status(422).json(errors.errors);
  }

  try {
    const menu = await orderDao.getMenu();
    const availability = await orderDao.getAvailability();
    const sandwiches = req.body.sandwiches;

    const validMainIngredients = ['roast beef', 'ham', 'bacon'];
    const validBreadTypes = ['wheat', 'brown'];
    const validIngredients = ['lettuce', 'olives', 'onions', 'cucumber', 'yellow cheese', 'tomatoes', 'mozzarella'];
    const validDressings = ['olive oil', 'mustard', 'mayonnaise'];
    const sizeConfig = {};
    menu.sizes.forEach(s => { sizeConfig[s.size] = s; });

    const sizeNeeded = { 'S': 0, 'M': 0, 'L': 0 };
    let totalSandwiches = 0;
    let totalPrice = 0;
    const processedSandwiches = [];

    for (const s of sandwiches) {
      if (!s.size || !sizeConfig[s.size]) {
        return res.status(422).json({ error: 'Invalid sandwich size: ' + s.size });
      }
      if (!s.mainIngredient || !validMainIngredients.includes(s.mainIngredient)) {
        return res.status(422).json({ error: 'Invalid main ingredient: ' + s.mainIngredient });
      }
      if (!s.breadType || !validBreadTypes.includes(s.breadType)) {
        return res.status(422).json({ error: 'Invalid bread type: ' + s.breadType });
      }
      if (!Number.isInteger(s.quantity) || s.quantity < 1) {
        return res.status(422).json({ error: 'Invalid quantity' });
      }

      const ingredients = s.ingredients || [];
      if (!Array.isArray(ingredients)) {
        return res.status(422).json({ error: 'Ingredients must be an array' });
      }
      for (const ing of ingredients) {
        if (!validIngredients.includes(ing)) {
          return res.status(422).json({ error: 'Invalid ingredient: ' + ing });
        }
      }
      if (new Set(ingredients).size !== ingredients.length) {
        return res.status(422).json({ error: 'Duplicate ingredients are not allowed' });
      }

      const dressings = s.dressings || [];
      if (!Array.isArray(dressings)) {
        return res.status(422).json({ error: 'Dressings must be an array' });
      }
      for (const dress of dressings) {
        if (!validDressings.includes(dress)) {
          return res.status(422).json({ error: 'Invalid dressing: ' + dress });
        }
      }
      if (new Set(dressings).size !== dressings.length) {
        return res.status(422).json({ error: 'Duplicate dressings are not allowed' });
      }
      if (dressings.length > sizeConfig[s.size].maxDressings) {
        return res.status(422).json({ error: 'Too many dressings for size ' + s.size + '. Max: ' + sizeConfig[s.size].maxDressings });
      }

      const config = sizeConfig[s.size];
      const extraIngredients = Math.max(0, ingredients.length - config.includedIngredients);
      const unitPrice = Math.round(config.basePrice * (1 + 0.3 * extraIngredients) * 100) / 100;

      sizeNeeded[s.size] += s.quantity;
      totalSandwiches += s.quantity;
      totalPrice += unitPrice * s.quantity;

      processedSandwiches.push({
        size: s.size,
        mainIngredient: s.mainIngredient,
        breadType: s.breadType,
        ingredients: ingredients,
        dressings: dressings,
        quantity: s.quantity,
        unitPrice: unitPrice
      });
    }

    if (totalSandwiches >= 4) {
      totalPrice = Math.round(totalPrice * 0.8 * 100) / 100;
    }
    totalPrice = Math.round(totalPrice * 100) / 100;

    for (const size of ['S', 'M', 'L']) {
      if (sizeNeeded[size] > availability[size]) {
        return res.status(422).json({ error: 'Not enough ' + size + ' sandwiches available. Available: ' + availability[size] + ', requested: ' + sizeNeeded[size] });
      }
    }

    const credit = await userDao.getUserCredit(req.user.id);
    if (credit.error) return res.status(404).json(credit);
    if (credit < totalPrice) {
      return res.status(422).json({ error: 'Insufficient credit. Your credit: ' + credit.toFixed(2) + '€, order total: ' + totalPrice.toFixed(2) + '€' });
    }

    const result = await orderDao.createOrder(req.user.id, processedSandwiches, totalPrice);

    const newCredit = Math.round((credit - totalPrice) * 100) / 100;
    await userDao.updateCredit(req.user.id, newCredit);
    req.user.credit = newCredit;

    res.json({ id: result.id, totalPrice: totalPrice, credit: newCredit });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/orders/:id', isLoggedIn, isTotp, [check('id').isInt({ min: 1 })], async (req, res) => {
  const errors = validationResult(req).formatWith(errorFormatter);
  if (!errors.isEmpty()) {
    return res.status(422).json(errors.errors);
  }
  try {
    const result = await orderDao.deleteOrder(req.user.id, Number(req.params.id));
    if (result.error) {
      return res.status(404).json(result);
    }
    
    const refund = Math.round(result.totalPrice * 0.9 * 100) / 100;
    const credit = await userDao.getUserCredit(req.user.id);
    if (credit.error) return res.status(404).json(credit);
    const newCredit = Math.round((credit + refund) * 100) / 100;
    await userDao.updateCredit(req.user.id, newCredit);

    req.user.credit = newCredit;

    res.status(200).json({ credit: newCredit, refund: refund });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Database error' });
  }
});

const PORT = 3001;
app.listen(PORT, (err) => {
  if (err) console.log(err);
  else console.log(`Server listening at http://localhost:${PORT}`);
});
