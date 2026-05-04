import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";

describe("upstream sync automation", () => {
  test("documents the fork remotes and command", () => {
    const doc = readFileSync("docs/UPSTREAM_SYNC.md", "utf8");

    expect(doc).toContain("https://github.com/g4mm4p4nd4/gstack.git");
    expect(doc).toContain("https://github.com/garrytan/gstack.git");
    expect(doc).toContain("bun run upstream:sync");
    expect(doc).toContain("Portfolio OS");
  });

  test("script uses merge-based sync without rebasing", () => {
    const script = readFileSync("scripts/sync-upstream.sh", "utf8");

    expect(script).toContain("git merge --no-ff --no-commit");
    expect(script).toContain("Refusing to start upstream sync with dirty tracked files");
    expect(script).not.toContain("git rebase");
    expect(script).not.toContain("reset --hard");
  });

  test("package exposes local and upstream automation entrypoints", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));

    expect(pkg.scripts["upstream:sync"]).toBe("bash scripts/sync-upstream.sh");
    expect(pkg.scripts["pos:qa-plan"]).toBe("bun run scripts/pos-artifact.ts qa-plan");
    expect(pkg.scripts["pos:evidence-plan"]).toBe("bun run scripts/pos-artifact.ts evidence-plan");
  });
});
