import test from "node:test";
import assert from "node:assert/strict";
import { DISTRICTS, GARAGE_ITEMS } from "../src/districts.js";
import {
  acceptRide, advanceShift, availableDistricts, createShift, dropOffPassenger,
  formatMoney, getCarStats, isParkedAtObjective, newProfile, nextFuelStation, purchaseGarageItem,
  rateRide, refuel, roadsideAssistance, takePassenger
} from "../src/game.js";
import {
  exportSave, importSave, LEGACY_SAVE_KEY, LEGACY_TAXI_SAVE_KEY, LEGACY_TAXI_V2_SAVE_KEY, loadProfile,
  SAVE_KEY, saveProfile, validateProfile
} from "../src/save.js";
import { getMapTransform } from "../src/renderer.js";
import { connectWallet, describeWallet, SEPOLIA_CHAIN_ID, switchToSepolia, walletStatus } from "../src/wallet.js";

const constantRandom = (value) => () => value;

function passengerAtPickup(profile = newProfile()) {
  const district = DISTRICTS[0];
  const initial = createShift(profile, district.id, constantRandom(.5));
  const waiting = initial.passengers.find((person) => person.state === "waiting");
  const accepted = acceptRide(initial, profile, constantRandom(.5), waiting.id);
  assert.equal(accepted.ok, true);
  const shift = {
    ...accepted.shift,
    x: accepted.shift.trip.pickupAt.x,
    y: accepted.shift.trip.pickupAt.y,
    speed: 0
  };
  return { profile, shift };
}

function passengerAtDropoff(profile = newProfile()) {
  const atPickup = passengerAtPickup(profile);
  const pickedUp = takePassenger(atPickup.shift);
  assert.equal(pickedUp.ok, true);
  return {
    profile,
    shift: {
      ...pickedUp.shift,
      x: pickedUp.shift.trip.dropoffAt.x,
      y: pickedUp.shift.trip.dropoffAt.y,
      speed: 0
    }
  };
}

function fullyUnlockedProfile() {
  const profile = newProfile();
  return {
    ...profile,
    stageProgress: Object.fromEntries(DISTRICTS.map((district) => [district.id, {
      fares: district.objective.fares,
      onTimeFares: district.objective.onTimeFares,
      coins: district.objective.coins
    }]))
  };
}

test("new driver starts with a working car, visible passengers, and an open neighborhood", () => {
  const profile = newProfile();
  const shift = createShift(profile, DISTRICTS[0].id, constantRandom(.5));
  assert.equal(profile.cashCents, 40_000);
  assert.equal(shift.fuel, 48);
  assert.equal(shift.status, "idle");
  assert.equal(shift.passengers.filter((person) => person.state === "waiting").length, 6);
  assert.equal(availableDistricts(profile).length, 1);
  assert.equal(availableDistricts(fullyUnlockedProfile()).length, 5);
  assert.throws(() => createShift(profile, DISTRICTS[4].id), /not open/);
});

test("each later neighborhood adds traffic and roadworks and tightens the deadline", () => {
  const profile = fullyUnlockedProfile();
  const stages = DISTRICTS.map((district) => createShift(profile, district.id, constantRandom(.5)));
  assert.deepEqual(stages.map((shift) => shift.roadworks.length), [2, 3, 4, 5, 6]);
  assert.deepEqual(stages.map((shift) => shift.traffic.length), [18, 21, 24, 28, 32]);
  assert.ok(DISTRICTS.every((district, index) => index === 0 || district.deadlineFactor < DISTRICTS[index - 1].deadlineFactor));
});

test("stage objectives gate neighborhood unlocks until fare, on-time, and coin goals are met", () => {
  const profile = newProfile();
  const { shift } = passengerAtDropoff(profile);
  const firstFare = dropOffPassenger(shift, profile);
  assert.equal(firstFare.profile.stageProgress["old-town"].fares, 1);
  assert.equal(firstFare.profile.stageProgress["old-town"].onTimeFares, 1);
  assert.equal(availableDistricts(firstFare.profile).length, 1);
  const progress = {
    ...firstFare.profile.stageProgress,
    "old-town": { fares: 2, onTimeFares: 1, coins: 1 }
  };
  assert.equal(availableDistricts({ ...firstFare.profile, stageProgress: progress }).length, 2);
});

test("passenger boards only when the taxi is parked beside the selected curbside rider", () => {
  const profile = newProfile();
  const initial = createShift(profile, DISTRICTS[0].id, constantRandom(.5));
  const waiting = initial.passengers[0];
  assert.equal(waiting.state, "waiting");
  const accepted = acceptRide(initial, profile, constantRandom(.5), waiting.id);
  assert.equal(accepted.ok, true);
  const moving = { ...accepted.shift, x: waiting.x, y: waiting.y, speed: 25 };
  assert.equal(takePassenger(moving).ok, false);
  const parked = { ...moving, speed: 0 };
  assert.equal(isParkedAtObjective(parked, { type: "pickup", ...parked.trip.pickupAt }), true);
  const boarded = takePassenger(parked);
  assert.equal(boarded.ok, true);
  assert.equal(boarded.shift.trip.status, "to-dropoff");
  assert.equal(boarded.shift.passengers.find((person) => person.id === waiting.id).state, "boarded");
});

test("a fare must be parked at its destination before payout and district progress", () => {
  const { profile, shift } = passengerAtDropoff();
  const speeding = { ...shift, speed: 25 };
  assert.equal(dropOffPassenger(speeding, profile).ok, false);
  const result = dropOffPassenger(shift, profile);
  assert.equal(result.ok, true);
  assert.equal(result.shift.trip.status, "complete");
  assert.ok(result.rewardCents > 0);
  assert.ok(result.rating >= 1 && result.rating <= 5);
  assert.equal(result.profile.cashCents, profile.cashCents + result.rewardCents);
  assert.equal(result.profile.rides, 1);
  assert.equal(result.profile.coins, 2);
  assert.equal(result.profile.stageProgress["old-town"].fares, 1);
  assert.equal(result.profile.stageProgress["old-town"].onTimeFares, 1);
  assert.equal(result.profile.districtsVisited[0], DISTRICTS[0].id);
  assert.equal(result.profile.totalMeters, shift.trip.rideMeters);
  assert.equal(dropOffPassenger(result.shift, result.profile).ok, false);
});

test("driving over map coins awards persistent coins and stage objective progress once", () => {
  const profile = newProfile();
  const shift = createShift(profile, DISTRICTS[0].id, constantRandom(.5));
  const coin = shift.coins[0];
  const result = advanceShift({ ...shift, status: "driving", x: coin.x, y: coin.y, traffic: [] }, {}, .06, profile);
  assert.equal(result.profile.coins, 1);
  assert.equal(result.profile.stageProgress["old-town"].coins, 1);
  assert.equal(result.shift.coins.some(({ id }) => id === coin.id), false);
  assert.equal(advanceShift(result.shift, {}, .06, result.profile).profile.coins, 1);
});

test("engine, fuel economy, and tank upgrades change measurable vehicle performance", () => {
  const profile = newProfile();
  assert.equal(getCarStats(profile).maxSpeed, 55);
  assert.equal(getCarStats(profile).maxFuel, 48);
  const engine = purchaseGarageItem({ ...profile, coins: 12 }, "engine-tune");
  assert.equal(engine.ok, true);
  assert.equal(getCarStats(engine.profile).maxSpeed, 78);
  assert.ok(getCarStats(engine.profile).acceleration > getCarStats(profile).acceleration);
  const economy = purchaseGarageItem({ ...profile, coins: 8 }, "eco-tune");
  assert.ok(getCarStats(economy.profile).fuelUsePerMeter < getCarStats(profile).fuelUsePerMeter);
  const tank = purchaseGarageItem({ ...profile, coins: 14 }, "long-range-tank");
  assert.equal(getCarStats(tank.profile).maxFuel, 68);
});

test("driving controls move the taxi, consume fuel, and apply braking and rating penalties", () => {
  const { profile, shift } = passengerAtPickup();
  const onboard = takePassenger(shift).shift;
  let driving = onboard;
  for (let index = 0; index < 60; index += 1) {
    driving = advanceShift(driving, { accelerate: true, right: index < 20 }, 1 / 60, profile).shift;
  }
  assert.ok(driving.speed > 5);
  assert.ok(Math.hypot(driving.x - onboard.x, driving.y - onboard.y) > 0);
  assert.ok(driving.fuel < onboard.fuel);
  assert.notEqual(driving.heading, onboard.heading);
  const braking = advanceShift(driving, { brake: true }, .06, profile).shift;
  assert.ok(braking.speed < driving.speed);
  const speeding = {
    ...driving,
    speed: 100,
    trip: { ...driving.trip, speedingMeters: 400, rideMeters: 1000 }
  };
  assert.ok(rateRide(speeding, profile).rating < 5);
});

test("fare deadline runs during pickup and a late drop-off remains payable at a penalty", () => {
  const { profile, shift } = passengerAtPickup();
  assert.ok(shift.trip.deadlineSeconds > 0);
  const expired = advanceShift({
    ...shift,
    status: "driving",
    trip: { ...shift.trip, deadlineSeconds: .03 }
  }, {}, .06, profile);
  assert.equal(expired.shift.trip.late, true);
  assert.equal(expired.shift.trip.deadlineSeconds, 0);
  assert.ok(expired.events.some((event) => event.includes("deadline passed")));

  const { shift: onTime } = passengerAtDropoff(profile);
  const late = { ...onTime, trip: { ...onTime.trip, late: true } };
  assert.ok(rateRide(late, profile).fareCents < rateRide(onTime, profile).fareCents);
  assert.ok(rateRide(late, profile).rating < rateRide(onTime, profile).rating);
});

test("roadwork barriers stop an approaching taxi and apply vehicle damage", () => {
  const profile = newProfile();
  const created = createShift(profile, DISTRICTS[0].id, constantRandom(.5));
  const barrier = created.roadworks[0];
  let shift = {
    ...created,
    status: "driving",
    x: barrier.x,
    y: barrier.y - 40,
    heading: Math.PI / 2,
    speed: 50
  };
  let collision = false;
  for (let frame = 0; frame < 60 && !collision; frame += 1) {
    const result = advanceShift(shift, { accelerate: true }, .06, profile);
    shift = result.shift;
    collision = result.events.some((event) => event.includes("Roadwork barrier"));
  }
  assert.equal(collision, true);
  assert.equal(shift.speed, 0);
  assert.ok(shift.damage > 0);
});

test("fuel, stopped refuelling, and emergency rescue are safe", () => {
  const profile = newProfile();
  const shift = createShift(profile, DISTRICTS[0].id, constantRandom(.5));
  const station = nextFuelStation(shift);
  const car = {
    ...shift, trip: { status: "complete" }, x: station.x, y: station.y,
    fuel: 10, speed: 0, serviceNearby: true
  };
  const result = refuel(car, profile);
  assert.equal(result.ok, true);
  assert.equal(result.shift.fuel, 48);
  assert.equal(result.profile.cashCents, profile.cashCents - result.costCents);
  assert.ok(result.profile.cashCents >= 0);
  const empty = { ...car, fuel: 0, status: "stranded", stranded: true };
  const rescue = roadsideAssistance(empty, { ...profile, cashCents: 500 });
  assert.equal(rescue.ok, true);
  assert.equal(rescue.shift.fuel, 5);
  assert.equal(rescue.profile.cashCents, 0);
  assert.equal(rescue.shift.status, "driving");
});

test("garage upgrades use coins, reject insufficient funds, and prevent duplicate purchases", () => {
  const broke = { ...newProfile(), coins: 0 };
  const denied = purchaseGarageItem(broke, GARAGE_ITEMS[0].id);
  assert.equal(denied.ok, false);
  assert.equal(denied.profile.coins, 0);
  const bought = purchaseGarageItem({ ...newProfile(), coins: 8 }, "eco-tune");
  assert.equal(bought.ok, true);
  assert.equal(bought.profile.coins, 0);
  assert.equal(purchaseGarageItem(bought.profile, "eco-tune").ok, false);
  assert.equal(purchaseGarageItem(bought.profile, "made-up").ok, false);
  assert.ok(formatMoney(bought.profile.cashCents).startsWith("$"));
});

function memoryStorage(entries = []) {
  const stored = new Map(entries);
  return {
    stored,
    getItem: (key) => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, value)
  };
}

test("taxi v3 saves migrate progress and settings without removing the source backup", () => {
  const previous = {
    ...newProfile(),
    version: 3,
    cashCents: 12800,
    rides: 2,
    upgrades: ["eco-tune"],
    settings: { sound: true, reducedMotion: true }
  };
  const storage = memoryStorage([[LEGACY_TAXI_SAVE_KEY, JSON.stringify(previous)]]);
  const profile = loadProfile(storage);
  assert.equal(profile.cashCents, 12800);
  assert.equal(profile.rides, 2);
  assert.deepEqual(profile.upgrades, ["eco-tune"]);
  assert.equal(profile.settings.sound, true);
  assert.equal(profile.version, 4);
  assert.equal(availableDistricts(profile).length, 3);
  assert.equal(storage.stored.has(LEGACY_TAXI_SAVE_KEY), true);
  assert.equal(storage.stored.has(SAVE_KEY), true);
});

test("taxi v2 saves migrate using the preserved legacy key", () => {
  const previous = { ...newProfile(), version: 2, cashCents: 5000, rides: 1 };
  const storage = memoryStorage([[LEGACY_TAXI_V2_SAVE_KEY, JSON.stringify(previous)]]);
  const profile = loadProfile(storage);
  assert.equal(profile.version, 4);
  assert.equal(profile.cashCents, 5000);
  assert.equal(availableDistricts(profile).length, 2);
});

test("old courier saves migrate credits and settings without losing the source backup", () => {
  const storage = memoryStorage([[LEGACY_SAVE_KEY, JSON.stringify({
    version: 1, credits: 128, completed: ["clockmarket", "sunken-archive"], settings: { sound: true, reducedMotion: true }
  })]]);
  const profile = loadProfile(storage);
  assert.equal(profile.cashCents, 12_800);
  assert.equal(profile.rides, 2);
  assert.equal(profile.settings.sound, true);
  assert.equal(profile.settings.reducedMotion, true);
  assert.equal(storage.stored.has(LEGACY_SAVE_KEY), true);
  assert.equal(storage.stored.has(SAVE_KEY), true);
});

test("taxi save import/export persists valid progress and rejects invalid balances", () => {
  const original = newProfile();
  const storage = memoryStorage();
  saveProfile(original, storage);
  assert.deepEqual(loadProfile(storage), original);
  assert.deepEqual(importSave(exportSave(original)), original);
  assert.throws(() => validateProfile({ ...original, cashCents: -1 }), /invalid balance/);
  assert.throws(() => importSave("{broken"), /valid JSON/);
});

test("whole-city map transform fits and maps city coordinates to the canvas", () => {
  const transform = getMapTransform(800, 450);
  assert.ok(transform.scale > 0);
  assert.ok(transform.originX >= 0 && transform.originY >= 0);
  assert.ok(transform.sx(1800) <= 800);
  assert.ok(transform.sy(1300) <= 450);
});

test("wallet status distinguishes missing MetaMask, wrong chain, and optional Sepolia connection", async () => {
  assert.equal(walletStatus(null).state, "unavailable");
  assert.equal(describeWallet("0xabc", "0x1").state, "wrong-network");
  assert.equal(describeWallet("0xabc", SEPOLIA_CHAIN_ID).state, "connected");
  const calls = [];
  const provider = {
    request: async ({ method, params }) => {
      calls.push({ method, params });
      if (method === "eth_requestAccounts" || method === "eth_accounts") return ["0xabc"];
      if (method === "eth_chainId") return SEPOLIA_CHAIN_ID;
    }
  };
  assert.equal((await connectWallet(provider)).state, "connected");
  assert.equal((await switchToSepolia(provider)).state, "connected");
  assert.ok(calls.some(({ method, params }) => method === "wallet_switchEthereumChain" && params[0].chainId === SEPOLIA_CHAIN_ID));
});
