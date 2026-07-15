## React Client Application Routes

- Route `/`: Home page displaying the available sandwich sizes, ingredients, dressings, and current dynamic sandwich availability limits.
- Route `/login`: Login page handling credentials authentication. Triggers a two-step flow requiring a 6-digit TOTP code.
- Route `/configurator`: Sandwich configurator page allowing users to build a custom order. Handles live price calculation, duplicate checking, and limits.
- Route `/orders`: Shows the list of confirmed past orders for the logged-in user. Includes features to Duplicate (start a draft) or Delete(if 2FA authenticated) an order with 90% of the amount being refunded.

## API Server

- GET `/api/menu`
  - response body content: JSON object containing all configuration arrays (`sizes`, `mainIngredients`, `breadTypes`, `ingredients`, `dressings`).
- GET `/api/availability`
  - response body content: JSON object mapping sizes (S, M, L) to their remaining available daily limits.
- POST `/api/sessions`
  - request body content: `{ username: 'u1@p.it', password: 'pwd' }`
  - response body content: User object if successful (without password).
- GET `/api/sessions/current`
  - response body content: Logged-in User object, or 401 if unauthenticated.
- DELETE `/api/sessions/current`
  - response body content: Empty JSON `{}`, clears the session.
- POST `/api/login-totp`
  - request body content: `{ code: '123456' }`
  - response body content: Validates TOTP code against the secret and upgrades session if successful.
- GET `/api/orders`
  - response body content: Array of order objects (with nested populated sandwich/ingredient details) for the logged in user.
- POST `/api/orders`
  - request body content: Array of sandwich objects.
  - response body content: The `id` of the newly created order, total price, and updated user credit.
- DELETE `/api/orders/:id`
  - response body content: Deletes an order, restores availability, and returns the updated user credit (100% refunded) along with the refund amount.

## Database Tables

- Table `users` - contains `id`, `email`, `name`, `hash`, `salt`, `secret`, `lastTotpStep`, `credit`.
- Table `sandwich_sizes` - contains `size`, `base_price`, `included_ingredients`, `max_dressings`, `daily_limit`.
- Table `orders` - contains `id`, `user_id`, `total_price`.
- Table `order_sandwiches` - contains `id`, `order_id`, `size`, `main_ingredient`, `bread_type`, `quantity`, `unit_price`.
- Table `sandwich_ingredients` - contains `id`, `sandwich_id`, `ingredient`.
- Table `sandwich_dressings` - contains `id`, `sandwich_id`, `dressing`.

## Main React Components

- `App` (in `App.jsx`): Main router and global authentication state holder.
- `Home` (in `Home.jsx`): Displays menu details and live availability stock.
- `Configurator` (in `Configurator.jsx`): Complex state manager for building new sandwiches, validating rules, calculating dynamic pricing, and submitting orders.
- `OrderList` (in `OrderList.jsx`): Displays previously confirmed orders. Handles order duplication mapping and authenticated deletion operations.
- `Auth` (in `Auth.jsx`): Contains `LoginForm` and `TotpForm` components managing the multi-step login strategy.

## Screenshot

![Screenshot](./img/image.png)

## Users Credentials

- `u1@p.it`, `pwd` (Alice - 2FA enabled: `LXBSMDTMSP2I5XFXIYRGFVWSFI`)
- `u2@p.it`, `pwd` (Bob - 2FA enabled: `LXBSMDTMSP2I5XFXIYRGFVWSFI`)
- `u3@p.it`, `pwd` (Charlie - 2FA enabled: `LXBSMDTMSP2I5XFXIYRGFVWSFI`)
- `u4@p.it`, `pwd` (Diana - 2FA enabled: `LXBSMDTMSP2I5XFXIYRGFVWSFI`)
