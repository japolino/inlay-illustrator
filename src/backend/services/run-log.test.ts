import { describe, expect, test } from "bun:test";
import { brandLogMessage, createRunLog, redactSensitive, truncateLog, safeDetails } from "./run-log.js";

describe("run log branding", () => {
  test("replaces the ported cores' Asset Maid prefixes with Inlay", () => {
    expect(brandLogMessage("[Asset Maid React] Charx regex analysis failed: x")).toBe("[Inlay] Charx regex analysis failed: x");
    expect(brandLogMessage("[Asset Maid] first outfit failed")).toBe("[Inlay] first outfit failed");
    expect(brandLogMessage("Analyzer request sent")).toBe("Analyzer request sent");
  });

  test("stores and mirrors the branded message", () => {
    const mirrored: string[] = [];
    const log = createRunLog({ host: { log: { info() {}, warn: (m: string) => mirrored.push(m), error: (m: string) => mirrored.push(m) } } as never });
    const entry = log.append("warn", "analysis", "[Asset Maid React] retry");
    expect(entry.message).toBe("[Inlay] retry");
    expect(mirrored).toEqual(["[Inlay:analysis] [Inlay] retry"]);
  });

  test("the mirrored line carries the error reason from the details", () => {
    const mirrored: string[] = [];
    const log = createRunLog({ host: { log: { info() {}, warn: (m: string) => mirrored.push(m), error: (m: string) => mirrored.push(m) } } as never });
    log.append("warn", "pipeline", "Illustration message failed: k@0", { jobId: "j", error: { code: "provider-error", message: "NovelAI 429" } });
    log.append("error", "pipeline", "Plan failed", new Error("boom"));
    log.append("error", "pipeline", "Saving failed: boom", { message: "boom" });
    expect(mirrored).toEqual(["[Inlay:pipeline] Illustration message failed: k@0 (provider-error: NovelAI 429)", "[Inlay:pipeline] Plan failed (boom)", "[Inlay:pipeline] Saving failed: boom"]);
  });
});

describe("run log error redaction and truncation", () => {
  test("redacts sensitive query parameters", () => {
    expect(redactSensitive("GET /v1/models?key=secret123&other=val")).toBe("GET /v1/models?key=[redacted]&other=val");
    expect(redactSensitive("https://api.com?api_key=sk-999&access_token=tok&token=abc&secret=xyz")).toBe(
      "https://api.com?api_key=[redacted]&access_token=[redacted]&token=[redacted]&secret=[redacted]",
    );
  });

  test("redacts sensitive HTTP headers and tokens", () => {
    expect(redactSensitive("authorization: Bearer my-secret-token")).toBe("authorization: Bearer [redacted]");
    expect(redactSensitive("authorization: Basic dXNlcjpwYXNz")).toBe("authorization: Basic [redacted]");
    expect(redactSensitive("api-key: custom-api-key-123")).toBe("api-key: [redacted]");
    expect(redactSensitive("api_key: custom-api-key-456")).toBe("api_key: [redacted]");
    expect(redactSensitive('{"secret": "hidden_secret", "token": "tok123"}')).toBe(
      '{"secret": [redacted], "token": [redacted]}',
    );
  });

  test("truncates long logs with ...(세부 로그 생략)", () => {
    const longText = "a".repeat(5000);
    const truncated = truncateLog(longText, 100);
    expect(truncated).toBe("a".repeat(100) + "...(세부 로그 생략)");
  });

  test("safeDetails redacts and truncates Error instances and objects", () => {
    const err = new Error("Failed at https://api.com?key=supersecret with authorization: Bearer tok123");
    const safe = safeDetails(err) as { name: string; message: string };
    expect(safe.message).toBe("Failed at https://api.com?key=[redacted] with authorization: Bearer [redacted]");

    const obj = { url: "https://api.com?token=secrettoken", big: "x".repeat(4500) };
    const safeObj = safeDetails(obj) as { url: string; big: string };
    expect(safeObj.url).toBe("https://api.com?token=[redacted]");
    expect(safeObj.big.endsWith("...(세부 로그 생략)")).toBe(true);
  });
});
