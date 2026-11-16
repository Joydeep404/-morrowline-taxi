import { SEPOLIA_CHAIN_ID } from "./wallet.js";

export const SHOP_ITEMS = Object.freeze([
  { id: 1, name: "Sunset paint", description: "Warm amber-gold finish for the Morrowline S4.", kind: "paint", priceWei: 150_000_000_000_000n },
  { id: 2, name: "Tidal paint", description: "Deep teal finish for the Morrowline S4.", kind: "paint", priceWei: 150_000_000_000_000n },
  { id: 3, name: "Fuel boost", description: "Adds up to 25 L to the current tank.", kind: "fuel", priceWei: 50_000_000_000_000n },
  { id: 4, name: "Repair kit", description: "Repairs up to 35% vehicle damage.", kind: "repair", priceWei: 50_000_000_000_000n }
]);

export const SHOP_SELECTORS = Object.freeze({
  balanceOf: "67412045",
  consume: "7b699adb",
  itemPrice: "64546a3e",
  purchase: "3298df76"
});

function word(value) {
  return BigInt(value).toString(16).padStart(64, "0");
}

function decodeWord(data) {
  if (typeof data !== "string" || !/^0x[0-9a-f]{64}$/i.test(data)) {
    throw new Error("The Sepolia shop returned malformed inventory data.");
  }
  return BigInt(data);
}

async function estimate(provider, transaction) {
  const [gasEstimate, gasPrice] = await Promise.all([
    provider.request({ method: "eth_estimateGas", params: [transaction] }),
    provider.request({ method: "eth_gasPrice" })
  ]);
  const gasLimit = BigInt(gasEstimate) * 120n / 100n;
  const price = BigInt(gasPrice);
  return {
    transaction: { ...transaction, gas: `0x${gasLimit.toString(16)}`, gasPrice: `0x${price.toString(16)}` },
    gasLimit,
    gasPrice: price,
    maxFeeWei: gasLimit * price
  };
}

export async function readShopInventory(provider, contractAddress, account) {
  if (!/^0x[0-9a-f]{40}$/i.test(contractAddress)) throw new Error("No valid Sepolia shop contract address is configured.");
  if (!/^0x[0-9a-f]{40}$/i.test(account)) throw new Error("Connect a valid Sepolia wallet account to read shop inventory.");
  const entries = await Promise.all(SHOP_ITEMS.map(async (item) => {
    const data = `0x${SHOP_SELECTORS.balanceOf}${account.slice(2).toLowerCase().padStart(64, "0")}${word(item.id)}`;
    const result = await provider.request({ method: "eth_call", params: [{ to: contractAddress, data }, "latest"] });
    const balance = decodeWord(result);
    if (balance > 0xffff_ffffn) throw new Error("The Sepolia shop returned an invalid item quantity.");
    return [item.id, Number(balance)];
  }));
  return new Map(entries);
}

export async function estimateShopPurchase(provider, contractAddress, account, itemId) {
  const item = SHOP_ITEMS.find((candidate) => candidate.id === itemId);
  if (!item) throw new Error("Select an available Sepolia shop item.");
  if (!/^0x[0-9a-f]{40}$/i.test(contractAddress) || !/^0x[0-9a-f]{40}$/i.test(account)) {
    throw new Error("Connect a wallet and configure a deployed Sepolia shop before purchasing.");
  }
  const priceData = await provider.request({
    method: "eth_call",
    params: [{ to: contractAddress, data: `0x${SHOP_SELECTORS.itemPrice}${word(item.id)}` }, "latest"]
  });
  const priceWei = decodeWord(priceData);
  if (priceWei !== item.priceWei) throw new Error("Shop price does not match the game catalog. Refresh before purchasing.");
  const data = `0x${SHOP_SELECTORS.purchase}${word(item.id)}`;
  const estimateResult = await estimate(provider, {
    from: account,
    to: contractAddress,
    data,
    value: `0x${priceWei.toString(16)}`
  });
  return { ...estimateResult, item, priceWei };
}

export async function estimateShopConsumption(provider, contractAddress, account, itemId) {
  if (!SHOP_ITEMS.some((item) => item.id === itemId && item.kind !== "paint")) {
    throw new Error("Select an available consumable item.");
  }
  if (!/^0x[0-9a-f]{40}$/i.test(contractAddress) || !/^0x[0-9a-f]{40}$/i.test(account)) {
    throw new Error("Connect a wallet and configure a deployed Sepolia shop before using items.");
  }
  const data = `0x${SHOP_SELECTORS.consume}${word(itemId)}`;
  const estimateResult = await estimate(provider, { from: account, to: contractAddress, data });
  return { ...estimateResult, item: SHOP_ITEMS.find((item) => item.id === itemId) };
}

export async function sendShopTransaction(provider, transaction, onSubmitted = () => {}) {
  const hash = await provider.request({ method: "eth_sendTransaction", params: [transaction] });
  if (typeof hash !== "string" || !/^0x[0-9a-f]{64}$/i.test(hash)) {
    throw new Error("MetaMask returned an invalid Sepolia transaction hash.");
  }
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

export function formatEth(wei) {
  const whole = wei / 10n ** 18n;
  const fraction = (wei % 10n ** 18n).toString().padStart(18, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}

export function verifySepoliaAccount(provider, address) {
  return Promise.all([
    provider.request({ method: "eth_accounts" }),
    provider.request({ method: "eth_chainId" })
  ]).then(([accounts, chainId]) => {
    if (!Array.isArray(accounts) || accounts[0]?.toLowerCase() !== address.toLowerCase() || chainId !== SEPOLIA_CHAIN_ID) {
      throw new Error("The active account or network changed. Reconnect and prepare the transaction again.");
    }
  });
}
