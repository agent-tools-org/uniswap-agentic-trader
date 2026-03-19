import { describe, it, expect, beforeAll } from "vitest";
import * as path from "path";
import * as fs from "fs";
import { compileSol, type CompileResult } from "../src/compile";

const SOL_PATH = path.resolve(__dirname, "..", "contracts", "TradeExecutionLog.sol");

describe("compile", () => {
  let result: CompileResult;

  beforeAll(() => {
    result = compileSol(SOL_PATH);
  });

  it("returns the correct contract name", () => {
    expect(result.contractName).toBe("TradeExecutionLog");
  });

  it("produces a non-empty ABI array", () => {
    expect(Array.isArray(result.abi)).toBe(true);
    expect(result.abi.length).toBeGreaterThan(0);
  });

  it("produces bytecode starting with 0x", () => {
    expect(result.bytecode).toMatch(/^0x[0-9a-fA-F]+$/);
    expect(result.bytecode.length).toBeGreaterThan(10);
  });

  it("ABI contains the logTrade function", () => {
    const logTrade = result.abi.find(
      (entry: any) => entry.type === "function" && entry.name === "logTrade",
    );
    expect(logTrade).toBeDefined();
  });

  it("ABI contains the TradeExecuted event", () => {
    const event = result.abi.find(
      (entry: any) => entry.type === "event" && entry.name === "TradeExecuted",
    );
    expect(event).toBeDefined();
  });

  it("ABI contains getTradeCount, getTrade, getTradesByAgent", () => {
    const names = (result.abi as any[])
      .filter((e) => e.type === "function")
      .map((e) => e.name);
    expect(names).toContain("getTradeCount");
    expect(names).toContain("getTrade");
    expect(names).toContain("getTradesByAgent");
  });

  it("writes artifacts to disk when outDir is specified", () => {
    const tmpDir = path.resolve(__dirname, "..", "artifacts", "_test_out");
    try {
      compileSol(SOL_PATH, tmpDir);
      const artifactPath = path.join(tmpDir, "TradeExecutionLog.json");
      expect(fs.existsSync(artifactPath)).toBe(true);
      const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
      expect(artifact.contractName).toBe("TradeExecutionLog");
      expect(artifact.abi).toBeDefined();
      expect(artifact.bytecode).toBeDefined();
    } finally {
      // Clean up
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("throws on invalid Solidity source", () => {
    const badPath = path.resolve(__dirname, "..", "artifacts", "_bad.sol");
    fs.mkdirSync(path.dirname(badPath), { recursive: true });
    fs.writeFileSync(badPath, "this is not valid solidity code !@#$");
    try {
      expect(() => compileSol(badPath)).toThrow("Solidity compilation failed");
    } finally {
      fs.unlinkSync(badPath);
    }
  });
});
