import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import solc from "solc";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const sourcePath = resolve(root, "contracts/MorrowlineTestnetShop.sol");
const source = await readFile(sourcePath, "utf8");
const output = JSON.parse(solc.compile(JSON.stringify({
  language: "Solidity",
  sources: { "MorrowlineTestnetShop.sol": { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: {
      "*": {
        "*": ["abi", "evm.bytecode.object", "evm.methodIdentifiers"]
      }
    }
  }
})));
const errors = (output.errors ?? []).filter((entry) => entry.severity === "error");
if (errors.length) throw new Error(errors.map((entry) => entry.formattedMessage).join("\n"));

const compiled = output.contracts?.["MorrowlineTestnetShop.sol"]?.MorrowlineTestnetShop;
if (!compiled?.evm.bytecode.object) throw new Error("Solidity compiler did not produce deployment bytecode.");
const artifactPath = resolve(root, "contracts/artifacts/MorrowlineTestnetShop.json");
await mkdir(dirname(artifactPath), { recursive: true });
await writeFile(artifactPath, `${JSON.stringify({
  contractName: "MorrowlineTestnetShop",
  compilerVersion: solc.version(),
  abi: compiled.abi,
  bytecode: `0x${compiled.evm.bytecode.object}`,
  methodIdentifiers: compiled.evm.methodIdentifiers
}, null, 2)}\n`);
console.log(`Compiled Sepolia testnet shop contract to ${artifactPath}`);
