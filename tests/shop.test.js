import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import solc from "solc";
import { SEPOLIA_CHAIN_ID } from "../src/wallet.js";
import {
  estimateShopConsumption, estimateShopPurchase, formatEth, readShopInventory,
  sendShopTransaction, SHOP_ITEMS, SHOP_SELECTORS, verifySepoliaAccount
} from "../src/shop.js";

const source = await readFile(new URL("../contracts/MorrowlineTestnetShop.sol", import.meta.url), "utf8");
const compilation = JSON.parse(solc.compile(JSON.stringify({
  language: "Solidity",
  sources: { "MorrowlineTestnetShop.sol": { content: source } },
  settings: { optimizer: { enabled: true, runs: 200 }, outputSelection: { "*": { "*": ["abi", "evm.methodIdentifiers"] } } }
})));
const compilerErrors = (compilation.errors ?? []).filter(({ severity }) => severity === "error");
const contract = compilation.contracts?.["MorrowlineTestnetShop.sol"]?.MorrowlineTestnetShop;
const account = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const contractAddress = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function abiWord(value) {
  return BigInt(value).toString(16).padStart(64, "0");
}

test("Sepolia shop contract compiles with expected inventory and transaction selectors", () => {
  assert.deepEqual(compilerErrors, []);
  assert.ok(contract);
  const methods = contract.evm.methodIdentifiers;
  assert.equal(methods["balanceOf(address,uint8)"], SHOP_SELECTORS.balanceOf);
  assert.equal(methods["itemPrice(uint8)"], SHOP_SELECTORS.itemPrice);
  assert.equal(methods["purchase(uint8)"], SHOP_SELECTORS.purchase);
  assert.equal(methods["consume(uint8)"], SHOP_SELECTORS.consume);
});

test("shop inventory reads all four item quantities from Sepolia without sending transactions", async () => {
  const calls = [];
  const provider = {
    request: async ({ method, params }) => {
      calls.push({ method, params });
      assert.equal(method, "eth_call");
      const itemId = Number(BigInt(`0x${params[0].data.slice(-64)}`));
      return `0x${abiWord(itemId === 3 ? 2 : 0)}`;
    }
  };
  const inventory = await readShopInventory(provider, contractAddress, account);
  assert.equal(inventory.size, 4);
  assert.equal(inventory.get(3), 2);
  assert.equal(inventory.get(1), 0);
  assert.equal(calls.length, SHOP_ITEMS.length);
  await assert.rejects(readShopInventory(provider, "", account), /valid Sepolia shop/);
});

test("shop purchase estimates native test ETH and gas but never sends", async () => {
  const calls = [];
  const item = SHOP_ITEMS.find((candidate) => candidate.id === 1);
  const provider = {
    request: async ({ method, params }) => {
      calls.push({ method, params });
      if (method === "eth_call") return `0x${abiWord(item.priceWei)}`;
      if (method === "eth_estimateGas") {
        assert.equal(BigInt(params[0].value), item.priceWei);
        return "0x186a0";
      }
      if (method === "eth_gasPrice") return "0x3b9aca00";
      throw new Error(`Unexpected provider method: ${method}`);
    }
  };
  const estimate = await estimateShopPurchase(provider, contractAddress, account, 1);
  assert.equal(estimate.priceWei, item.priceWei);
  assert.equal(estimate.gasLimit, 120_000n);
  assert.equal(estimate.maxFeeWei, 120_000_000_000_000n);
  assert.equal(estimate.transaction.from, account);
  assert.equal(estimate.transaction.to, contractAddress);
  assert.equal(calls.some(({ method }) => method === "eth_sendTransaction"), false);
  assert.equal(formatEth(item.priceWei), "0.00015");
});

test("consumable transaction estimates require a consumable item", async () => {
  const provider = {
    request: async ({ method }) => {
      if (method === "eth_estimateGas") return "0x186a0";
      if (method === "eth_gasPrice") return "0x3b9aca00";
      throw new Error(`Unexpected provider method: ${method}`);
    }
  };
  const estimate = await estimateShopConsumption(provider, contractAddress, account, 3);
  assert.equal(estimate.item.name, "Fuel boost");
  await assert.rejects(estimateShopConsumption(provider, contractAddress, account, 1), /consumable/);
});

test("shop sends wait for a successful Sepolia receipt", async () => {
  const calls = [];
  const hash = `0x${"a".repeat(64)}`;
  const provider = {
    request: async ({ method }) => {
      calls.push(method);
      if (method === "eth_sendTransaction") return hash;
      if (method === "eth_getTransactionReceipt") return { status: "0x1" };
      throw new Error(`Unexpected provider method: ${method}`);
    }
  };
  const submitted = [];
  const result = await sendShopTransaction(provider, { to: contractAddress }, (value) => submitted.push(value));
  assert.equal(result.hash, hash);
  assert.deepEqual(submitted, [hash]);
  assert.deepEqual(calls, ["eth_sendTransaction", "eth_getTransactionReceipt"]);
  await assert.rejects(sendShopTransaction({ request: async () => "0x1234" }, {}), /invalid Sepolia transaction hash/);
});

test("shop transactions verify the active account and Sepolia network", async () => {
  const provider = {
    request: async ({ method }) => method === "eth_accounts" ? [account] : SEPOLIA_CHAIN_ID
  };
  await verifySepoliaAccount(provider, account);
  await assert.rejects(verifySepoliaAccount(provider, "0xcccccccccccccccccccccccccccccccccccccccc"), /account or network changed/);
});
