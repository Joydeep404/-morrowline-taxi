import { DISTRICTS, GARAGE_ITEMS } from "./districts.js";
import { newProfile, SAVE_VERSION } from "./game.js";

export const SAVE_KEY = "morrowline.taxi-save.v5";
export const LEGACY_TAXI_V4_SAVE_KEY = "morrowline.taxi-save.v4";
export const LEGACY_TAXI_SAVE_KEY = "morrowline.taxi-save.v3";
export const LEGACY_TAXI_V2_SAVE_KEY = "morrowline.taxi-save.v2";
export const LEGACY_SAVE_KEY = "morrowline.save.v1";

export function validateProfile(value) {
  if (!value || typeof value !== "object" || value.version !== SAVE_VERSION) {
    throw new Error("This file is not a supported Morrowline Taxi save.");
  }
  if (!Number.isSafeInteger(value.cashCents) || value.cashCents < 0) throw new Error("Save file has an invalid balance.");
  if (!Number.isSafeInteger(value.rides) || value.rides < 0) throw new Error("Save file has invalid trip history.");
  if (!Number.isFinite(value.reputation) || value.reputation < 1 || value.reputation > 5) throw new Error("Save file has invalid driver reputation.");
  if (!Number.isFinite(value.bestRating) || value.bestRating < 1 || value.bestRating > 5) throw new Error("Save file has an invalid best rating.");
  const upgrades = new Set(GARAGE_ITEMS.map((item) => item.id));
  if (!Array.isArray(value.upgrades) || !value.upgrades.every((id) => upgrades.has(id)) || new Set(value.upgrades).size !== value.upgrades.length) {
    throw new Error("Save file has invalid garage equipment.");
  }
  const districts = new Set(DISTRICTS.map((district) => district.id));
  if (!Array.isArray(value.districtsVisited) || !value.districtsVisited.every((id) => districts.has(id))) {
    throw new Error("Save file has invalid neighborhood history.");
  }
  if (!Number.isSafeInteger(value.coins) || value.coins < 0 ||
      !value.stageProgress || typeof value.stageProgress !== "object" || Array.isArray(value.stageProgress)) {
    throw new Error("Save file has invalid coin or stage progress.");
  }
  for (const district of DISTRICTS) {
    const progress = value.stageProgress[district.id];
    if (!progress || !["fares", "onTimeFares", "coins"].every((key) => Number.isSafeInteger(progress[key]) && progress[key] >= 0)) {
      throw new Error("Save file has invalid stage objective progress.");
    }
  }
  if (!Number.isFinite(value.totalMeters) || value.totalMeters < 0 || !Number.isSafeInteger(value.cleanRides) || value.cleanRides < 0) {
    throw new Error("Save file has invalid driving statistics.");
  }
  if (!value.settings || typeof value.settings.sound !== "boolean" || typeof value.settings.reducedMotion !== "boolean") {
    throw new Error("Save file has invalid settings.");
  }
  return structuredClone(value);
}

function migrateCourierSave(storage) {
  const raw = storage.getItem(LEGACY_SAVE_KEY);
  if (!raw) return null;
  let previous;
  try {
    previous = JSON.parse(raw);
  } catch {
    throw new Error("Your previous Morrowline save is damaged. Export it before replacing browser data.");
  }
  if (previous?.version !== 1 || !Number.isSafeInteger(previous.credits) || previous.credits < 0) {
    throw new Error("Your previous Morrowline save could not be safely transferred. Export a backup before replacing browser data.");
  }
  const migrated = newProfile();
  migrated.cashCents = previous.credits * 100;
  migrated.rides = Array.isArray(previous.completed) ? previous.completed.length : 0;
  migrateStageProgress(migrated);
  migrated.districtsVisited = migrated.rides > 0 ? [DISTRICTS[0].id] : [];
  migrated.settings = {
    sound: previous.settings?.sound === true,
    reducedMotion: previous.settings?.reducedMotion === true
  };
  return migrated;
}

function migrateStageProgress(profile) {
  const completedStages = Math.min(profile.rides, DISTRICTS.length - 1);
  for (let index = 0; index < completedStages; index += 1) {
    const district = DISTRICTS[index];
    profile.stageProgress[district.id] = {
      fares: district.objective.fares,
      onTimeFares: district.objective.onTimeFares,
      coins: district.objective.coins
    };
  }
}

function migrateTaxiSave(storage, key, version) {
  const raw = storage.getItem(key);
  if (!raw) return null;
  let previous;
  try {
    previous = JSON.parse(raw);
  } catch {
    throw new Error("Your previous taxi save is damaged. Export it before replacing browser data.");
  }
  if (previous?.version !== version || !Number.isSafeInteger(previous.cashCents) || previous.cashCents < 0) {
    throw new Error("Your previous taxi save could not be safely transferred. Export a backup before replacing browser data.");
  }
  const migrated = newProfile();
  migrated.cashCents = previous.cashCents;
  migrated.rides = Number.isSafeInteger(previous.rides) && previous.rides >= 0 ? previous.rides : 0;
  migrated.reputation = Number.isFinite(previous.reputation) && previous.reputation >= 1 && previous.reputation <= 5 ? previous.reputation : migrated.reputation;
  migrated.bestRating = Number.isFinite(previous.bestRating) && previous.bestRating >= 1 && previous.bestRating <= 5 ? previous.bestRating : migrated.reputation;
  migrated.upgrades = Array.isArray(previous.upgrades)
    ? [...new Set(previous.upgrades.filter((id) => GARAGE_ITEMS.some((item) => item.id === id)))]
    : [];
  migrated.coins = Number.isSafeInteger(previous.coins) && previous.coins >= 0 ? previous.coins : 0;
  migrated.districtsVisited = Array.isArray(previous.districtsVisited)
    ? [...new Set(previous.districtsVisited.filter((id) => DISTRICTS.some((district) => district.id === id)))]
    : [];
  migrateStageProgress(migrated);
  if (version >= 4 && previous.stageProgress && typeof previous.stageProgress === "object" && !Array.isArray(previous.stageProgress)) {
    for (const district of DISTRICTS) {
      const progress = previous.stageProgress[district.id];
      if (progress && ["fares", "onTimeFares", "coins"].every((key) => Number.isSafeInteger(progress[key]) && progress[key] >= 0)) {
        migrated.stageProgress[district.id] = { fares: progress.fares, onTimeFares: progress.onTimeFares, coins: progress.coins };
      }
    }
  }
  migrated.totalMeters = Number.isFinite(previous.totalMeters) && previous.totalMeters >= 0 ? previous.totalMeters : 0;
  migrated.cleanRides = Number.isSafeInteger(previous.cleanRides) && previous.cleanRides >= 0 ? previous.cleanRides : 0;
  migrated.settings = {
    sound: previous.settings?.sound === true,
    reducedMotion: previous.settings?.reducedMotion === true
  };
  return migrated;
}

function loadLegacyProfile(storage) {
  const migrated = migrateTaxiSave(storage, LEGACY_TAXI_V4_SAVE_KEY, 4) ??
    migrateTaxiSave(storage, LEGACY_TAXI_SAVE_KEY, 3) ??
    migrateTaxiSave(storage, LEGACY_TAXI_V2_SAVE_KEY, 2) ??
    migrateCourierSave(storage);
  if (migrated) {
    saveProfile(migrated, storage);
    return migrated;
  }
  return null;
}

export function loadProfile(storage = globalThis.localStorage) {
  const raw = storage?.getItem(SAVE_KEY);
  if (raw) {
    try {
      return validateProfile(JSON.parse(raw));
    } catch (error) {
      const migrated = storage ? loadLegacyProfile(storage) : null;
      if (migrated) return migrated;
      if (error instanceof SyntaxError) throw new Error("Your taxi save is damaged. Restore a backup or keep the current file before starting fresh.");
      throw error;
    }
  }
  if (storage) {
    return loadLegacyProfile(storage) ?? newProfile();
  }
  return newProfile();
}

export function saveProfile(profile, storage = globalThis.localStorage) {
  const valid = validateProfile(profile);
  storage?.setItem(SAVE_KEY, JSON.stringify(valid));
}

export function exportSave(profile) {
  return JSON.stringify(validateProfile(profile), null, 2);
}

export function importSave(contents) {
  let parsed;
  try {
    parsed = JSON.parse(contents);
  } catch {
    throw new Error("That file is not valid JSON.");
  }
  return validateProfile(parsed);
}
