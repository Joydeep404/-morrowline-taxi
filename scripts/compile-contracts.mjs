import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import solc from "solc";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const sourcePath = resolve(root, "contracts/MorrowlineLeaderboard.sol");
const source = await readFile(sourcePath, "utf8");
const input = {
  language: "Solidity",
  sources: { "MorrowlineLeaderboard.sol": { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: {
      "*": {
        "*": ["abi", "evm.bytecode.object", "evm.methodIdentifiers"]
      }
    }
  }
};
const output = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = (output.errors ?? []).filter((entry) => entry.severity === "error");
if (errors.length) throw new Error(errors.map((entry) => entry.formattedMessage).join("\n"));

const compiled = output.contracts?.["MorrowlineLeaderboard.sol"]?.MorrowlineLeaderboard;
if (!compiled?.evm.bytecode.object) throw new Error("Solidity compiler did not produce deployment bytecode.");
const artifactPath = resolve(root, "contracts/artifacts/MorrowlineLeaderboard.json");
await mkdir(dirname(artifactPath), { recursive: true });
await writeFile(artifactPath, `${JSON.stringify({
  contractName: "MorrowlineLeaderboard",
  compilerVersion: solc.version(),
  abi: compiled.abi,
  bytecode: `0x${compiled.evm.bytecode.object}`,
  methodIdentifiers: compiled.evm.methodIdentifiers
}, null, 2)}\n`);
console.log(`Compiled Sepolia leaderboard contract to ${artifactPath}`);
