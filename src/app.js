import { DISTRICTS, GARAGE_ITEMS } from "./districts.js";
import {
  acceptRide, advanceShift, applyFuelBoost, applyRepairKit, availableDistricts, canParkAt, canUnlockDistrict, CITY, createShift,
  distanceTo, dropOffPassenger, findPassenger, formatMoney, getCarStats, getDistrict,
  getStageProgress, isOnRoad, isStageComplete, newProfile, nextFuelStation, purchaseGarageItem, REPAIR_CENTS_PER_DAMAGE, refuel, repairCar,
  roadsideAssistance, takePassenger, unlockDistrict
} from "./game.js";
import { exportSave, importSave, loadProfile, saveProfile } from "./save.js";
import { createRoadRenderer, getMapTransform } from "./renderer.js";
import { connectWallet, describeWallet, SEPOLIA_CHAIN_ID, SEPOLIA_EXPLORER, shortenAddress, switchToSepolia, walletStatus } from "./wallet.js";
import { LEADERBOARD_CONTRACT_ADDRESS } from "./leaderboard-config.js";
import { estimateProgressSubmission, readLeaderboard, sendProgressSubmission } from "./leaderboard.js";
import { SHOP_CONTRACT_ADDRESS } from "./shop-config.js";
import {
  estimateShopConsumption, estimateShopPurchase, formatEth, readShopInventory,
  sendShopTransaction, SHOP_ITEMS, verifySepoliaAccount
} from "./shop.js";

const app = document.querySelector("#app");
const importFile = document.querySelector("#import-file");
let profile;
let shift;
let selectedDistrict = DISTRICTS[0].id;
let selectedPassengerId = null;
let wallet = walletStatus(window.ethereum);
let walletMessage = "";
let leaderboardEntries = [];
let leaderboardMessage = "";
let pendingProgress = null;
let leaderboardLoading = false;
let shopInventory = new Map();
let shopMessage = "";
let shopLoading = false;
let pendingShop = null;
let mapZoom = 1;
let saveWarning = "";
let tutorialOpen = false;
let toastTimer;
let eventSound = null;
let lastFrame = 0;
let lastHudUpdate = 0;
const heldControls = new Set();
const TUTORIAL_SEEN_KEY = "morrowline.tutorial-seen.v1";

try {
  tutorialOpen = localStorage.getItem(TUTORIAL_SEEN_KEY) !== "true";
} catch (error) {
  saveWarning = `Tutorial preference could not be read: ${error.message}`;
  tutorialOpen = true;
}

function getTaxiPaintColor() {
  return profile.settings.taxiPaint === "sunset" ? "#ef9a56" :
    profile.settings.taxiPaint === "tidal" ? "#43b6a4" : "#f1c84f";
}

try {
  profile = loadProfile();
} catch (error) {
  profile = newProfile();
  saveWarning = `A saved game could not be loaded: ${error.message}`;
}

shift = createShift(profile, selectedDistrict);

function escapeText(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function persist() {
  try {
    saveProfile(profile);
    saveWarning = "";
  } catch (error) {
    showToast(`Save error: ${error.message}`);
  }
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 3200);
}

function playBell() {
  if (!profile.settings.sound) return;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  eventSound ??= new AudioContext();
  if (eventSound.state === "suspended") eventSound.resume();
  const oscillator = eventSound.createOscillator();
  const gain = eventSound.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = 620;
  gain.gain.setValueAtTime(.035, eventSound.currentTime);
  gain.gain.exponentialRampToValueAtTime(.001, eventSound.currentTime + .32);
  oscillator.connect(gain);
  gain.connect(eventSound.destination);
  oscillator.start();
  oscillator.stop(eventSound.currentTime + .32);
}

function getTarget() {
  if (shift.trip?.status === "to-pickup") return { type: "pickup", point: shift.trip.pickupAt, label: `${shift.passenger.name} · pickup` };
  if (shift.trip?.status === "to-dropoff") return { type: "dropoff", point: shift.trip.dropoffAt, label: `Drop-off · ${shift.passenger.destination}` };
  return { type: "fuel", point: nextFuelStation(shift), label: "Service station" };
}

function getDriveStatus() {
  if (shift.status === "disabled") return "VEHICLE DISABLED";
  if (shift.status === "stranded") return "ROADSIDE STOP";
  if (shift.trip?.status === "to-dropoff") return "FARE IN PROGRESS";
  if (shift.trip?.status === "to-pickup") return "DRIVING TO PICKUP";
  return "FREE DRIVE";
}

function getTargetDistance() {
  return Math.round(distanceTo(shift, getTarget().point));
}

function formatDeadline(seconds) {
  if (!Number.isFinite(seconds)) return "—";
  const remaining = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`;
}

function canChangeDistrict() {
  return shift.status !== "disabled" && shift.damage < 100 &&
    shift.trip?.status !== "to-pickup" && shift.trip?.status !== "to-dropoff";
}

function getActionText() {
  if (shift.status === "disabled") return "Repair taxi to continue";
  if (shift.stranded) return "Call roadside assistance";
  if (shift.trip?.status === "to-pickup") {
    const gap = distanceTo(shift, shift.trip.pickupAt);
    if (gap > 48) return `Drive to ${shift.passenger.name} · ${Math.round(gap)} m`;
    if (Math.abs(shift.speed) > 3) return "Stop beside the waiting passenger";
    return `Pick up ${shift.passenger.name}`;
  }
  if (shift.trip?.status === "to-dropoff") {
    const gap = distanceTo(shift, shift.trip.dropoffAt);
    if (gap > 48) return `Drive to destination · ${Math.round(gap)} m`;
    if (Math.abs(shift.speed) > 3) return "Stop for passenger to get out";
    return "Complete fare";
  }
  if (shift.serviceNearby && Math.abs(shift.speed) <= 2 && shift.fuel < shift.maxFuel - .1) return "Refuel at station";
  if (selectedPassengerId) {
    const person = findPassenger(shift, selectedPassengerId);
    if (person?.state === "waiting") {
      if (Math.abs(shift.speed) > 3) return "Stop the taxi before accepting";
      return `Accept ${person.name}'s pickup`;
    }
  }
  return "Free drive · choose a rider for a fare";
}

function renderHeader() {
  const walletLabel = wallet.state === "connected" ? shortenAddress(wallet.address) :
    wallet.state === "wrong-network" ? "Wrong network" : "Wallet optional";
  return `<header class="topbar">
    <a class="brand" href="#" aria-label="Morrowline Taxi home"><span class="brand-mark" aria-hidden="true">M</span><span><strong>MORROWLINE</strong><small>NEIGHBORHOOD TAXI SERVICE</small></span></a>
    <div class="topbar-status">
      <span class="cash-chip" aria-label="Taxi earnings ${formatMoney(profile.cashCents)}"><span>＄</span><strong>${formatMoney(profile.cashCents)}</strong><small>DRIVER EARNINGS</small></span>
      <span class="cash-chip coin-chip" aria-label="${profile.coins} Morrow coins"><span>✦</span><strong id="coin-count">${profile.coins}</strong><small>MORROW COINS</small></span>
      <span class="rating-chip"><b>★ ${profile.reputation.toFixed(1)}</b><small>DRIVER RATING</small></span>
      <button class="instructions-button" id="instructions-button" data-action="tutorial-open">Instructions</button>
      <button class="wallet-chip" data-action="wallet-open" aria-label="Open optional Sepolia wallet panel"><span class="wallet-dot ${wallet.state}"></span>${walletLabel}</button>
    </div>
    <div class="city-progress" aria-label="Neighborhoods unlocked"><span>NEIGHBORHOODS</span>${DISTRICTS.map((district, index) => {
      const unlocked = availableDistricts(profile).includes(district);
      return `<i title="${escapeText(district.name)}" class="${unlocked ? "unlocked" : ""} ${profile.districtsVisited.includes(district.id) ? "visited" : ""}">${profile.districtsVisited.includes(district.id) ? "✓" : index + 1}</i>`;
    }).join("")}<small>${profile.districtsVisited.length}/${DISTRICTS.length} explored · ${profile.rides} fares</small></div>
  </header>`;
}

function renderTutorial() {
  if (!tutorialOpen) return "";
  return `<div class="tutorial-backdrop" data-action="tutorial-backdrop">
    <section class="tutorial-dialog" role="dialog" aria-modal="true" aria-labelledby="tutorial-title" tabindex="-1">
      <div class="panel-heading"><div><span class="eyebrow">QUICK DRIVER BRIEFING</span><h2 id="tutorial-title">Your first taxi shift</h2></div><button class="icon-button" data-action="tutorial-close" aria-label="Close instructions">×</button></div>
      <ol class="tutorial-steps">
        <li><b>Choose a rider.</b><span>Click a person on the city map or select a name in Available Riders, then accept the pickup.</span></li>
        <li><b>Pick up and drop off.</b><span>Follow the gold route to the curb. Stop within 48 m and press Space. Follow the green route, park near the destination, and press Space again.</span></li>
        <li><b>Drive carefully.</b><span>W / ↑ accelerates, S / ↓ brakes, A/D or ←/→ steers, and R reverses. Avoid traffic, barriers, and grass.</span></li>
        <li><b>Free drive or take a fare.</b><span>Drive any time with W / ↑. Choose a rider whenever you want a fare; complete the neighborhood challenge and pay its entry permit from driver earnings to move on.</span></li>
        <li><b>Spend your rewards wisely.</b><span>Collect glowing coins and earn 2 coins for each on-time fare. Use coins for garage upgrades; driver earnings pay fuel, repairs, and the next neighborhood permit.</span></li>
        <li><b>Look after your taxi.</b><span>Refuel at an F station. Damage reduces speed and handling; at 100% the taxi stops until repaired. If you cannot afford a full repair, the current district restarts and its task progress resets, but your remaining cash and upgrades stay.</span></li>
      </ol>
      <button class="button button-primary full-button" data-action="tutorial-close">Got it — start driving</button>
    </section>
  </div>`;
}

function renderTripPanel() {
  const activePickup = shift.trip?.status === "to-pickup";
  const activeDropoff = shift.trip?.status === "to-dropoff";
  const complete = shift.trip?.status === "complete";
  const person = shift.passenger;
  const targetText = activePickup ? "Passenger waiting at curb" : activeDropoff ? person.destination : complete ? "Fare complete" : "Choose a waiting rider";
  const deadlineText = shift.trip && (activePickup || activeDropoff) ? formatDeadline(shift.trip.deadlineSeconds) :
    complete ? shift.trip.late ? "LATE" : "ON TIME" : "Starts on acceptance";
  return `<section class="panel trip-panel">
    <div class="panel-heading"><div><span class="eyebrow">${activePickup ? "PICKUP REQUEST" : activeDropoff ? "PASSENGER ON BOARD" : complete ? "LAST FARE" : "AVAILABLE RIDERS"}</span><h2>${person && (activePickup || activeDropoff || complete) ? escapeText(person.name) : "Who's going your way?"}</h2></div><span class="passenger-icon">${activeDropoff ? "♙" : "♧"}</span></div>
    <div class="trip-destination"><span class="destination-pin">${activeDropoff ? "◎" : "⌖"}</span><div><small>${activePickup ? "PICK UP IN PERSON" : activeDropoff ? "PASSENGER DESTINATION" : "SELECT A PERSON ON THE MAP"}</small><b>${escapeText(targetText)}</b></div></div>
      <div class="trip-stats">
      <span><small>FARE ESTIMATE</small><b id="fare-estimate">${shift.trip && (activePickup || activeDropoff) ? `${formatMoney(shift.trip.fareBaseCents)}+` : "Based on distance"}</b></span>
      <span><small>DELIVERY DEADLINE</small><b id="fare-deadline" class="${shift.trip?.late ? "late" : ""}">${deadlineText}</b></span>
    </div>
    <div class="waiting-list" aria-label="Waiting passengers">${shift.passengers.filter((rider) => rider.state === "waiting").slice(0, 5).map((rider) => `
      <button class="waiting-person ${selectedPassengerId === rider.id ? "selected" : ""}" data-action="select-passenger" data-id="${rider.id}" ${activePickup || activeDropoff ? "disabled" : ""}>
        <span class="person-avatar" aria-hidden="true">♟</span><span class="person-details"><b>${escapeText(rider.name)}</b><small>Waiting · ${escapeText(streetNameFor(rider))}</small></span><span class="person-distance">${Math.round(distanceTo(shift, rider))}m</span>
      </button>`).join("")}</div>
    ${activePickup ? `<p class="passenger-note"><span>●</span> <b>${escapeText(person.name)}</b> is waiting at the glowing curb marker. Drive up and park next to them; press Space to let them in. Late fares remain deliverable for reduced pay.</p>` : activeDropoff ? `<p class="passenger-note"><span>●</span> Passenger aboard. Follow the green route and park by the destination marker. A missed deadline lowers pay and rating.</p>` : `<p class="passenger-note"><span>●</span> Riders are visible on the overhead map. Click a person or their name, then accept the pickup.</p>`}
    <button class="button button-primary full-button ride-action" data-action="ride-action" ${shift.status === "disabled" ? "disabled" : shift.status === "stranded" ? "" : activePickup && distanceTo(shift, shift.trip.pickupAt) > 48 ? "disabled" : activeDropoff && distanceTo(shift, shift.trip.dropoffAt) > 48 ? "disabled" : !activePickup && !activeDropoff && !selectedPassengerId ? "disabled" : !activePickup && !activeDropoff && Math.abs(shift.speed) > 3 ? "disabled" : ""}>${escapeText(getActionText())}<span>↗</span></button>
  </section>`;
}

function streetNameFor(person) {
  const names = ["Oak Street", "Pine Avenue", "Market Road", "Station Way", "River Street", "Maple Lane"];
  return names[Math.round(person.y / 240 + person.x / 390) % names.length];
}

function renderDistrictPanel() {
  const district = getDistrict(selectedDistrict);
  const progress = getStageProgress(profile, district.id);
  const objective = district.objective;
  return `<section class="panel district-panel">
    <div class="panel-heading"><div><span class="eyebrow">CHOOSE NEIGHBORHOOD</span><h2>City map</h2></div><span class="map-mark">N</span></div>
    <div class="district-list">${DISTRICTS.map((district, index) => {
      const unlocked = availableDistricts(profile).some((item) => item.id === district.id);
      const visited = profile.districtsVisited.includes(district.id);
      const previousDistrict = DISTRICTS[index - 1];
      const challengeReady = index > 0 && isStageComplete(profile, previousDistrict.id);
      const canUnlock = !unlocked && canUnlockDistrict(profile, district.id);
      const shortfall = Math.max(0, district.entryFeeCents - profile.cashCents);
      const state = visited ? "VISITED" : unlocked ? `${district.roadworks.length} WORKS` :
        challengeReady ? shortfall ? `NEED ${formatMoney(shortfall)}` : `UNLOCK ${formatMoney(district.entryFeeCents)}` : "CHALLENGE";
      return `<button class="district-card ${selectedDistrict === district.id ? "selected" : ""} ${unlocked ? "" : "locked"}" data-action="${canUnlock ? "unlock-district" : "district"}" data-id="${district.id}" ${canChangeDistrict() && (unlocked || canUnlock) ? "" : "disabled"}>
        <span class="district-numeral">${visited ? "✓" : unlocked ? `0${index + 1}` : "⌑"}</span><span class="district-copy"><b>${escapeText(district.name)}</b><small>${escapeText(district.subtitle)} · ${escapeText(district.difficulty)}</small></span><span class="district-state">${escapeText(state)}</span>
      </button>`;
    }).join("")}</div>
    <div class="stage-objective"><div class="objective-heading"><b>STAGE ${DISTRICTS.indexOf(district) + 1} TASK</b><span>${progress.fares >= objective.fares && progress.onTimeFares >= objective.onTimeFares && progress.coins >= objective.coins ? "COMPLETE" : "IN PROGRESS"}</span></div>
      <div class="objective-row"><span>Complete fares</span><b id="task-fares">${Math.min(progress.fares, objective.fares)} / ${objective.fares}</b></div>
      <div class="objective-row"><span>Finish on time</span><b id="task-ontime">${Math.min(progress.onTimeFares, objective.onTimeFares)} / ${objective.onTimeFares}</b></div>
      <div class="objective-row"><span>Collect street coins</span><b id="task-coins">${Math.min(progress.coins, objective.coins)} / ${objective.coins}</b></div>
      <small>Drive over the glowing coins while completing fares. On-time rides also earn 2 coins.</small>
    </div>
    <p class="side-note">Complete this challenge, then pay the next neighborhood's entry permit with driver earnings. Collectible Morrow coins buy garage upgrades. Free drive is always available in unlocked areas.</p>
  </section>
  <section class="panel shift-card"><div class="panel-heading"><div><span class="eyebrow">YOUR SHIFT</span><h2>Taxi meter</h2></div><span class="shift-icon">◷</span></div>
    <div class="shift-stat"><span>Distance driven</span><b id="odometer">${(shift.distance / 1000).toFixed(2)} km</b></div><div class="shift-stat"><span>Fares finished</span><b id="shift-fares">${shift.tripCount}</b></div><div class="shift-stat"><span>Car condition</span><b id="car-condition">${Math.max(0, 100 - shift.damage).toFixed(0)}%</b></div>
    <button class="text-button end-shift" data-action="end-shift" ${canChangeDistrict() ? "" : "disabled"}>Park and change neighborhood →</button>
  </section>`;
}

function formatClock(minutes) {
  const hour = Math.floor(minutes / 60) % 24;
  const minute = Math.floor(minutes % 60);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function renderDrivingPanel() {
  const district = getDistrict(shift.districtId);
  const target = getTarget();
  return `<section class="panel driving-panel">
    <div class="drive-topline"><div><span class="eyebrow">LIVE DRONE VIEW · STAGE ${DISTRICTS.indexOf(district) + 1} · ${escapeText(district.difficulty)} · ${formatClock(shift.clockMinutes)}</span><h1>${escapeText(district.name)}</h1></div>    <div class="shift-live"><i></i><span id="drive-status">${getDriveStatus()}</span></div></div>
    <div class="scene-wrap">
      <canvas id="road-scene" tabindex="0" aria-label="Top-down drone view of the entire neighborhood: roads, homes, traffic, waiting passengers, taxi, and route. Click a person to choose them. Use WASD or arrow keys to drive."></canvas>
      <div class="scene-hud scene-hud-left"><span class="weather-pill"><i></i> CLEAR · DRY STREETS</span><span class="street-pill" id="street-name">${escapeText(streetNameFor({ x: shift.x, y: shift.y }))}</span></div>
      <div class="map-target-chip" id="map-target"><span id="route-symbol">${shift.trip?.status === "to-dropoff" ? "◎" : "⌖"}</span><span><small id="route-type">${shift.trip?.status === "to-pickup" ? "PASSENGER WAITING" : shift.trip?.status === "to-dropoff" ? "DROP-OFF LOCATION" : "SERVICE STATION"}</small><b id="route-distance">${Math.max(0, getTargetDistance())}m</b></span></div>
      <div class="map-zoom-controls" aria-label="Map zoom controls"><button data-action="map-zoom-out" aria-label="Zoom out">−</button><span id="map-zoom-level">${Math.round(mapZoom * 100)}%</span><button data-action="map-zoom-in" aria-label="Zoom in">+</button></div>
      <div class="speedometer"><strong id="speed">${Math.round(shift.speed)}</strong><span>KM/H</span><small>${district.limit} LIMIT</small><div class="speed-track"><i id="speed-meter"></i></div></div>
      <div class="scene-message" id="scene-message" role="status" aria-live="polite">${escapeText(shift.lastEvent)}</div>
      ${shift.status === "disabled" ? `<div class="stranded-cover disabled-cover"><b>TAXI DISABLED · 100% DAMAGE</b><span>Repair the car before driving. Any active fare will be cancelled.</span><button class="button button-primary" data-action="repair">Repair fully · ${formatMoney(Math.ceil(shift.damage * REPAIR_CENTS_PER_DAMAGE))}</button></div>` :
        shift.status === "stranded" ? `<div class="stranded-cover"><b>OUT OF FUEL</b><span>Roadside assistance can bring an emergency top-up.</span><button class="button button-primary" data-action="assist">Call roadside assistance</button></div>` : ""}
    </div>
    <div class="drive-dashboard">
      <div class="dashboard-cell"><span class="dash-icon fuel-icon">◒</span><div><small>FUEL</small><b><span id="fuel">${shift.fuel.toFixed(1)}</span> / ${shift.maxFuel} L</b><div class="mini-track"><i id="fuel-meter" class="${shift.fuel < 9 ? "low" : ""}" style="width:${shift.fuel / shift.maxFuel * 100}%"></i></div></div></div>
      <div class="dashboard-cell"><span class="dash-icon">⌖</span><div><small>ROUTE</small><b id="target-label">${escapeText(target.label)}</b><span id="target-distance-copy">In ${Math.max(0, getTargetDistance())} m</span></div></div>
      <div class="dashboard-cell"><span class="dash-icon fare-icon">＄</span><div><small>SHIFT FARES</small><b id="shift-fare">${formatMoney(shift.fareTotalCents)}</b><span id="ride-rating">${shift.trip?.rating ? `Last ride · ${shift.trip.rating.toFixed(1)} ★` : "Drive safely to earn a tip"}</span></div></div>
    </div>
    <div class="drive-controls"><div class="steer-control"><small>STEER</small><div class="control-buttons"><button data-control="left" aria-label="Steer left">←</button><button data-control="right" aria-label="Steer right">→</button></div></div>
      <div class="control-help"><span>W / ↑ accelerate</span><span>A D / ← → steer</span><span>S / ↓ brake · Space action</span><span>R reverse</span></div>
      <div class="pedal-control"><button data-control="reverse" aria-label="Reverse">REV</button><button data-control="brake" aria-label="Brake">BRAKE</button><button data-control="accelerate" aria-label="Accelerate">GAS <span>▲</span></button></div>
    </div>
  </section>`;
}

function renderRightPanel() {
  const target = getTarget();
  const fuelStation = nextFuelStation(shift);
  const refuelNearby = distanceTo(shift, fuelStation) < 52 && shift.speed <= 2 && shift.trip?.status !== "to-dropoff";
  return `<aside class="right-column">
    <section class="panel map-legend-panel"><div class="panel-heading"><div><span class="eyebrow">LIVE CITY MAP</span><h2>Reading the streets</h2></div><span class="route-compass">⌖</span></div>
      <div class="legend-row"><i class="legend-taxi">▰</i><span><b>Your taxi</b><small>Rotates with the steering</small></span></div>
      <div class="legend-row"><i class="legend-rider">♟</i><span><b>Waiting people</b><small>Click one to accept a pickup</small></span></div>
      <div class="legend-row"><i class="legend-route">┈</i><span><b>Route line</b><small>Gold to pickup · green to destination · no route in free drive</small></span></div>
      <div class="legend-row"><i class="legend-barrier">▨</i><span><b>Roadworks</b><small>${shift.roadworks.length} barriers · steer around closed lanes</small></span></div>
      <div class="legend-row"><i class="legend-coin">✦</i><span><b>Street coins</b><small>Drive over glowing coins to collect</small></span></div>
      <div class="legend-row"><i class="legend-fuel">F</i><span><b>Fuel station</b><small>Stop here to refill</small></span></div>
      <div class="map-note">Zoom in to explore streets and pedestrians; the view follows your taxi. Use the +/− controls or your mouse wheel.</div>
    </section>
    <section class="panel car-panel"><div class="panel-heading"><div><span class="eyebrow">YOUR VEHICLE</span><h2>Morrowline S4</h2></div><span class="car-icon">▰</span></div>
      <div class="vehicle-illustration" aria-hidden="true"><span class="car-shadow"></span><span class="car-body"><i></i><b></b><em></em></span><span class="vehicle-plate">CITY TAXI</span></div>
      <div class="car-stat"><span>Fuel tank</span><b id="right-fuel">${shift.fuel.toFixed(1)} L <small>of ${shift.maxFuel}</small></b></div>
      <div class="car-stat"><span>Top speed</span><b id="right-top-speed">${Math.round(getCarStats(profile, shift.damage).maxSpeed)} km/h</b></div>
      <div class="car-stat"><span>Condition</span><b id="right-condition">${Math.max(0, 100 - shift.damage).toFixed(0)}%</b></div>
      <div class="car-stat"><span>Tyres</span><b>${profile.upgrades.includes("safety-tyres") ? "All-weather" : "Standard"}</b></div>
      ${refuelNearby ? `<button class="button button-secondary service-action" data-action="refuel">Refuel · about ${formatMoney(Math.round((shift.maxFuel - shift.fuel) * 185))}</button>` : ""}
      ${shift.damage > 0 && (canChangeDistrict() || shift.status === "disabled") ? `<button class="button button-secondary service-action" data-action="repair">${shift.status === "disabled" ? `Repair fully · ${formatMoney(Math.ceil(shift.damage * REPAIR_CENTS_PER_DAMAGE))}` : `Repair · from ${formatMoney(Math.min(Math.ceil(shift.damage * REPAIR_CENTS_PER_DAMAGE), profile.cashCents))}`}</button>` : ""}
      <p class="fuel-tip">${distanceTo(shift, fuelStation) < 650 ? `Fuel station is ${Math.round(distanceTo(shift, fuelStation))} m away.` : "Fuel costs $1.85/L. Roadside assistance prevents a fuel soft-lock."}</p>
      <span class="hidden-target" id="refuel-distance">${Math.round(distanceTo(shift, fuelStation))}</span>
    </section>
    <section class="panel garage-panel"><div class="panel-heading"><div><span class="eyebrow">OPTIONAL EQUIPMENT</span><h2>Garage</h2></div><span class="garage-icon">⚙</span></div>
      <div class="garage-list">${GARAGE_ITEMS.map((item) => {
        const owned = profile.upgrades.includes(item.id);
        const canBuy = profile.coins >= item.coinCost && !owned;
        return `<div class="garage-item ${owned ? "owned" : ""}"><div class="garage-item-head"><b>${escapeText(item.name)}</b><span>${owned ? "FITTED" : `✦ ${item.coinCost}`}</span></div><p>${escapeText(item.description)}</p><button class="upgrade-button" data-action="buy-upgrade" data-id="${item.id}" ${owned || !canBuy || Math.abs(shift.speed) > 2 || !canChangeDistrict() ? "disabled" : ""}>${owned ? "Installed" : canBuy ? "Review & fit" : `Need ${item.coinCost - profile.coins} more coins`}</button></div>`;
      }).join("")}</div>
    </section>
    <section class="panel settings-panel"><div class="panel-heading"><div><span class="eyebrow">PREFERENCES & BACKUP</span><h2>Settings</h2></div></div>
      <label class="setting-row"><span><b>Sound cue</b><small>Soft chime for fare events</small></span><input type="checkbox" data-setting="sound" ${profile.settings.sound ? "checked" : ""}><i class="toggle"></i></label>
      <label class="setting-row"><span><b>Reduced motion</b><small>Remove subtle road shimmer</small></span><input type="checkbox" data-setting="reducedMotion" ${profile.settings.reducedMotion ? "checked" : ""}><i class="toggle"></i></label>
      <div class="restart-actions"><button class="button button-secondary" data-action="restart-level">Restart current level</button><button class="button button-danger" data-action="restart-game">Restart whole game</button></div>
      <p class="save-note">Restarting the level cancels the current fare but keeps your earnings, upgrades, and challenge progress. Restarting the whole game resets local progress only; on-chain shop items are not affected.</p>
      <div class="backup-actions"><button class="text-button" data-action="export">Export taxi save</button><button class="text-button" data-action="import">Restore save</button></div>
      <p class="save-note">Progress stays in this browser. Download a JSON backup to move it to another device.</p>
    </section>
  </aside>`;
}

function renderWalletPanel() {
  const contractReady = /^0x[0-9a-f]{40}$/i.test(LEADERBOARD_CONTRACT_ADDRESS);
  const shopReady = /^0x[0-9a-f]{40}$/i.test(SHOP_CONTRACT_ADDRESS);
  const rows = leaderboardEntries.length
    ? leaderboardEntries.map((entry, index) => `<div class="leaderboard-row"><span>${index + 1}</span><b>${escapeText(shortenAddress(entry.address))}</b><small>Stage ${entry.highestStage} · ${entry.totalRides} fares</small></div>`).join("")
    : `<p class="leaderboard-empty">${contractReady ? "No drivers have published progress yet." : "The Sepolia contract address will appear here after deployment."}</p>`;
  const maxFeeEth = pendingProgress ? `${(pendingProgress.maxFeeWei / 10n ** 18n).toString()}.${(pendingProgress.maxFeeWei % 10n ** 18n).toString().padStart(18, "0")}` : "";
  const products = SHOP_ITEMS.map((item) => {
    const quantity = shopInventory.get(item.id) ?? 0;
    const ownedPaint = item.kind === "paint" && quantity > 0;
    const selected = profile.settings.taxiPaint === (item.kind === "paint" ? (item.id === 1 ? "sunset" : "tidal") : "");
    const action = item.kind === "paint"
      ? ownedPaint
        ? `<button class="button button-secondary shop-item-action" data-action="shop-paint" data-id="${item.id}" ${selected ? "disabled" : ""}>${selected ? "In use" : "Use paint"}</button>`
        : `<button class="button button-secondary shop-item-action" data-action="shop-prepare-purchase" data-id="${item.id}" ${!shopReady || wallet.state !== "connected" || shopLoading ? "disabled" : ""}>Buy · ${formatEth(item.priceWei)} Sepolia ETH</button>`
      : quantity > 0
        ? `<button class="button button-secondary shop-item-action" data-action="shop-prepare-use" data-id="${item.id}" ${!shopReady || wallet.state !== "connected" || shopLoading ? "disabled" : ""}>Use · ${quantity} available</button>`
        : `<button class="button button-secondary shop-item-action" data-action="shop-prepare-purchase" data-id="${item.id}" ${!shopReady || wallet.state !== "connected" || shopLoading ? "disabled" : ""}>Buy · ${formatEth(item.priceWei)} Sepolia ETH</button>`;
    return `<article class="shop-item"><div><b>${escapeText(item.name)}</b><small>${escapeText(item.description)}</small></div><span class="shop-stock">${item.kind === "paint" ? (ownedPaint ? "OWNED" : "ONE-TIME") : `${quantity} IN STOCK`}</span>${action}</article>`;
  }).join("");
  const shopFeeEth = pendingShop ? formatEth(pendingShop.maxFeeWei) : "";
  const shopPriceEth = pendingShop?.type === "purchase" ? formatEth(pendingShop.priceWei) : "";
  const defaultShopMessage = !shopReady ? "Shop contract is not deployed/configured yet. Items are inactive until a Sepolia contract address is configured." :
    wallet.state === "connected" ? "Reading your on-chain item inventory…" : "Connect MetaMask on Sepolia to view your items.";
  const contractsReady = shopReady && contractReady;
  return `<section class="wallet-drawer panel" id="wallet-panel" hidden>
    <div class="panel-heading"><div><span class="eyebrow">OPTIONAL SEPOLIA FEATURES</span><h2>Wallet & leaderboard</h2></div><button class="icon-button" data-action="wallet-close" aria-label="Close wallet panel">×</button></div>
    <p class="wallet-description">Play without a wallet. Local Morrow coins and upgrades are not crypto. Publishing progress makes your wallet address and stage/fare totals public on Sepolia and costs test ETH; entries are self-reported.</p>
    <div class="wallet-state-card"><span class="wallet-dot ${wallet.state}"></span><div><b>${wallet.state === "connected" ? `Connected · ${escapeText(shortenAddress(wallet.address))}` : wallet.state === "wrong-network" ? `Wrong network · ${escapeText(shortenAddress(wallet.address))}` : wallet.state === "unavailable" ? "MetaMask not detected" : "Wallet disconnected"}</b><p>${escapeText(walletMessage || wallet.message)}</p></div></div>
    <div class="wallet-actions"><button class="button button-secondary" data-action="wallet-connect" ${wallet.state === "unavailable" ? "disabled" : ""}>Connect MetaMask</button><button class="button button-secondary" data-action="wallet-switch" ${wallet.state === "unavailable" ? "disabled" : ""}>Switch to Sepolia</button></div>
    ${!contractsReady ? `<p class="wallet-feature-note" role="status">MetaMask is ${wallet.state === "connected" ? "connected to Sepolia" : "separate from the game contracts"}, but no shop or leaderboard contract is deployed/configured for this site yet. Wallet connection alone cannot enable purchases or leaderboard reads. Deployment needs a one-time Sepolia transaction; the shop buttons stay disabled until its address is configured.</p>` : ""}
    <div class="onchain-shop"><div class="leaderboard-heading"><b>SEPOLIA TEST-ETH SHOP</b><span>TEST NETWORK ONLY</span></div>
      <p class="shop-description">One-time car paint and consumable fuel/repair boosts use Sepolia test ETH. Network gas is additional; review every amount in MetaMask. No real-money payments.</p>
      ${products}
      <p class="leaderboard-status" id="shop-status">${escapeText(shopMessage || defaultShopMessage)}</p>
      ${pendingShop ? `<div class="publish-confirm"><p>${pendingShop.type === "purchase" ? `${escapeText(pendingShop.item.name)} · ${shopPriceEth} Sepolia ETH` : `Use ${escapeText(pendingShop.item.name)}`}<br>Estimated gas fee: <b>up to ${shopFeeEth} Sepolia ETH</b><br>MetaMask shows the final transaction. Nothing is paid until you approve it.</p><button class="button button-primary" data-action="shop-submit">Review in MetaMask</button><button class="text-button" data-action="shop-cancel">Cancel</button></div>` : ""}
    </div>
    <div class="onchain-board"><div class="leaderboard-heading"><b>TOP DRIVERS · SEPOLIA</b><button class="text-button" data-action="leaderboard-refresh" ${!contractReady || wallet.state !== "connected" || leaderboardLoading ? "disabled" : ""}>${leaderboardLoading ? "Loading…" : "Refresh"}</button></div><div id="leaderboard-list">${rows}</div>
      <p class="leaderboard-status" id="leaderboard-status">${escapeText(leaderboardMessage || (contractReady ? "Scores are written only after you submit and approve a MetaMask transaction." : "Leaderboard contract deployment is not complete."))}</p>
      ${contractReady && wallet.state === "connected" ? `<button class="button button-secondary publish-progress" data-action="leaderboard-estimate" ${profile.rides === 0 || pendingProgress ? "disabled" : ""}>Estimate & publish my progress</button>${pendingProgress ? `<div class="publish-confirm"><p>Stage ${pendingProgress.highestStage} · ${pendingProgress.totalRides} fares<br>Estimated maximum fee: <b>${maxFeeEth} Sepolia ETH</b><br>MetaMask shows the final fee. Progress is public and self-reported.</p><button class="button button-primary" data-action="leaderboard-submit">Review in MetaMask</button><button class="text-button" data-action="leaderboard-cancel">Cancel</button></div>` : ""}` : ""}
    </div>
    ${wallet.state === "connected" ? `<a class="explorer-link" href="${SEPOLIA_EXPLORER}/address/${encodeURIComponent(wallet.address)}" target="_blank" rel="noreferrer">View address on Sepolia Etherscan ↗</a>` : ""}
    <p class="wallet-safety">Never share a seed phrase or private key. This game never asks for one.</p>
  </section>`;
}

function render() {
  const district = getDistrict(selectedDistrict);
  app.innerHTML = `${renderHeader()}
    ${saveWarning ? `<div class="save-warning" role="alert"><span>!</span><p>${escapeText(saveWarning)}</p><button class="text-button" data-action="import">Restore save backup</button></div>` : ""}
    <main class="sim-layout"><div class="left-column">${renderTripPanel()}${renderDistrictPanel()}</div><div class="center-column">${renderDrivingPanel()}</div>${renderRightPanel()}</main>
    <footer class="footer"><span>© MORROWLINE NEIGHBORHOOD TAXI SERVICE</span><span>Top-down city view · Local save · Wallet optional</span><a href="./README.md">How to play</a></footer>
    ${renderWalletPanel()}${renderTutorial()}<div class="toast-region" id="toast" role="status" aria-live="polite"></div>`;
  const canvas = document.querySelector("#road-scene");
  const renderer = createRoadRenderer(canvas);
  renderer.setZoom(mapZoom);
  window.__morrowlineRenderer?.disconnect();
  window.__morrowlineRenderer = renderer;
  canvas.addEventListener("click", onMapClick);
  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    mapZoom = Math.max(1, Math.min(2.5, mapZoom + (event.deltaY < 0 ? .15 : -.15)));
    renderer.setZoom(mapZoom);
    const zoomLabel = document.querySelector("#map-zoom-level");
    if (zoomLabel) zoomLabel.textContent = `${Math.round(mapZoom * 100)}%`;
  }, { passive: false });
  document.querySelector("#wallet-panel").hidden = true;
  document.querySelector(".tutorial-dialog")?.focus();
  return district;
}

function closeTutorial() {
  tutorialOpen = false;
  render();
  try {
    localStorage.setItem(TUTORIAL_SEEN_KEY, "true");
  } catch (error) {
    showToast(`Tutorial preference could not be saved: ${error.message}`);
  }
  document.querySelector("#instructions-button")?.focus();
}

function onMapClick(event) {
  if (shift.trip?.status === "to-pickup" || shift.trip?.status === "to-dropoff") return;
  const canvas = event.currentTarget;
  const bounds = canvas.getBoundingClientRect();
  const mapTransform = getMapTransform(bounds.width, bounds.height, mapZoom, shift);
  const world = {
    x: (event.clientX - bounds.left - mapTransform.originX) / mapTransform.scale,
    y: (event.clientY - bounds.top - mapTransform.originY) / mapTransform.scale
  };
  const rider = shift.passengers.filter((person) => person.state === "waiting")
    .map((person) => ({ person, distance: distanceTo(world, person) }))
    .filter((entry) => entry.distance < 65)
    .sort((a, b) => a.distance - b.distance)[0];
  if (!rider) return;
  selectedPassengerId = rider.person.id;
  render();
}

function syncHud(now) {
  if (now - lastHudUpdate < 140) return;
  lastHudUpdate = now;
  const district = getDistrict(shift.districtId);
  const set = (id, value) => {
    const element = document.getElementById(id);
    if (element && element.textContent !== String(value)) element.textContent = value;
  };
  const gap = getTargetDistance();
  set("speed", Math.abs(Math.round(shift.speed)));
  set("coin-count", profile.coins);
  const stageProgress = getStageProgress(profile, selectedDistrict);
  const objective = getDistrict(selectedDistrict).objective;
  set("task-fares", `${Math.min(stageProgress.fares, objective.fares)} / ${objective.fares}`);
  set("task-ontime", `${Math.min(stageProgress.onTimeFares, objective.onTimeFares)} / ${objective.onTimeFares}`);
  set("task-coins", `${Math.min(stageProgress.coins, objective.coins)} / ${objective.coins}`);
  const speedMeter = document.getElementById("speed-meter");
  if (speedMeter) speedMeter.style.width = `${Math.max(0, Math.min(100, Math.abs(shift.speed) / Math.max(1, district.limit * 1.5) * 100))}%`;
  set("fuel", shift.fuel.toFixed(1));
  const fuelMeter = document.getElementById("fuel-meter");
  if (fuelMeter) {
    fuelMeter.style.width = `${Math.max(0, shift.fuel / shift.maxFuel * 100)}%`;
    fuelMeter.classList.toggle("low", shift.fuel < 9);
  }
  set("target-distance", `${Math.max(0, gap)}m`);
  set("target-distance-copy", `In ${Math.max(0, gap)} m`);
  set("target-label", getTarget().label);
  set("street-name", streetNameFor({ x: shift.x, y: shift.y }));
  set("shift-fare", formatMoney(shift.fareTotalCents));
  set("shift-fares", String(shift.tripCount));
  set("odometer", `${(shift.distance / 1000).toFixed(2)} km`);
  set("car-condition", `${Math.max(0, 100 - shift.damage).toFixed(0)}%`);
  set("right-condition", `${Math.max(0, 100 - shift.damage).toFixed(0)}%`);
  set("right-fuel", `${shift.fuel.toFixed(1)} L`);
  set("drive-status", getDriveStatus());
  set("right-top-speed", `${Math.round(getCarStats(profile, shift.damage).maxSpeed)} km/h`);
  const deadline = document.getElementById("fare-deadline");
  if (deadline) {
    deadline.textContent = shift.trip?.status === "complete" ? (shift.trip.late ? "LATE" : "ON TIME") :
      shift.trip ? formatDeadline(shift.trip.deadlineSeconds) : "Starts on acceptance";
    deadline.classList.toggle("late", Boolean(shift.trip?.late));
    deadline.classList.toggle("urgent", Boolean(shift.trip && !shift.trip.late && shift.trip.deadlineSeconds < 30));
  }
  const rideAction = document.querySelector(".ride-action");
  if (rideAction) {
    rideAction.disabled = shift.status === "disabled" || (shift.status !== "stranded" &&
      ((shift.trip?.status === "to-pickup" && gap > 48) ||
       (shift.trip?.status === "to-dropoff" && gap > 48) ||
       (!shift.trip?.status?.startsWith("to-") && (!selectedPassengerId || Math.abs(shift.speed) > 3))));
    rideAction.innerHTML = `${escapeText(getActionText())}<span>↗</span>`;
  }
  const message = document.getElementById("scene-message");
  if (message && shift.lastEvent) message.textContent = shift.lastEvent;
  const person = shift.trip?.status === "to-pickup" ? findPassenger(shift, shift.passenger.id) : null;
  const canvas = document.querySelector("#road-scene");
  if (canvas) {
    canvas.setAttribute("aria-label", `Top-down drone view of ${district.name}. ${shift.passengers.filter((rider) => rider.state === "waiting").length} visible waiting passengers and ${shift.roadworks.length} roadwork barriers. ${person ? `${person.name} is waiting at ${Math.round(distanceTo(shift, person))} meters.` : ""} Taxi speed ${Math.round(Math.abs(shift.speed))} kilometers per hour.`);
  }
}

function frame(now) {
  const delta = lastFrame ? Math.min(.06, (now - lastFrame) / 1000) : 0;
  lastFrame = now;
  if (!tutorialOpen && shift.status === "driving" && !shift.closed) {
    const controls = {
      accelerate: heldControls.has("accelerate"),
      brake: heldControls.has("brake") || heldControls.has("reverse"),
      reverse: heldControls.has("reverse"),
      left: heldControls.has("left"),
      right: heldControls.has("right"),
      handbrake: heldControls.has("handbrake")
    };
    if (controls.accelerate || controls.brake || controls.left || controls.right || shift.speed !== 0 || shift.traffic.length > 0) {
      const result = advanceShift(shift, controls, delta, profile);
      shift = result.shift;
      if (result.profile !== profile) {
        const objectiveWasComplete = isStageComplete(profile, shift.districtId);
        profile = result.profile;
        persist();
        if (objectiveWasComplete !== isStageComplete(profile, shift.districtId)) render();
      }
      if (result.events.length) {
        shift.lastEvent = result.events.at(-1);
        if (result.events.some((text) => text.includes("bump") || text.includes("Fuel empty"))) playBell();
        if (result.restarted) {
          persist();
          render();
          showToast(shift.lastMessage);
        } else if (shift.status === "stranded" || shift.status === "disabled") render();
      }
    }
  }
  window.__morrowlineRenderer?.draw(shift, getDistrict(shift.districtId), getTaxiPaintColor());
  syncHud(now);
  requestAnimationFrame(frame);
}

function updateWalletPanel(show) {
  document.querySelector("#wallet-panel").hidden = !show;
}

async function refreshLeaderboard() {
  if (!/^0x[0-9a-f]{40}$/i.test(LEADERBOARD_CONTRACT_ADDRESS) || wallet.state !== "connected" || !window.ethereum?.request) return;
  leaderboardLoading = true;
  leaderboardMessage = "Reading public Sepolia scores…";
  updateLeaderboardPanel();
  try {
    leaderboardEntries = await readLeaderboard(window.ethereum, LEADERBOARD_CONTRACT_ADDRESS);
    leaderboardMessage = leaderboardEntries.length ? "Best ten published records · stage first, then completed fares." : "No drivers have published progress yet.";
  } catch (error) {
    leaderboardMessage = `Could not read the Sepolia leaderboard: ${error.message}`;
  } finally {
    leaderboardLoading = false;
    updateLeaderboardPanel();
  }
}

function updateLeaderboardPanel() {
  const panel = document.querySelector("#wallet-panel");
  if (!panel) return;
  const list = panel.querySelector("#leaderboard-list");
  if (list) {
    list.innerHTML = leaderboardEntries.length
      ? leaderboardEntries.map((entry, index) => `<div class="leaderboard-row"><span>${index + 1}</span><b>${escapeText(shortenAddress(entry.address))}</b><small>Stage ${entry.highestStage} · ${entry.totalRides} fares</small></div>`).join("")
      : `<p class="leaderboard-empty">${/^0x[0-9a-f]{40}$/i.test(LEADERBOARD_CONTRACT_ADDRESS) ? "No drivers have published progress yet." : "The Sepolia contract address will appear here after deployment."}</p>`;
  }
  const status = panel.querySelector("#leaderboard-status");
  if (status) status.textContent = leaderboardMessage;
  const refresh = panel.querySelector('[data-action="leaderboard-refresh"]');
  if (refresh) {
    refresh.disabled = leaderboardLoading;
    refresh.textContent = leaderboardLoading ? "Loading…" : "Refresh";
  }
}

function performObjective() {
  if (shift.status === "disabled") {
    showToast("The taxi is disabled. Repair it before continuing.");
    return;
  }
  if (shift.stranded) {
    const result = roadsideAssistance(shift, profile);
    shift = result.shift;
    profile = result.profile;
    if (result.ok) persist();
    render();
    showToast(result.shift.lastMessage);
    return;
  }
  if (shift.trip?.status === "to-pickup") {
    const result = takePassenger(shift);
    shift = result.shift;
    if (!result.ok) shift.lastEvent = result.message;
    else {
      shift.lastEvent = `${shift.passenger.name} gets into the taxi. Passenger aboard.`;
      playBell();
    }
    render();
    return;
  }
  if (shift.trip?.status === "to-dropoff") {
    const result = dropOffPassenger(shift, profile);
    shift = result.shift;
    if (!result.ok) shift.lastEvent = result.message;
    else {
      profile = result.profile;
      selectedPassengerId = null;
      persist();
      playBell();
    }
    render();
    if (result.ok) showToast(`${shift.lastEvent} Fare: ${formatMoney(result.rewardCents)}.`);
    return;
  }
  if (shift.serviceNearby && Math.abs(shift.speed) <= 2 && shift.fuel < shift.maxFuel - .1) {
    refuelCab();
    return;
  }
  if (!selectedPassengerId) {
    showToast("Free drive is active. Select a waiting passenger whenever you want to start a fare.");
    return;
  }
  const result = acceptRide(shift, profile, Math.random, selectedPassengerId);
  shift = result.shift;
  render();
  if (result.ok) playBell();
}

function refuelCab() {
  const result = refuel(shift, profile);
  shift = result.shift;
  profile = result.profile;
  if (result.ok) persist();
  render();
  showToast(result.message);
}

async function updateWallet(action) {
  walletMessage = "";
  pendingProgress = null;
  pendingShop = null;
  try {
    wallet = action === "connect" ? await connectWallet(window.ethereum) : await switchToSepolia(window.ethereum);
  } catch (error) {
    walletMessage = error?.code === 4001 ? "Request cancelled in MetaMask. No changes were made." :
      error?.code === 4902 ? "Sepolia is not in this wallet yet. Add it using MetaMask's trusted network settings." : error.message;
  }
  render();
  updateWalletPanel(true);
  if (wallet.state === "connected") {
    await refreshLeaderboard();
    await refreshShopInventory();
  }
}

async function refreshShopInventory() {
  if (!/^0x[0-9a-f]{40}$/i.test(SHOP_CONTRACT_ADDRESS) || wallet.state !== "connected" || !window.ethereum?.request) {
    shopInventory = new Map();
    return;
  }
  shopLoading = true;
  shopMessage = "Reading your on-chain item inventory…";
  updateShopPanel();
  try {
    shopInventory = await readShopInventory(window.ethereum, SHOP_CONTRACT_ADDRESS, wallet.address);
    shopMessage = "Sepolia shop inventory loaded. Consumables are applied only after confirmed transactions.";
  } catch (error) {
    shopMessage = `Could not read the Sepolia shop inventory: ${error.message}`;
  } finally {
    shopLoading = false;
    updateShopPanel();
  }
}

function updateShopPanel() {
  const panel = document.querySelector("#wallet-panel");
  if (!panel) return;
  const status = panel.querySelector("#shop-status");
  if (status) status.textContent = shopMessage;
}

async function prepareShopTransaction(type, itemId) {
  shopMessage = "";
  pendingShop = null;
  shopLoading = true;
  updateShopPanel();
  try {
    if (wallet.state !== "connected") throw new Error("Connect MetaMask on Sepolia first.");
    if (!/^0x[0-9a-f]{40}$/i.test(SHOP_CONTRACT_ADDRESS)) throw new Error("The Sepolia shop is not deployed/configured yet.");
    const chainId = await window.ethereum.request({ method: "eth_chainId" });
    if (chainId !== SEPOLIA_CHAIN_ID) throw new Error("Switch MetaMask to Sepolia before using the shop.");
    await verifySepoliaAccount(window.ethereum, wallet.address);
    const item = SHOP_ITEMS.find((candidate) => candidate.id === itemId);
    if (!item) throw new Error("This shop item is unavailable.");
    const quantity = shopInventory.get(itemId) ?? 0;
    if (type === "consume" && quantity < 1) throw new Error("You do not own this consumable.");
    if (type === "purchase" && item.kind === "paint" && quantity > 0) throw new Error("You already own this one-time paint.");
    const estimate = type === "purchase"
      ? await estimateShopPurchase(window.ethereum, SHOP_CONTRACT_ADDRESS, wallet.address, itemId)
      : await estimateShopConsumption(window.ethereum, SHOP_CONTRACT_ADDRESS, wallet.address, itemId);
    pendingShop = { ...estimate, type };
    shopMessage = "Review the item and estimated network fee, then choose Review in MetaMask to request the transaction.";
  } catch (error) {
    shopMessage = `Could not prepare shop transaction: ${error.message}`;
  } finally {
    shopLoading = false;
    render();
    updateWalletPanel(true);
  }
}

async function submitShopTransaction() {
  if (!pendingShop || wallet.state !== "connected") return;
  const pending = pendingShop;
  shopLoading = true;
  shopMessage = "MetaMask will ask you to review the Sepolia transaction. Confirm there only if the details match.";
  render();
  updateWalletPanel(true);
  try {
    await verifySepoliaAccount(window.ethereum, wallet.address);
    const { hash } = await sendShopTransaction(window.ethereum, pending.transaction, (submittedHash) => {
      shopMessage = `Transaction sent: ${submittedHash}. Waiting for Sepolia confirmation…`;
      updateShopPanel();
    });
    if (pending.type === "consume") {
      if (pending.item.kind === "fuel") shift = applyFuelBoost(shift).shift;
      if (pending.item.kind === "repair") shift = applyRepairKit(shift).shift;
      shopMessage = `${pending.item.name} used after confirmed transaction ${hash}.`;
    } else {
      shopMessage = `${pending.item.name} purchased after confirmed transaction ${hash}.`;
    }
    pendingShop = null;
    await refreshShopInventory();
  } catch (error) {
    pendingShop = null;
    shopMessage = `Shop transaction was not completed: ${error.message}`;
  } finally {
    shopLoading = false;
    render();
    updateWalletPanel(true);
  }
}

app.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  if (action === "district") {
    if (!canChangeDistrict()) {
      showToast("Complete the passenger's ride before changing neighborhoods.");
      return;
    }
    selectedDistrict = button.dataset.id;
    const previous = shift;
    shift = createShift(profile, selectedDistrict);
    shift.fuel = Math.min(shift.maxFuel, previous.fuel);
    shift.damage = previous.damage;
    selectedPassengerId = null;
    render();
  } else if (action === "unlock-district") {
    if (!canChangeDistrict()) {
      showToast("Finish the current fare and park before changing neighborhoods.");
      return;
    }
    const district = getDistrict(button.dataset.id);
    if (!district || !window.confirm(`Pay ${formatMoney(district.entryFeeCents)} from driver earnings to unlock ${district.name}?`)) return;
    const result = unlockDistrict(profile, district.id);
    if (!result.ok) {
      showToast(result.message);
      return;
    }
    const previous = shift;
    profile = result.profile;
    selectedDistrict = button.dataset.id;
    shift = createShift(profile, selectedDistrict);
    shift.fuel = Math.min(shift.maxFuel, previous.fuel);
    shift.damage = previous.damage;
    selectedPassengerId = null;
    persist();
    render();
    showToast(result.message);
  } else if (action === "select-passenger") {
    if (shift.trip?.status === "to-pickup" || shift.trip?.status === "to-dropoff") return;
    selectedPassengerId = button.dataset.id;
    render();
  } else if (action === "end-shift") {
    if (!canChangeDistrict()) return;
    selectedDistrict = DISTRICTS.some((district) => district.id === button.dataset.id) ? button.dataset.id : selectedDistrict;
    const previous = shift;
    shift = createShift(profile, selectedDistrict);
    shift.fuel = Math.min(shift.maxFuel, previous.fuel);
    shift.damage = previous.damage;
    selectedPassengerId = null;
    render();
  } else if (action === "restart-level") {
    if (!window.confirm("Restart this level's shift from the beginning?\n\nThe current fare will be cancelled. Earnings, garage upgrades, unlocked neighborhoods, and challenge progress will be kept.")) return;
    shift = createShift(profile, selectedDistrict);
    selectedPassengerId = null;
    persist();
    render();
    showToast(`${getDistrict(selectedDistrict).name} shift restarted. Your saved progress was kept.`);
  } else if (action === "restart-game") {
    const confirmed = window.confirm("Restart the whole game?\n\nThis resets all local driver earnings, Morrow coins, rides, upgrades, neighborhood unlocks, and challenge progress in this browser. Sepolia wallet items are on-chain and will not be changed.");
    if (!confirmed || window.prompt("Type RESET to confirm clearing this browser's local game progress.") !== "RESET") return;
    profile = newProfile();
    selectedDistrict = DISTRICTS[0].id;
    shift = createShift(profile, selectedDistrict);
    selectedPassengerId = null;
    mapZoom = 1;
    pendingProgress = null;
    pendingShop = null;
    persist();
    render();
    showToast("A new game has started. On-chain Sepolia items remain in your wallet.");
  } else if (action === "ride-action") {
    performObjective();
  } else if (action === "tutorial-open") {
    tutorialOpen = true;
    render();
  } else if (action === "tutorial-close") {
    closeTutorial();
  } else if (action === "tutorial-backdrop") {
    if (event.target !== button) return;
    closeTutorial();
  } else if (action === "assist") {
    performObjective();
  } else if (action === "refuel") {
    refuelCab();
  } else if (action === "repair") {
    const result = repairCar(shift, profile);
    shift = result.shift;
    profile = result.profile;
    if (result.ok) persist();
    render();
    showToast(result.message);
  } else if (action === "buy-upgrade") {
    const item = GARAGE_ITEMS.find((candidate) => candidate.id === button.dataset.id);
    if (!item) return;
    if (!window.confirm(`Install ${item.name} for ${item.coinCost} Morrow coins?\n\n${item.description}\n\nYou can only upgrade while parked.`)) return;
    const previousMaxFuel = shift.maxFuel;
    const result = purchaseGarageItem(profile, item.id);
    profile = result.profile;
    shift.maxFuel = getCarStats(profile).maxFuel;
    if (shift.maxFuel > previousMaxFuel) shift.fuel = Math.min(shift.maxFuel, shift.fuel + shift.maxFuel - previousMaxFuel);
    if (result.ok) persist();
    render();
    showToast(result.message);
  } else if (action === "export") {
    const link = document.createElement("a");
    const url = URL.createObjectURL(new Blob([exportSave(profile)], { type: "application/json" }));
    link.href = url;
    link.download = "morrowline-taxi-save.json";
    link.click();
    URL.revokeObjectURL(url);
    showToast("Taxi save backup downloaded.");
  } else if (action === "import") {
    importFile.click();
  } else if (action === "wallet-open") {
    updateWalletPanel(true);
    if (wallet.state === "connected") {
      refreshLeaderboard();
      refreshShopInventory();
    }
  } else if (action === "wallet-close") {
    updateWalletPanel(false);
  } else if (action === "wallet-connect") {
    await updateWallet("connect");
  } else if (action === "wallet-switch") {
    await updateWallet("switch");
  } else if (action === "leaderboard-refresh") {
    await refreshLeaderboard();
  } else if (action === "map-zoom-in" || action === "map-zoom-out") {
    mapZoom = Math.max(1, Math.min(2.5, mapZoom + (action === "map-zoom-in" ? .25 : -.25)));
    window.__morrowlineRenderer?.setZoom(mapZoom);
    const zoomLabel = document.querySelector("#map-zoom-level");
    if (zoomLabel) zoomLabel.textContent = `${Math.round(mapZoom * 100)}%`;
  } else if (action === "shop-prepare-purchase") {
    await prepareShopTransaction("purchase", Number(button.dataset.id));
  } else if (action === "shop-prepare-use") {
    await prepareShopTransaction("consume", Number(button.dataset.id));
  } else if (action === "shop-submit") {
    await submitShopTransaction();
  } else if (action === "shop-cancel") {
    pendingShop = null;
    shopMessage = "Shop transaction cancelled. Nothing was sent.";
    render();
    updateWalletPanel(true);
  } else if (action === "shop-paint") {
    const item = SHOP_ITEMS.find((candidate) => candidate.id === Number(button.dataset.id));
    if (!item || (shopInventory.get(item.id) ?? 0) < 1) {
      shopMessage = "That paint is not in your connected Sepolia wallet.";
      updateShopPanel();
      return;
    }
    profile.settings.taxiPaint = item.id === 1 ? "sunset" : "tidal";
    persist();
    render();
    updateWalletPanel(true);
    shopMessage = `${item.name} selected.`;
    updateShopPanel();
  } else if (action === "leaderboard-estimate") {
    try {
      if (wallet.state !== "connected") throw new Error("Connect MetaMask on Sepolia first.");
      const chainId = await window.ethereum.request({ method: "eth_chainId" });
      if (chainId !== SEPOLIA_CHAIN_ID) throw new Error("Switch MetaMask to Sepolia before publishing progress.");
      pendingProgress = await estimateProgressSubmission(window.ethereum, LEADERBOARD_CONTRACT_ADDRESS, wallet.address, profile);
      leaderboardMessage = "Review the estimated fee and public data, then choose Review in MetaMask to request the transaction.";
    } catch (error) {
      pendingProgress = null;
      leaderboardMessage = `Could not prepare leaderboard update: ${error.message}`;
    }
    render();
    updateWalletPanel(true);
  } else if (action === "leaderboard-submit") {
    if (!pendingProgress || wallet.state !== "connected") return;
    const transaction = pendingProgress.transaction;
    try {
      const [accounts, chainId] = await Promise.all([
        window.ethereum.request({ method: "eth_accounts" }),
        window.ethereum.request({ method: "eth_chainId" })
      ]);
      if (accounts?.[0]?.toLowerCase() !== wallet.address.toLowerCase() || chainId !== SEPOLIA_CHAIN_ID) {
        throw new Error("The active account or network changed. Reconnect and estimate the transaction again.");
      }
      leaderboardMessage = "MetaMask will ask you to review the Sepolia transaction. Confirm there only if the details match.";
      render();
      updateWalletPanel(true);
      const { hash } = await sendProgressSubmission(window.ethereum, transaction, (submittedHash) => {
        leaderboardMessage = `Transaction sent: ${submittedHash}. Waiting for Sepolia confirmation…`;
        updateLeaderboardPanel();
      });
      pendingProgress = null;
      leaderboardMessage = `Progress published on Sepolia. Transaction: ${hash}`;
      await refreshLeaderboard();
    } catch (error) {
      pendingProgress = null;
      leaderboardMessage = `Progress was not published: ${error.message}`;
    }
    render();
    updateWalletPanel(true);
  } else if (action === "leaderboard-cancel") {
    pendingProgress = null;
    leaderboardMessage = "Publishing was cancelled. No transaction was requested.";
    render();
    updateWalletPanel(true);
  }
});

app.addEventListener("change", (event) => {
  const input = event.target;
  if (input.matches("[data-setting]")) {
    profile = { ...profile, settings: { ...profile.settings, [input.dataset.setting]: input.checked } };
    persist();
    render();
  }
});

app.addEventListener("pointerdown", (event) => {
  const control = event.target.closest("[data-control]");
  if (!control) return;
  event.preventDefault();
  heldControls.add(control.dataset.control);
  control.setPointerCapture?.(event.pointerId);
});
app.addEventListener("pointerup", (event) => {
  const control = event.target.closest("[data-control]");
  if (control) heldControls.delete(control.dataset.control);
});
app.addEventListener("pointercancel", () => heldControls.clear());
window.addEventListener("blur", () => heldControls.clear());

importFile.addEventListener("change", async () => {
  const file = importFile.files?.[0];
  if (!file) return;
  try {
    profile = importSave(await file.text());
    selectedDistrict = availableDistricts(profile).at(-1).id;
    shift = createShift(profile, selectedDistrict);
    selectedPassengerId = null;
    persist();
    render();
    showToast("Taxi save restored.");
  } catch (error) {
    showToast(`Import failed: ${error.message}`);
  } finally {
    importFile.value = "";
  }
});

document.addEventListener("keydown", (event) => {
  if (event.altKey || event.ctrlKey || event.metaKey || event.target.matches("input,textarea,select,[contenteditable=true]")) return;
  if (event.key === "Escape" && tutorialOpen) {
    closeTutorial();
    return;
  }
  if (tutorialOpen) return;
  const controls = {
    ArrowUp: "accelerate", w: "accelerate", W: "accelerate",
    ArrowDown: "brake", s: "brake", S: "brake",
    ArrowLeft: "left", a: "left", A: "left",
    ArrowRight: "right", d: "right", D: "right",
    r: "reverse", R: "reverse"
  };
  const control = controls[event.key];
  if (control) {
    event.preventDefault();
    heldControls.add(control);
  } else if (event.code === "Space") {
    event.preventDefault();
    performObjective();
  }
});
document.addEventListener("keyup", (event) => {
  const controls = {
    ArrowUp: "accelerate", w: "accelerate", W: "accelerate",
    ArrowDown: "brake", s: "brake", S: "brake",
    ArrowLeft: "left", a: "left", A: "left",
    ArrowRight: "right", d: "right", D: "right",
    r: "reverse", R: "reverse"
  };
  const control = controls[event.key];
  if (control) heldControls.delete(control);
});

if (window.ethereum?.on) {
  window.ethereum.on("accountsChanged", (accounts) => {
    wallet = describeWallet(accounts?.[0] ?? null, wallet.chainId);
    pendingProgress = null;
    pendingShop = null;
    leaderboardEntries = [];
    shopInventory = new Map();
    render();
    updateWalletPanel(true);
    if (wallet.state === "connected") {
      refreshLeaderboard();
      refreshShopInventory();
    }
  });
  window.ethereum.on("chainChanged", (chainId) => {
    wallet = describeWallet(wallet.address, chainId);
    pendingProgress = null;
    pendingShop = null;
    leaderboardEntries = [];
    shopInventory = new Map();
    render();
    updateWalletPanel(true);
    if (wallet.state === "connected") {
      refreshLeaderboard();
      refreshShopInventory();
    }
  });
}

render();
requestAnimationFrame(frame);
