export const SEPOLIA_CHAIN_ID = "0xaa36a7";
export const SEPOLIA_EXPLORER = "https://sepolia.etherscan.io";

export function walletStatus(provider) {
  if (!provider) return { state: "unavailable", address: null, chainId: null, message: "MetaMask is not detected. The game works without a wallet." };
  return { state: "disconnected", address: null, chainId: null, message: "Wallet disconnected. Connecting is optional." };
}

export function describeWallet(address, chainId) {
  if (!address) return walletStatus(globalThis.window?.ethereum);
  if (chainId !== SEPOLIA_CHAIN_ID) return { state: "wrong-network", address, chainId, message: "Connected on another network. Switch to Sepolia for testnet features." };
  return { state: "connected", address, chainId, message: "Connected to Sepolia. Blockchain features are optional and use test ETH." };
}

export async function connectWallet(provider) {
  if (!provider?.request) throw new Error("MetaMask was not found. Install it from its official site, or continue without a wallet.");
  const accounts = await provider.request({ method: "eth_requestAccounts" });
  if (!Array.isArray(accounts) || !accounts[0]) throw new Error("No wallet account was returned.");
  const chainId = await provider.request({ method: "eth_chainId" });
  return describeWallet(accounts[0], chainId);
}

export async function switchToSepolia(provider) {
  if (!provider?.request) throw new Error("MetaMask was not found. You can play every chapter without it.");
  await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: SEPOLIA_CHAIN_ID }] });
  const accounts = await provider.request({ method: "eth_accounts" });
  const chainId = await provider.request({ method: "eth_chainId" });
  return describeWallet(accounts?.[0] ?? null, chainId);
}

export function shortenAddress(address) {
  return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "Not connected";
}
