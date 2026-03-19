import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Solidity compiler wrapper
// ---------------------------------------------------------------------------

export interface CompileResult {
  contractName: string;
  abi: unknown[];
  bytecode: string;
}

/**
 * Compile a single Solidity file using solc and return ABI + bytecode.
 * Optionally writes artifacts to `outDir`.
 */
export function compileSol(
  solPath: string,
  outDir?: string,
): CompileResult {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const solc = require("solc");

  const absolutePath = path.resolve(solPath);
  const source = fs.readFileSync(absolutePath, "utf8");
  const fileName = path.basename(absolutePath);

  const input = {
    language: "Solidity",
    sources: {
      [fileName]: { content: source },
    },
    settings: {
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode.object"],
        },
      },
    },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));

  // Check for errors (warnings are OK)
  const errors: { severity: string; formattedMessage: string }[] =
    output.errors?.filter((e: { severity: string }) => e.severity === "error") ?? [];
  if (errors.length > 0) {
    const msgs = errors.map((e) => e.formattedMessage).join("\n");
    throw new Error(`Solidity compilation failed:\n${msgs}`);
  }

  const contracts = output.contracts[fileName];
  const contractName = Object.keys(contracts)[0];
  const compiled = contracts[contractName];
  const abi: unknown[] = compiled.abi;
  const bytecode: string = "0x" + compiled.evm.bytecode.object;

  // Optionally write artifacts
  if (outDir) {
    fs.mkdirSync(outDir, { recursive: true });
    const artifact = { contractName, abi, bytecode };
    fs.writeFileSync(
      path.join(outDir, `${contractName}.json`),
      JSON.stringify(artifact, null, 2),
    );
  }

  return { contractName, abi, bytecode };
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

if (require.main === module) {
  const contractsDir = path.resolve(__dirname, "..", "contracts");
  const outDir = path.resolve(__dirname, "..", "artifacts");

  const solFiles = fs
    .readdirSync(contractsDir)
    .filter((f) => f.endsWith(".sol"));

  if (solFiles.length === 0) {
    console.log("No .sol files found in contracts/");
    process.exit(0);
  }

  for (const file of solFiles) {
    const result = compileSol(path.join(contractsDir, file), outDir);
    console.log(
      `Compiled ${result.contractName} → artifacts/${result.contractName}.json`,
    );
  }
}
