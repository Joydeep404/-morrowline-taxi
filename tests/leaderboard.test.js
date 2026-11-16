import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import solc from "solc";
import { DISTRICTS } from "../src/districts.js";
import { newProfile } from "../src/game.js";
import {
  encodeProgressSubmission, estimateProgressSubmission, getProgressSubmission,
  LEADERBOARD_SELECTORS, readLeaderboard
} from "../src/leaderboard.js";

const source = await readFile(new URL("../contracts/MorrowlineLeaderboard.sol", import.meta.url), "utf8");
const compilation = JSON.parse(solc.compile(JSON.stringify({
  language: "Solidity",
  sources: { "MorrowlineLeaderboard.sol": { content: source } },
  settings: { optimizer: { enabled: true, runs: 200 }, outputSelection: { "*": { "*": ["abi", "evm.methodIdentifiers"] } } }
})));
const compilerErrors = (compilation.errors ?? []).filter(({ severity }) => severity === "error");
const contract = compilation.contracts?.["MorrowlineLeaderboard.sol"]?.MorrowlineLeaderboard;

function abiWord(value) {
  return BigInt(value).toString(16).padStart(64, "0");
}

function abiAddress(value) {
  return value.toLowerCase().replace(/^0x/, "").padStart(64, "0");
}

test("Sepolia leaderboard contract compiles with expected public interface", () => {
  assert.deepEqual(compilerErrors, []);
  assert.ok(contract);
  assert.equal(contract.evm.methodIdentifiers["submitProgress(uint8,uint32)"], LEADERBOARD_SELECTORS.submitProgress);
  assert.equal(contract.evm.methodIdentifiers["leaderCount()"], LEADERBOARD_SELECTORS.leaderCount);
  assert.equal(contract.evm.methodIdentifiers["leaderAt(uint256)"], LEADERBOARD_SELECTORS.leaderAt);
});

test("leaderboard calldata reports the highest unlocked stage and ride total", () => {
  const profile = newProfile();
  profile.rides = 7;
  profile.stageProgress[DISTRICTS[0].id] = {
    fares: DISTRICTS[0].objective.fares,
    onTimeFares: DISTRICTS[0].objective.onTimeFares,
    coins: DISTRICTS[0].objective.coins
  };
  profile.districtsUnlocked.push(DISTRICTS[1].id);
  assert.deepEqual(getProgressSubmission(profile), { highestStage: 2, totalRides: 7 });
  assert.equal(
    encodeProgressSubmission(profile),
    `0x${LEADERBOARD_SELECTORS.submitProgress}${abiWord(2)}${abiWord(7)}`
  );
});

test("leaderboard reads decode public top-ten entries", async () => {
  const calls = [];
  const addresses = ["0x1111111111111111111111111111111111111111", "0x2222222222222222222222222222222222222222"];
  const provider = {
    request: async ({ method, params }) => {
      assert.equal(method, "eth_call");
      const data = params[0].data;
      calls.push(data);
      if (data === `0x${LEADERBOARD_SELECTORS.leaderCount}`) return `0x${abiWord(2)}`;
      const index = Number(BigInt(`0x${data.slice(10)}`));
      return `0x${abiAddress(addresses[index])}${abiWord(4 - index)}${abiWord(12 + index)}${abiWord(1_800_000_000 + index)}`;
    }
  };
  const entries = await readLeaderboard(provider, "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  assert.equal(entries.length, 2);
  assert.equal(entries[0].address, addresses[0]);
  assert.equal(entries[0].highestStage, 4);
  assert.equal(entries[1].totalRides, 13);
  assert.equal(calls.length, 3);
  await assert.rejects(readLeaderboard(provider, ""), /valid Sepolia leaderboard/);
});

test("progress fee estimation prepares but never sends a transaction", async () => {
  const calls = [];
  const provider = {
    request: async ({ method, params }) => {
      calls.push({ method, params });
      if (method === "eth_estimateGas") return "0x186a0";
      if (method === "eth_gasPrice") return "0x3b9aca00";
      throw new Error(`Unexpected provider method: ${method}`);
    }
  };
  const account = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const contractAddress = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const estimate = await estimateProgressSubmission(provider, contractAddress, account, { ...newProfile(), rides: 1 });
  assert.equal(estimate.gasLimit, 120_000n);
  assert.equal(estimate.gasPrice, 1_000_000_000n);
  assert.equal(estimate.maxFeeWei, 120_000_000_000_000n);
  assert.equal(estimate.transaction.from, account);
  assert.equal(estimate.transaction.to, contractAddress);
  assert.equal(calls.some(({ method }) => method === "eth_sendTransaction"), false);
});
