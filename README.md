# Morrowline Taxi

Take the wheel in a procedurally illustrated neighborhood-driving game. The entire city is shown from a drone-like overhead view: find visible people waiting at the curb, drive to a selected passenger, stop nearby so they can board, then take them to their destination.

You can also free-drive in any unlocked neighborhood without selecting a passenger.

## Run locally

Requirements: Node.js 20 or newer. The game has no install-time or runtime packages.

```powershell
npm run dev
```

Open [http://localhost:4173](http://localhost:4173). For a production build:

```powershell
npm test
npm run build
npm start
```

`npm start` serves the production output at the same local address.

## Driving and passenger pickups

- Click a visible person on the city map or choose their name in the passenger list.
- Accept the pickup while stopped. Follow the gold route to the passenger's curbside marker.
- Park within 48 m at 3 km/h or less and press **Space** or **Pick up** to let them board.
- Follow the green route, then park by the destination and press **Space** to finish the fare.
- Every fare has a live deadline. Late deliveries are still completable, but reduce your pay and rating.
- Accelerate with **W** or **↑**; brake with **S** or **↓**. Holding reverse after stopping backs the taxi up.
- Free drive is always available in your current neighborhood. Explore, collect street coins, and decide when to accept a fare.
- Steer with **A/D**, **←/→**, or the on-screen steer controls. Hold the on-screen gas, brake, and reverse pedals on touch devices.
- Each neighborhood has a different deadline, traffic load, and number of roadwork barriers. Steer around the striped barriers; collisions damage the taxi and hurt your rating.
- Each stage has its own checklist: finish fares, meet on-time targets, and collect glowing coins from the streets. After completing it, pay a one-time entry permit from driver earnings to unlock the next neighborhood: Maple Heights $50, Riverside $100, Market District $175, and Airport Road $250. Replay fares to earn more if needed.
- A first-shift tutorial explains passenger pickups, driving controls, objectives, fuel, and repairs. Reopen it any time with **Instructions**.
- On-time fares earn 2 Morrow coins. Drive over the gold coin markers to collect more; spend coins on garage upgrades. Driver earnings pay fuel, repairs, and neighborhood entry permits.
- The displayed street speed limit, smooth braking, and collision-free driving affect passenger ratings and tips.
- Collisions and off-road driving damage the taxi. Damage reduces acceleration, top speed, and handling; at 100% damage the taxi stops until fully repaired. A full repair costs $110. If remaining cash is below the repair cost, the current district restarts with a repaired car and its objective progress reset; cash, upgrades, and other districts' progress are kept.
- Fuel is consumed as you drive. Stop near a marked service station and use **F** or **Refuel**. If the tank runs dry, roadside assistance offers a low-cost 5-litre top-up; the charge never exceeds your current balance.
- Fares are repeatable. A new neighborhood opens after each completed ride, so you can keep earning without a wallet, purchases, ads, or external services.

The map is a custom Canvas illustration with streets, crossings, houses, parks, traffic, roadside pedestrians, three fuel stations, the highlighted taxi, waiting people, and route markers. Use the on-map +/− controls or the mouse wheel to zoom; the view follows the taxi. It is an overhead 2D game rather than a 3D simulation.

## City and garage

Old Town opens first. Complete each neighborhood's fare, on-time, and coin checklist, then pay its entry permit from driver earnings to enter the next neighborhood. Entry permits are $50 for Maple Heights, $100 for Riverside, $175 for Market District, and $250 for Airport Road. Free-drive and repeat fares in an unlocked neighborhood to earn more. Each stage adds traffic and roadworks while narrowing the deadline cushion. Neighborhoods also set their own speed limits, fare rates, and route lengths.

The starting Morrowline S4 comes with a full 48 L tank and $400 in shift funds. Earnings and Morrow coins persist locally between sessions. A fare adds base pay, a distance component, and possible service/comfort tips. Fuel costs $1.85/L; the starter car consumes more fuel than an Economy Tune, and the Long-Range Tank adds 20 L. The starter taxi tops out at 61 km/h; the Performance Engine raises that to 82 km/h. Other upgrades include All-Weather Tyres and Comfort Cabin. Garage purchases use Morrow coins, show their cost and effect before confirmation, and cannot overdraw the coin balance.

## Save files

Cash, Morrow coins, ride history, driver rating, stage objectives, installed equipment, and preferences are stored in this browser. Previous taxi saves and the earlier courier-game save are automatically migrated, retaining compatible progress and preferences; previously earned fares preserve equivalent stage unlocks. Older saves are left untouched. Export a JSON backup in Settings to move progress; Restore Save validates the backup before loading. Browser local storage is not a cloud backup. The first-play tutorial dismissal is remembered separately in this browser.

## Optional Sepolia features

The game itself is a static website; Sepolia cannot host the web app. MetaMask is optional, and the game remains playable without it. Local Morrow coins and garage upgrades are browser saves, not cryptocurrency.

The optional Sepolia shop accepts **test ETH only**: Sunset/Tidal paint costs 0.00015 ETH once per paint; Fuel Boost and Repair Kit each cost 0.00005 ETH per use. Network gas is additional and shown separately before MetaMask asks for approval. Consumables are applied only after a successful on-chain receipt. The source contract is `contracts/MorrowlineTestnetShop.sol`; the store remains inactive until that contract is deployed to Sepolia and its address is set in `src/shop-config.js`. Purchases are held by the contract and can be withdrawn only by its deployer. Never share recovery phrases, passwords, private keys, or login codes.

Connecting MetaMask does not deploy or activate the shop. If the wallet panel says the contract is not deployed/configured and the Buy buttons are disabled, the shop is not yet available on the public site. The leaderboard also needs its own deployed address in `src/leaderboard-config.js`. The wallet panel can be scrolled independently on shorter screens.

To deploy the shop, run `npm run compile:shop`, start the local server with `npm run dev`, then open `http://localhost:4173/scripts/deploy-shop.html` in a browser with MetaMask. The deployment page estimates gas first and requires a separate confirmation in MetaMask. After deployment, set the reported contract address in `src/shop-config.js` and publish the site again. This page deploys the shop only; it does not deploy the leaderboard.

The optional top-ten leaderboard source is `contracts/MorrowlineLeaderboard.sol`; no leaderboard contract is deployed or configured. If enabled, submitted wallet addresses and scores are public and self-reported.

## Test and build

- `npm test` — gameplay, free driving, challenge and entry-permit progression, vehicle performance, repair/restart recovery, coins, save migration, map zoom, pedestrians, wallet-state checks, and leaderboard/shop Solidity and transaction behavior.
- `npm run build` — writes the static application to `dist/`.
- `npm run compile:contracts` — compiles the optional Solidity leaderboard for Sepolia deployment.
- `npm run compile:shop` — compiles the Sepolia testnet shop contract to an ignored local artifact.
- `npm run dev` — local development server.
- `npm start` — serves the production build.

The app is built from native JavaScript modules, HTML, and CSS. There are no third-party runtime packages or external asset downloads.

## Hosting status

Public play link: [Morrowline Taxi](https://joydeep404.github.io/-morrowline-taxi/).

The GitHub Actions workflow in `.github/workflows/pages.yml` builds and publishes the game to GitHub Pages whenever `main` is updated. The site is separate from Sepolia: a Sepolia contract does not host the game website. Neither the leaderboard nor the shop contract is deployed or connected by default.
