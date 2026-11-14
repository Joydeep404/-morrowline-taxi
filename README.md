# Morrowline Taxi

Take the wheel in a procedurally illustrated neighborhood-driving game. The entire city is shown from a drone-like overhead view: find visible people waiting at the curb, drive to a selected passenger, stop nearby so they can board, then take them to their destination.

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
- Steer with **A/D**, **←/→**, or the on-screen steer controls. Hold the on-screen gas, brake, and reverse pedals on touch devices.
- Each neighborhood has a different deadline, traffic load, and number of roadwork barriers. Steer around the striped barriers; collisions damage the taxi and hurt your rating.
- Each stage has its own checklist: finish fares, meet on-time targets, and collect glowing coins from the streets. Completing the checklist unlocks the next neighborhood.
- On-time fares earn 2 Morrow coins. Drive over the gold coin markers to collect more; spend coins on garage upgrades.
- The displayed street speed limit, smooth braking, and collision-free driving affect passenger ratings and tips.
- Fuel is consumed as you drive. Stop near a marked service station and use **F** or **Refuel**. If the tank runs dry, roadside assistance offers a low-cost 5-litre top-up; the charge never exceeds your current balance.
- Fares are repeatable. A new neighborhood opens after each completed ride, so you can keep earning without a wallet, purchases, ads, or external services.

The map is a custom Canvas illustration with streets, crossings, houses, parks, traffic, the taxi, waiting people, and route markers. It is an overhead 2D game rather than a 3D simulation.

## City and garage

Old Town opens first, followed by Maple Heights, Riverside, Market District, and Airport Road when the previous stage's fare, on-time, and coin checklist is complete. Each stage adds traffic and roadworks while narrowing the deadline cushion. Neighborhoods also set their own speed limits, fare rates, and route lengths.

The starting Morrowline S4 comes with a full 48 L tank and $400 in shift funds. Earnings and Morrow coins persist locally between sessions. A fare adds base pay, a distance component, and possible service/comfort tips. Fuel costs $1.85/L; the starter car consumes more fuel than an Economy Tune, and the Long-Range Tank adds 20 L. The Performance Engine raises acceleration and top speed from 55 to 78 km/h. Other upgrades include All-Weather Tyres and Comfort Cabin. Garage purchases use Morrow coins, show their cost and effect before confirmation, and cannot overdraw the coin balance.

## Save files

Cash, Morrow coins, ride history, driver rating, stage objectives, installed equipment, and preferences are stored in this browser. Previous taxi saves and the earlier courier-game save are automatically migrated, retaining compatible progress and preferences; previously earned fares preserve equivalent stage unlocks. Older saves are left untouched. Export a JSON backup in Settings to move progress; Restore Save validates the backup before loading. Browser local storage is not a cloud backup.

## Optional Sepolia leaderboard

The game itself is a static website; Sepolia cannot host the web app. MetaMask is optional, and the game remains playable without it. The workspace includes source and UI code for an optional top-ten Sepolia leaderboard, but no contract is deployed or configured. If enabled in a future release, submitted wallet addresses and scores will be public and self-reported. Local Morrow coins and garage upgrades are browser saves, not cryptocurrency. Never share recovery phrases, passwords, private keys, or login codes.

## Test and build

- `npm test` — gameplay, stage objective gates, upgrade-driven performance, coin collection, save migration, wallet-state checks, and leaderboard Solidity/ABI behavior.
- `npm run build` — writes the static application to `dist/`.
- `npm run compile:contracts` — compiles the optional Solidity leaderboard for Sepolia deployment.
- `npm run dev` — local development server.
- `npm start` — serves the production build.

The app is built from native JavaScript modules, HTML, and CSS. There are no third-party runtime packages or external asset downloads.

## Hosting status

`render.yaml` contains static-site build settings, but this workspace has not been published and has no shareable public URL. A public web host is separate from Sepolia: a Sepolia contract does not host the game website. No leaderboard contract is deployed or connected.
