import { DISTRICTS, GARAGE_ITEMS } from "./districts.js";

export const SAVE_VERSION = 6;
export const STARTING_CASH_CENTS = 40_000;
export const STARTING_FUEL = 48;
export const BASE_FUEL_CAPACITY = 48;
export const FUEL_PRICE_CENTS_PER_LITER = 185;
export const REPAIR_CENTS_PER_DAMAGE = 110;
export const CITY = {
  width: 1800,
  height: 1300,
  roadWidth: 112,
  verticalRoads: [130, 440, 750, 1060, 1370, 1680],
  horizontalRoads: [110, 350, 590, 830, 1070, 1290]
};

function randomBetween(min, max, random = Math.random) {
  return min + random() * (max - min);
}

function nearest(value, list) {
  return list.reduce((best, item) => Math.abs(item - value) < Math.abs(best - value) ? item : best, list[0]);
}

export function newStageProgress() {
  return Object.fromEntries(DISTRICTS.map((district) => [
    district.id, { fares: 0, onTimeFares: 0, coins: 0 }
  ]));
}

export function getStageProgress(profile, districtId) {
  return profile.stageProgress?.[districtId] ?? { fares: 0, onTimeFares: 0, coins: 0 };
}

export function isStageComplete(profile, districtId) {
  const district = getDistrict(districtId);
  if (!district) return false;
  const progress = getStageProgress(profile, districtId);
  return progress.fares >= district.objective.fares &&
    progress.onTimeFares >= district.objective.onTimeFares &&
    progress.coins >= district.objective.coins;
}

export function availableDistricts(profile) {
  const unlocked = new Set(profile.districtsUnlocked ?? [DISTRICTS[0].id]);
  return DISTRICTS.filter((district) => unlocked.has(district.id));
}

export function canUnlockDistrict(profile, districtId) {
  const index = DISTRICTS.findIndex((district) => district.id === districtId);
  if (index <= 0 || availableDistricts(profile).some((district) => district.id === districtId)) return false;
  const district = DISTRICTS[index];
  return availableDistricts(profile).some((item) => item.id === DISTRICTS[index - 1].id) &&
    isStageComplete(profile, DISTRICTS[index - 1].id) &&
    profile.cashCents >= district.entryFeeCents;
}

export function unlockDistrict(profile, districtId) {
  const index = DISTRICTS.findIndex((district) => district.id === districtId);
  if (index <= 0) return { profile, ok: false, message: "That neighborhood cannot be unlocked yet." };
  const district = DISTRICTS[index];
  if (availableDistricts(profile).some((item) => item.id === districtId)) {
    return { profile, ok: false, message: `${district.name} is already unlocked.` };
  }
  if (!availableDistricts(profile).some((item) => item.id === DISTRICTS[index - 1].id)) {
    return { profile, ok: false, message: `Unlock ${DISTRICTS[index - 1].name} first.` };
  }
  if (!isStageComplete(profile, DISTRICTS[index - 1].id)) {
    return { profile, ok: false, message: `Complete the ${DISTRICTS[index - 1].name} challenge first.` };
  }
  if (profile.cashCents < district.entryFeeCents) {
    return {
      profile,
      ok: false,
      message: `You need ${formatMoney(district.entryFeeCents - profile.cashCents)} more in driver earnings for the ${district.name} entry permit.`
    };
  }
  return {
    profile: {
      ...profile,
      cashCents: profile.cashCents - district.entryFeeCents,
      districtsUnlocked: [...(profile.districtsUnlocked ?? [DISTRICTS[0].id]), districtId]
    },
    ok: true,
    message: `${district.name} entry permit paid for ${formatMoney(district.entryFeeCents)}.`
  };
}

export function getCarStats(profile, damage = 0) {
  const engine = profile.upgrades.includes("engine-tune");
  const conditionFactor = Math.max(0.25, 1 - Math.max(0, Math.min(100, damage)) / 125);
  return {
    acceleration: (engine ? 19 : 13) * conditionFactor,
    maxSpeed: (engine ? 82 : 61) * conditionFactor,
    steeringFactor: Math.max(0.45, 1 - Math.max(0, Math.min(100, damage)) / 180),
    fuelUsePerMeter: profile.upgrades.includes("eco-tune") ? .0033 : .0055,
    maxFuel: BASE_FUEL_CAPACITY + (profile.upgrades.includes("long-range-tank") ? 20 : 0)
  };
}

function spawnCoins(shift) {
  const candidates = CITY.verticalRoads.flatMap((x) =>
    CITY.horizontalRoads.map((y) => ({ x, y }))
  ).filter((point) =>
    distanceTo(point, shift) > 160 &&
    shift.roadworks.every((barrier) => distanceTo(point, barrier) > 90)
  );
  for (let index = candidates.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(seededRandom(shift) * (index + 1));
    [candidates[index], candidates[swap]] = [candidates[swap], candidates[index]];
  }
  shift.coins = candidates.slice(0, 10).map((point, index) => ({
    id: `${shift.districtId}-coin-${index + 1}`,
    ...point
  }));
}

function randomRoadPosition(random, id, occupied = []) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const horizontal = random() < 0.53;
    const road = horizontal
      ? CITY.horizontalRoads[Math.floor(random() * CITY.horizontalRoads.length)]
      : CITY.verticalRoads[Math.floor(random() * CITY.verticalRoads.length)];
    const coordinate = horizontal
      ? CITY.verticalRoads[1] + random() * (CITY.verticalRoads.at(-2) - CITY.verticalRoads[1])
      : CITY.horizontalRoads[1] + random() * (CITY.horizontalRoads.at(-2) - CITY.horizontalRoads[1]);
    const curb = CITY.roadWidth * 0.48 + 28;
    const position = horizontal
      ? { x: coordinate, y: road + (random() < .5 ? -curb : curb) }
      : { x: road + (random() < .5 ? -curb : curb), y: coordinate };
    if (occupied.every((other) => Math.hypot(position.x - other.x, position.y - other.y) > 160)) {
      return { id, ...position, roadAxis: horizontal ? "horizontal" : "vertical" };
    }
  }
  const y = CITY.horizontalRoads[(occupied.length + 1) % CITY.horizontalRoads.length];
  return { id, x: CITY.verticalRoads[(occupied.length + 1) % CITY.verticalRoads.length], y: y + CITY.roadWidth * .6, roadAxis: "vertical" };
}

function streetDistance(from, to) {
  return Math.abs(from.x - to.x) + Math.abs(from.y - to.y);
}

function choosePassengerDestination(shift, pickup) {
  const district = getDistrict(shift.districtId);
  const requestedDistance = randomBetween(district.rideMeters[0], district.rideMeters[1], () => seededRandom(shift));
  const destinations = CITY.verticalRoads.flatMap((x) =>
    CITY.horizontalRoads.map((y) => ({ x, y, distance: streetDistance(pickup, { x, y }) }))
  );
  const inRange = destinations.filter(({ distance }) =>
    distance >= district.rideMeters[0] * .7 && distance <= district.rideMeters[1] * 1.3
  );
  const candidates = (inRange.length ? inRange : destinations)
    .sort((a, b) => Math.abs(a.distance - requestedDistance) - Math.abs(b.distance - requestedDistance));
  const bestDifference = Math.abs(candidates[0].distance - requestedDistance);
  const closest = candidates.filter(({ distance }) => Math.abs(distance - requestedDistance) <= bestDifference + 80);
  const selected = closest[Math.floor(seededRandom(shift) * closest.length)];
  return { x: selected.x, y: selected.y };
}

function seededRandom(shift) {
  shift.randomSeed = (shift.randomSeed * 1664525 + 1013904223) >>> 0;
  return shift.randomSeed / 4294967296;
}

function spawnPassengers(shift, amount = 5, exclude = []) {
  const names = ["Riley", "Jamie", "Morgan", "Sam", "Avery", "Jordan", "Casey", "Taylor", "Robin", "Cameron", "Ellis", "Drew"];
  const destinations = ["the clinic", "Central Station", "the library", "Pine Street", "the river walk", "City Hall", "the hotel", "the market"];
  const occupied = [...exclude];
  for (let index = 0; index < amount; index += 1) {
    const passengerId = shift.nextPassengerId++;
    const spot = randomRoadPosition(() => seededRandom(shift), `rider-${passengerId}`, occupied);
    occupied.push(spot);
    const name = names[Math.floor(seededRandom(shift) * names.length)];
    const destination = destinations[Math.floor(seededRandom(shift) * destinations.length)];
    shift.passengers.push({
      ...spot,
      name,
      destination,
      state: "waiting",
      dropoff: choosePassengerDestination(shift, spot)
    });
  }
}

function spawnTraffic(shift, amount = 13) {
  const colors = ["#6e8998", "#bd795e", "#d0c3a0", "#648477", "#81779a", "#f0e2c7", "#9d8060"];
  for (let index = 0; index < amount; index += 1) {
    const horizontal = seededRandom(shift) < .55;
    const lanes = horizontal ? CITY.horizontalRoads : CITY.verticalRoads;
    const road = lanes[Math.floor(seededRandom(shift) * lanes.length)];
    const direction = seededRandom(shift) < .5 ? 1 : -1;
    const position = horizontal
      ? { x: 90 + seededRandom(shift) * (CITY.width - 180), y: road + direction * 24 }
      : { x: road + direction * 24, y: 80 + seededRandom(shift) * (CITY.height - 160) };
    shift.traffic.push({
      id: shift.nextTrafficId++,
      ...position,
      axis: horizontal ? "horizontal" : "vertical",
      direction,
      speed: 12 + seededRandom(shift) * 18,
      color: colors[Math.floor(seededRandom(shift) * colors.length)],
      model: Math.floor(seededRandom(shift) * 3)
    });
  }
}

export function newProfile() {
  return {
    version: SAVE_VERSION,
    cashCents: STARTING_CASH_CENTS,
    rides: 0,
    coins: 0,
    reputation: 4.8,
    bestRating: 4.8,
    upgrades: [],
    settings: { sound: false, reducedMotion: false },
    districtsUnlocked: [DISTRICTS[0].id],
    districtsVisited: [],
    stageProgress: newStageProgress(),
    totalMeters: 0,
    cleanRides: 0
  };
}

export function getDistrict(id) {
  return DISTRICTS.find((district) => district.id === id);
}

export function newCar() {
  return { model: "Morrowline S4", color: "#d7aa69", maxFuel: BASE_FUEL_CAPACITY, fuel: STARTING_FUEL, damage: 0, meters: 0 };
}

export function createShift(profile, districtId, random = Math.random) {
  const district = getDistrict(districtId);
  if (!district) throw new Error(`Unknown district: ${districtId}`);
  if (!availableDistricts(profile).some((item) => item.id === districtId)) throw new Error("This district is not open yet.");
  const shift = {
    status: "driving",
    districtId,
    x: CITY.verticalRoads[1],
    y: CITY.horizontalRoads[2],
    heading: -Math.PI / 2,
    distance: 0,
    clockMinutes: 9 * 60,
    speed: 0,
    fuel: getCarStats(profile).maxFuel,
    maxFuel: getCarStats(profile).maxFuel,
    damage: 0,
    passenger: null,
    passengers: [],
    trip: null,
    traffic: [],
    coins: [],
    roadworks: district.roadworks.map((barrier, index) => ({ ...barrier, id: `${district.id}-roadwork-${index + 1}` })),
    nextTrafficId: 1,
    nextPassengerId: 1,
    safeSeconds: 0,
    harshBrakeCount: 0,
    collisionCount: 0,
    collisionCooldown: 0,
    wasBraking: false,
    offRoadSeconds: 0,
    stranded: false,
    rescueUsed: false,
    serviceNearby: false,
    lastMessage: "Free drive is ready. Explore the neighborhood, collect street coins, or choose a passenger for a fare.",
    lastEvent: "Free drive is active. Passengers are waiting at the marked curbs.",
    randomSeed: Math.floor(random() * 2_000_000_000) || 98765,
    fareTotalCents: 0,
    tripCount: 0,
    currentRideRating: 5,
    closed: false
  };
  spawnPassengers(shift, 6);
  spawnTraffic(shift, district.trafficCount);
  spawnCoins(shift);
  return shift;
}

export function restartDistrict(shift, profile, random = Math.random) {
  const district = getDistrict(shift.districtId);
  if (!district) throw new Error(`Unknown district: ${shift.districtId}`);
  const restarted = createShift(profile, district.id, random);
  const updatedProfile = {
    ...profile,
    stageProgress: {
      ...profile.stageProgress,
      [district.id]: { fares: 0, onTimeFares: 0, coins: 0 }
    }
  };
  const message = `No funds for a full repair. ${district.name} has restarted; its task progress reset. Your remaining cash and upgrades are kept.`;
  restarted.lastMessage = message;
  restarted.lastEvent = "District restarted · taxi repaired · task progress reset.";
  return { shift: restarted, profile: updatedProfile, ok: true, message };
}

export function getPickupAt(shift) {
  return shift.trip?.status === "to-pickup" ? shift.trip.pickupAt : null;
}

export function getDropoffAt(shift) {
  return shift.trip?.status === "to-dropoff" ? shift.trip.dropoffAt : null;
}

export function nextFuelStation(shift) {
  const stationGrid = CITY.verticalRoads.map((x, index) => ({
    x,
    y: CITY.horizontalRoads[(index * 2 + 1) % CITY.horizontalRoads.length]
  }));
  return stationGrid.sort((a, b) => Math.hypot(a.x - shift.x, a.y - shift.y) - Math.hypot(b.x - shift.x, b.y - shift.y))[0];
}

export function distanceTo(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function nearestObjective(shift) {
  if (shift.trip?.status === "to-pickup") return { type: "pickup", ...shift.trip.pickupAt };
  if (shift.trip?.status === "to-dropoff") return { type: "dropoff", ...shift.trip.dropoffAt };
  return { type: "fuel", ...nextFuelStation(shift) };
}

export function isOnRoad(x, y, extra = 0) {
  const tolerance = CITY.roadWidth / 2 + extra;
  return CITY.verticalRoads.some((roadX) => Math.abs(roadX - x) <= tolerance) ||
    CITY.horizontalRoads.some((roadY) => Math.abs(roadY - y) <= tolerance);
}

export function canParkAt(shift, position) {
  return distanceTo(shift, position) <= 48 && Math.abs(shift.speed) <= 3;
}

export function findPassenger(shift, passengerId) {
  return shift.passengers.find((passenger) => passenger.id === passengerId);
}

export function acceptRide(shift, profile, random = Math.random, passengerId) {
  if (shift.damage >= 100 || shift.status === "disabled") return { shift: { ...shift, lastMessage: "The taxi is disabled. Repair it before accepting a fare." }, ok: false };
  if (shift.status === "stranded" || shift.fuel <= 0) return { shift: { ...shift, lastMessage: "You're out of fuel. Call roadside assistance before accepting a fare." }, ok: false };
  if (Math.abs(shift.speed) > 3) return { shift: { ...shift, lastMessage: "Stop the taxi before accepting a passenger's pickup." }, ok: false };
  if (shift.trip?.status === "to-pickup" || shift.trip?.status === "to-dropoff") return { shift: { ...shift, lastMessage: "Finish your current passenger's trip before accepting another fare." }, ok: false };
  const passenger = passengerId ? findPassenger(shift, passengerId) : shift.passengers
    .filter((rider) => rider.state === "waiting")
    .sort((a, b) => distanceTo(shift, a) - distanceTo(shift, b))[0];
  if (!passenger || passenger.state !== "waiting") return { shift: { ...shift, lastMessage: "There are no waiting passengers nearby. Wait for another call." }, ok: false };
  const district = getDistrict(shift.districtId);
  const dropoffAt = passenger.dropoff;
  const rideMeters = streetDistance(passenger, dropoffAt);
  const pickupDistance = streetDistance(shift, passenger);
  const deadlineSeconds = Math.ceil(
    ((pickupDistance + rideMeters) / (district.limit * 1000 / 3600)) * district.deadlineFactor + 35
  );
  const fareBaseCents = 425 + Math.round((rideMeters / 1000) * district.fareCentsPerKm);
  const passengers = shift.passengers.map((rider) => rider.id === passenger.id ? { ...rider, state: "reserved" } : rider);
  return {
    shift: {
      ...shift,
      status: "driving",
      passengers,
      passenger: { id: passenger.id, name: passenger.name, destination: passenger.destination },
      trip: {
        status: "to-pickup",
        pickupAt: { x: passenger.x, y: passenger.y },
        dropoffAt,
        rideMeters,
        deadlineSeconds,
        late: false,
        fareBaseCents,
        acceptedAt: shift.distance,
        reputationAtStart: profile.reputation,
        speedingMeters: 0,
        offRoadMeters: 0,
        harshBrakes: 0,
        collisions: 0
      },
      currentRideRating: 5,
      lastMessage: `${passenger.name} is waiting at the marked curb. Drive there, slow down, and park beside them to pick them up.`,
      lastEvent: `Passenger ${passenger.name} reserved at curbside.`
    },
    ok: true
  };
}

export function isParkedAtObjective(shift, objective = nearestObjective(shift)) {
  return Boolean(objective && canParkAt(shift, objective));
}

export function takePassenger(shift) {
  if (shift.trip?.status !== "to-pickup") return { shift, ok: false, message: "There is no passenger waiting for pickup." };
  if (!isParkedAtObjective(shift, { type: "pickup", ...shift.trip.pickupAt })) {
    const reason = Math.abs(shift.speed) > 3 ? "Slow down to a complete stop beside the passenger." :
      distanceTo(shift, shift.trip.pickupAt) > 48 ? "Drive to the visible passenger and pull up beside them." :
        "You must stop to pick up the waiting passenger.";
    return { shift: { ...shift, lastMessage: reason }, ok: false, message: reason };
  }
  const passengers = shift.passengers.map((rider) => rider.id === shift.passenger.id ? { ...rider, state: "boarded" } : rider);
  return {
    shift: {
      ...shift,
      passengers,
      trip: { ...shift.trip, status: "to-dropoff" },
      lastMessage: `${shift.passenger.name} gets into the taxi. Drive to ${shift.passenger.destination} and park near the destination marker.`,
      lastEvent: `${shift.passenger.name} got in. Passenger aboard.`
    },
    ok: true,
    message: "Passenger got into the taxi."
  };
}

export function rateRide(shift, profile) {
  const safeDistance = Math.max(1, shift.trip?.rideMeters ?? 1);
  const collisionPenalty = (shift.trip?.collisions ?? 0) * 1.25;
  const harshBrakePenalty = (shift.trip?.harshBrakes ?? 0) * .65;
  const speedingPenalty = Math.max(0, shift.trip?.speedingMeters ?? 0) / safeDistance * 1.35;
  const offRoadPenalty = Math.max(0, shift.trip?.offRoadMeters ?? 0) / safeDistance * 1.5;
  const latePenalty = shift.trip?.late ? 1 : 0;
  const rating = Math.min(5, Math.max(1, 5 - collisionPenalty - harshBrakePenalty - speedingPenalty - offRoadPenalty - latePenalty));
  const distanceKm = (shift.trip?.rideMeters ?? 0) / 1000;
  const safeTip = Math.round(Math.max(0, rating - 3) * 45);
  const comfortTip = profile.upgrades.includes("comfort-cabin") ? Math.round((shift.trip?.fareBaseCents ?? 0) * .1) : 0;
  const fullFareCents = (shift.trip?.fareBaseCents ?? 0) + safeTip + comfortTip + Math.round(distanceKm * 35);
  const fareCents = shift.trip?.late ? Math.round(fullFareCents * .65) : fullFareCents;
  return { rating: Math.round(rating * 10) / 10, fareCents, safeTipCents: safeTip, late: Boolean(shift.trip?.late) };
}

export function dropOffPassenger(shift, profile) {
  if (shift.trip?.status !== "to-dropoff") return { shift, ok: false, rewardCents: 0, message: "You don't have a passenger to drop off." };
  if (!isParkedAtObjective(shift, { type: "dropoff", ...shift.trip.dropoffAt })) {
    const reason = Math.abs(shift.speed) > 3 ? "Stop safely beside the destination to let your passenger out." :
      distanceTo(shift, shift.trip.dropoffAt) > 48 ? "Drive to the destination and park beside its marker." :
        "Stop close to the destination to complete the fare.";
    return { shift: { ...shift, lastMessage: reason }, ok: false, rewardCents: 0, message: reason };
  }
  const result = rateRide(shift, profile);
  const stageProgress = {
    ...profile.stageProgress,
    [shift.districtId]: {
      ...getStageProgress(profile, shift.districtId),
      fares: getStageProgress(profile, shift.districtId).fares + 1,
      onTimeFares: getStageProgress(profile, shift.districtId).onTimeFares + (result.late ? 0 : 1)
    }
  };
  const visited = profile.districtsVisited.includes(shift.districtId) ? profile.districtsVisited : [...profile.districtsVisited, shift.districtId];
  const coinReward = result.late ? 0 : 2;
  const updatedProfile = {
    ...profile,
    cashCents: profile.cashCents + result.fareCents,
    coins: profile.coins + coinReward,
    rides: profile.rides + 1,
    reputation: Math.round(Math.max(1, Math.min(5, profile.reputation * .82 + result.rating * .18)) * 10) / 10,
    bestRating: Math.max(profile.bestRating, result.rating),
    districtsVisited: visited,
    stageProgress,
    totalMeters: profile.totalMeters + shift.trip.rideMeters,
    cleanRides: profile.cleanRides + (result.rating >= 4.5 ? 1 : 0)
  };
  const stageCleared = isStageComplete(updatedProfile, shift.districtId);
  const nextDistrict = DISTRICTS[DISTRICTS.findIndex((district) => district.id === shift.districtId) + 1];
  const safeRide = result.rating >= 4.5;
  const passenger = shift.passenger;
  const finishedShift = {
    ...shift,
    status: "driving",
    passengers: shift.passengers.filter((rider) => rider.id !== passenger.id),
    passenger: null,
    fareTotalCents: shift.fareTotalCents + result.fareCents,
    tripCount: shift.tripCount + 1,
    lastMessage: `${passenger.name} gets out at ${passenger.destination}. Fare ${formatMoney(result.fareCents)}${result.late ? " — late delivery, reduced fare." : ` · +${coinReward} coins`}${stageCleared ? nextDistrict ? ` Challenge complete — earn ${formatMoney(nextDistrict.entryFeeCents)} for the ${nextDistrict.name} entry permit.` : " Final challenge complete — all stages finished!" : "."}`,
    lastEvent: stageCleared ? `${shift.districtId === DISTRICTS.at(-1).id ? "Final stage complete" : "Stage challenge complete"} · ${result.rating.toFixed(1)} ★` :
      result.late ? `Late fare complete · ${result.rating.toFixed(1)} ★ · reduced pay` : `Fare complete · +${coinReward} coins · ${result.rating.toFixed(1)} ★`,
    currentRideRating: result.rating,
    trip: { ...shift.trip, status: "complete", rating: result.rating, fareCents: result.fareCents, safe: safeRide }
  };
  spawnPassengers(finishedShift, 1, finishedShift.passengers);
  return {
    shift: finishedShift,
    ok: true,
    rewardCents: result.fareCents,
    rating: result.rating,
    safeRide,
    coinReward,
    stageCleared,
    profile: updatedProfile
  };
}

function nearestRoad(value, roads) {
  return roads.reduce((best, road) => Math.abs(road - value) < Math.abs(best - value) ? road : best, roads[0]);
}

function updateTraffic(shift, dt) {
  for (const car of shift.traffic) {
    if (car.axis === "horizontal") car.x += car.direction * car.speed * dt;
    else car.y += car.direction * car.speed * dt;
    if (car.x < 40) car.x = CITY.width - 40;
    if (car.x > CITY.width - 40) car.x = 40;
    if (car.y < 40) car.y = CITY.height - 40;
    if (car.y > CITY.height - 40) car.y = 40;
  }
}

export function advanceShift(input, controls, deltaSeconds, profile) {
  if (input.closed || input.stranded || input.status === "disabled" || input.damage >= 100 || input.status === "idle") return { shift: input, events: [], profile };
  const dt = Math.min(.06, Math.max(0, deltaSeconds));
  if (!dt) return { shift: input, events: [], profile };
  const shift = {
    ...input,
    traffic: input.traffic.map((car) => ({ ...car })),
    roadworks: input.roadworks.map((barrier) => ({ ...barrier })),
    coins: input.coins.map((coin) => ({ ...coin })),
    passengers: input.passengers.map((person) => ({ ...person })),
    trip: input.trip ? { ...input.trip } : null,
    passenger: input.passenger ? { ...input.passenger } : null
  };
  const events = [];
  const reversing = controls.reverse || controls.accelerateBack;
  const throttle = controls.accelerate ? 1 : reversing ? -1 : 0;
  const braking = controls.brake || reversing;
  if (braking && !shift.wasBraking && Math.abs(shift.speed) > 28 && shift.trip?.status === "to-dropoff") {
    shift.trip.harshBrakes = (shift.trip.harshBrakes ?? 0) + 1;
  }
  shift.wasBraking = braking;
  shift.collisionCooldown = Math.max(0, shift.collisionCooldown - dt);

  const carStats = getCarStats(profile, shift.damage);
  if (throttle > 0) shift.speed += carStats.acceleration * dt;
  else if (throttle < 0) shift.speed -= (shift.speed > 0 ? 32 : 12) * dt;
  else shift.speed *= Math.max(0, 1 - (braking ? 4.2 : .8) * dt);
  if (controls.brake && shift.speed > 0) shift.speed -= 25 * dt;
  if (controls.handbrake) shift.speed *= Math.max(0, 1 - 8 * dt);
  shift.speed = Math.max(-12, Math.min(carStats.maxSpeed, shift.speed));
  if (Math.abs(shift.speed) < .035) shift.speed = 0;

  const steering = (controls.right ? 1 : 0) - (controls.left ? 1 : 0);
  if (steering) {
    const steeringSpeed = .9 * carStats.steeringFactor / (1 + Math.max(0, Math.abs(shift.speed) - 25) / 35);
    shift.heading += steering * steeringSpeed * dt * Math.sign(shift.speed || 1);
  }
  const previous = { x: shift.x, y: shift.y };
  const metersPerSecond = shift.speed * (1000 / 3600);
  shift.x = Math.max(25, Math.min(CITY.width - 25, shift.x + Math.cos(shift.heading) * metersPerSecond * dt));
  shift.y = Math.max(25, Math.min(CITY.height - 25, shift.y + Math.sin(shift.heading) * metersPerSecond * dt));
  const roadwork = shift.roadworks.find((barrier) =>
    distanceTo(shift, barrier) < 18 &&
    distanceTo(previous, barrier) > distanceTo(shift, barrier) &&
    Math.abs(shift.speed) > 2
  );
  if (roadwork) {
    shift.x = previous.x;
    shift.y = previous.y;
    shift.speed = 0;
    shift.collisionCooldown = 1.2;
    shift.damage = Math.min(100, shift.damage + (profile.upgrades.includes("safety-tyres") ? 6 : 12));
    shift.collisionCount += 1;
    if (shift.trip) shift.trip.collisions = (shift.trip.collisions ?? 0) + 1;
    events.push("Roadwork barrier — stop and steer around the closed lane.");
  }
  const metersMoved = distanceTo(previous, shift);
  shift.distance += metersMoved;
  shift.clockMinutes = (shift.clockMinutes + dt * 3) % 1440;
  const speedLimit = getDistrict(shift.districtId).limit;
  if (shift.trip && shift.speed > speedLimit) shift.trip.speedingMeters += metersMoved;

  const drivingOnRoad = isOnRoad(shift.x, shift.y, -8);
  if (!drivingOnRoad && Math.abs(shift.speed) > 2) {
    shift.offRoadSeconds += dt;
    shift.speed = Math.min(shift.speed, 18);
    if (shift.offRoadSeconds > 1.5) {
      shift.damage = Math.min(100, shift.damage + (profile.upgrades.includes("safety-tyres") ? 4 : 9));
      if (shift.trip?.status === "to-dropoff") {
        shift.trip.offRoadMeters = (shift.trip.offRoadMeters ?? 0) + 10;
      }
      if (shift.offRoadSeconds < 1.6 + dt) events.push("Off road — slow down and steer back to the street.");
      shift.offRoadSeconds = 0;
    }
  } else shift.offRoadSeconds = Math.max(0, shift.offRoadSeconds - dt * 2);

  const fuelRate = carStats.fuelUsePerMeter;
  shift.fuel = Math.max(0, shift.fuel - metersMoved * fuelRate);
  updateTraffic(shift, dt);
  const collectedCoins = shift.coins.filter((coin) => distanceTo(shift, coin) <= 25);
  let updatedProfile = profile;
  if (collectedCoins.length) {
    const coinCount = collectedCoins.length;
    const progress = getStageProgress(profile, shift.districtId);
    updatedProfile = {
      ...profile,
      coins: profile.coins + coinCount,
      stageProgress: {
        ...profile.stageProgress,
        [shift.districtId]: { ...progress, coins: progress.coins + coinCount }
      }
    };
    shift.coins = shift.coins.filter((coin) => distanceTo(shift, coin) > 25);
    events.push(`Collected ${coinCount} Morrow coin${coinCount === 1 ? "" : "s"}!`);
  }
  if (shift.trip && shift.trip.status !== "complete" && !shift.trip.late) {
    shift.trip.deadlineSeconds = Math.max(0, shift.trip.deadlineSeconds - dt);
    if (shift.trip.deadlineSeconds === 0) {
      shift.trip.late = true;
      events.push("The deadline passed. Finish the fare for reduced pay and a lower rating.");
    }
  }

  const nearbyTraffic = shift.traffic.find((car) =>
    Math.hypot(car.x - shift.x, car.y - shift.y) < 23 &&
    Math.abs(shift.speed) > 5 &&
    shift.collisionCooldown <= 0
  );
  if (nearbyTraffic) {
    shift.collisionCooldown = 1.2;
    shift.speed = Math.sign(shift.speed) * Math.min(Math.abs(shift.speed), 5);
    shift.damage = Math.min(100, shift.damage + (profile.upgrades.includes("safety-tyres") ? 6 : 12));
    shift.collisionCount += 1;
    if (shift.trip?.status === "to-dropoff") shift.trip.collisions = (shift.trip.collisions ?? 0) + 1;
    events.push("Traffic bump — slow down and give other cars room.");
  }

  const nearestVert = nearest(shift.x, CITY.verticalRoads);
  const nearestHoriz = nearest(shift.y, CITY.horizontalRoads);
  const insideIntersection = Math.abs(shift.x - nearestVert) < 58 && Math.abs(shift.y - nearestHoriz) < 58;
  if (!drivingOnRoad && Math.abs(shift.speed) > 2) shift.lastEvent = "Off the road. Steer back to the marked streets.";
  if (shift.speed > getDistrict(shift.districtId).limit && shift.trip?.status === "to-dropoff" && !shift.trip.speedWarningShown) {
    shift.trip.speedWarningShown = true;
    events.push(`Slow down — this neighborhood limit is ${getDistrict(shift.districtId).limit} km/h.`);
  }
  if (shift.trip?.status === "to-pickup" && distanceTo(shift, shift.trip.pickupAt) < 50 && shift.speed < 4) {
    shift.lastEvent = `Passenger ${shift.passenger.name} is waiting right by the curb. Stop and press Space to pick them up.`;
  } else if (shift.trip?.status === "to-dropoff" && distanceTo(shift, shift.trip.dropoffAt) < 55 && shift.speed < 4) {
    shift.lastEvent = `You are at ${shift.passenger.destination}. Park and press Space to finish the fare.`;
  } else if (insideIntersection && shift.speed > 38 && !events.length && shift.trip?.status === "to-dropoff") {
    shift.lastEvent = "Cross the intersection carefully. Watch for moving traffic.";
  }
  const station = nextFuelStation(shift);
  shift.serviceNearby = distanceTo(shift, station) <= 48 && shift.speed <= 2 && shift.fuel < shift.maxFuel - .1;
  if (shift.fuel <= 0 && !shift.stranded) {
    shift.fuel = 0;
    shift.speed = 0;
    shift.stranded = true;
    shift.status = "stranded";
    shift.lastMessage = "The engine ran out of fuel. Call roadside assistance for an emergency top-up.";
    events.push("Fuel empty — request roadside assistance.");
  }
  if (shift.damage >= 100) {
    shift.damage = 100;
    shift.speed = 0;
    shift.status = "disabled";
    shift.lastMessage = `Taxi disabled. Repair it for ${formatMoney(REPAIR_CENTS_PER_DAMAGE * 100)} before driving again.`;
    events.push("Vehicle disabled · repair required before driving.");
    if (updatedProfile.cashCents < REPAIR_CENTS_PER_DAMAGE * 100) {
      const restarted = restartDistrict(shift, updatedProfile);
      return { shift: restarted.shift, events: [restarted.message], profile: restarted.profile, restarted: true };
    }
  }
  return { shift, events, profile: updatedProfile };
}

export function refuel(shift, profile) {
  if (shift.stranded || shift.status === "stranded") return { shift, profile, ok: false, message: "Call roadside assistance first; it will get the car moving again." };
  const station = nextFuelStation(shift);
  if (Math.abs(shift.speed) > 2 || shift.trip?.status === "to-dropoff") return { shift, profile, ok: false, message: "Park at a service station after completing your passenger's ride." };
  if (distanceTo(shift, station) > 48) return { shift, profile, ok: false, message: "Drive to the marked service station and stop to refuel." };
  const liters = Math.min(shift.maxFuel - shift.fuel, Math.floor(profile.cashCents / FUEL_PRICE_CENTS_PER_LITER));
  if (liters < 1) return { shift, profile, ok: false, message: "Not enough shift earnings to buy a liter. Finish a fare or use free roadside assistance." };
  const costCents = liters * FUEL_PRICE_CENTS_PER_LITER;
  return {
    shift: { ...shift, fuel: Math.min(shift.maxFuel, shift.fuel + liters), lastMessage: `Refuelled ${liters} L for ${formatMoney(costCents)}.`, lastEvent: "Fuel stop." },
    profile: { ...profile, cashCents: profile.cashCents - costCents },
    ok: true, costCents, message: `Refuelled ${liters} L for ${formatMoney(costCents)}.`
  };
}

export function roadsideAssistance(shift, profile) {
  if (!shift.stranded && shift.fuel > 0) return { shift, profile, ok: false, message: "Roadside assistance isn't needed right now." };
  const feeCents = Math.min(profile.cashCents, 2500);
  return {
    shift: { ...shift, stranded: false, status: "driving", fuel: Math.min(shift.maxFuel, shift.fuel + 5), speed: 0, rescueUsed: true, lastMessage: `Roadside assistance delivered 5 L. Service fee: ${formatMoney(feeCents)}.`, lastEvent: "Roadside assistance arrived." },
    profile: { ...profile, cashCents: profile.cashCents - feeCents },
    ok: true, feeCents
  };
}

export function repairCar(shift, profile) {
  const disabled = shift.damage >= 100 || shift.status === "disabled";
  if (!disabled && (Math.abs(shift.speed) > 2 || shift.trip?.status === "to-pickup" || shift.trip?.status === "to-dropoff")) {
    return { shift, profile, ok: false, message: "Finish the current fare and park before visiting the mechanic." };
  }
  const fullRepairCost = Math.ceil(shift.damage * REPAIR_CENTS_PER_DAMAGE);
  if (disabled && profile.cashCents < fullRepairCost) return restartDistrict(shift, profile);
  const costCents = Math.min(fullRepairCost, profile.cashCents);
  if (costCents <= 0 || shift.damage <= 0) return { shift: { ...shift, lastMessage: "Your car does not need any repairs." }, profile, ok: false, message: "Your car does not need any repairs." };
  const repaired = Math.min(shift.damage, costCents / REPAIR_CENTS_PER_DAMAGE);
  const remainingDamage = Math.max(0, shift.damage - repaired);
  const passengers = disabled
    ? shift.passengers.map((rider) => rider.state === "waiting" ? rider : { ...rider, state: "waiting" })
    : shift.passengers;
  const updatedShift = {
    ...shift,
    damage: remainingDamage,
    stranded: disabled ? false : shift.stranded,
    status: disabled ? "driving" : shift.status,
    trip: disabled ? null : shift.trip,
    passenger: disabled ? null : shift.passenger,
    passengers,
    lastMessage: `Mechanic repaired ${repaired.toFixed(0)}% damage for ${formatMoney(costCents)}.${disabled && shift.trip ? " The active fare was cancelled." : ""}`,
    lastEvent: "Vehicle repaired."
  };
  return { shift: updatedShift, profile: { ...profile, cashCents: profile.cashCents - costCents }, ok: true, costCents };
}

export function purchaseGarageItem(profile, id) {
  const item = GARAGE_ITEMS.find((candidate) => candidate.id === id);
  if (!item) return { profile, ok: false, message: "That garage item is not available." };
  if (profile.upgrades.includes(id)) return { profile, ok: false, message: "That equipment is already fitted." };
  if (profile.coins < item.coinCost) return { profile, ok: false, message: `You need ${item.coinCost - profile.coins} more Morrow coins.` };
  return { profile: { ...profile, coins: profile.coins - item.coinCost, upgrades: [...profile.upgrades, id] }, ok: true, message: `${item.name} fitted to your cab.` };
}

export function formatMoney(cents) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Math.max(0, cents) / 100);
}
