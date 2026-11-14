import { DISTRICTS } from "./districts.js";
import { availableDistricts } from "./game.js";

export const LEADERBOARD_SELECTORS = Object.freeze({
  leaderAt: "064a40ee",
  leaderCount: "9c440b1e",
  submitProgress: "f027ef3d"
});

const UINT32_MAX = 0xffff_ffff;

function word(value) {
  return BigInt(value).toString(16).padStart(64, "0");
}

function decodeWord(data, index) {
  const start = 2 + index * 64;
  const value = data.slice(start, start + 64);
  if (value.length !== 64) throw new Error("The Sepolia contract returned malformed leaderboard data.");
  return BigInt(`0x${value}`);
}

async function call(provider, contractAddress, data) {
  const result = await provider.request({
    method: "eth_call",
    params: [{ to: contractAddress, data }, "latest"]
  });
  if (typeof result !== "string" || !/^0x[0-9a-f]*$/i.test(result)) {
    throw new Error("The Sepolia provider returned an invalid contract response.");
  }
  return result;
}

export function getProgressSubmission(profile) {
  const highestStage = Math.min(DISTRICTS.length, availableDistricts(profile).length);
  if (!Number.isSafeInteger(profile.rides) || profile.rides < 0 || profile.rides > UINT32_MAX) {
    throw new Error("Ride count is outside the leaderboard contract's supported range.");
  }
  return { highestStage, totalRides: profile.rides };
}

export function encodeProgressSubmission(profile) {
  const progress = getProgressSubmission(profile);
  return `0x${LEADERBOARD_SELECTORS.submitProgress}${word(progress.highestStage)}${word(progress.totalRides)}`;
}

export async function readLeaderboard(provider, contractAddress) {
  if (!/^0x[0-9a-f]{40}$/i.test(contractAddress)) throw new Error("No valid Sepolia leaderboard contract address is configured.");
  const countData = await call(provider, contractAddress, `0x${LEADERBOARD_SELECTORS.leaderCount}`);
  const count = Number(decodeWord(countData, 0));
  if (!Number.isSafeInteger(count) || count > 10) throw new Error("The leaderboard contract returned an invalid entry count.");
  const entries = [];
  for (let index = 0; index < count; index += 1) {
    const data = await call(provider, contractAddress, `0x${LEADERBOARD_SELECTORS.leaderAt}${word(index)}`);
    if (data.length < 2 + 4 * 64) throw new Error("The Sepolia contract returned malformed leaderboard data.");
    entries.push({
      address: `0x${data.slice(2, 66).slice(24)}`,
      highestStage: Number(decodeWord(data, 1)),
      totalRides: Number(decodeWord(data, 2)),
      updatedAt: Number(decodeWord(data, 3))
    });
  }
  return entries;
}

export async function estimateProgressSubmission(provider, contractAddress, account, profile) {
  if (!/^0x[0-9a-f]{40}$/i.test(contractAddress)) throw new Error("No valid Sepolia leaderboard contract address is configured.");
  if (!/^0x[0-9a-f]{40}$/i.test(account)) throw new Error("Connect a valid wallet account before publishing progress.");
  const data = encodeProgressSubmission(profile);
  const [estimate, gasPrice] = await Promise.all([
    provider.request({ method: "eth_estimateGas", params: [{ from: account, to: contractAddress, data }] }),
    provider.request({ method: "eth_gasPrice" })
  ]);
  const gas = BigInt(estimate) * 120n / 100n;
  const price = BigInt(gasPrice);
  return {
    transaction: { from: account, to: contractAddress, data, gas: `0x${gas.toString(16)}`, gasPrice: `0x${price.toString(16)}` },
    highestStage: getProgressSubmission(profile).highestStage,
    totalRides: profile.rides,
    gasLimit: gas,
    gasPrice: price,
    maxFeeWei: gas * price
  };
}

export async function sendProgressSubmission(provider, transaction, onSubmitted = () => {}) {
  const hash = await provider.request({ method: "eth_sendTransaction", params: [transaction] });
  onSubmitted(hash);
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const receipt = await provider.request({ method: "eth_getTransactionReceipt", params: [hash] });
    if (receipt) {
      if (receipt.status !== "0x1") throw new Error(`The Sepolia transaction failed: ${hash}`);
      return { hash, receipt };
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error(`Transaction confirmation timed out. Check Sepolia Etherscan for ${hash}.`);
}
