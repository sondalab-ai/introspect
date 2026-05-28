import { describe, it, expect } from "vitest";
import { redactSecrets } from "../secrets.js";

describe("redactSecrets", () => {
  it("redacts string values for keys that look secret", () => {
    const input = {
      apiKey: "abc123",
      token: "xyz",
      password: "pw",
      auth_secret: "s",
      nested: { authToken: "t", harmless: "ok" },
      array: [{ secretValue: "shh" }],
    };
    const { value, redactedKeys } = redactSecrets(input);
    expect(value).toEqual({
      apiKey: "[REDACTED]",
      token: "[REDACTED]",
      password: "[REDACTED]",
      auth_secret: "[REDACTED]",
      nested: { authToken: "[REDACTED]", harmless: "ok" },
      array: [{ secretValue: "[REDACTED]" }],
    });
    expect(redactedKeys.sort()).toEqual(
      ["apiKey", "array[0].secretValue", "auth_secret", "nested.authToken", "password", "token"].sort()
    );
  });

  it("leaves non-string secret-key values alone but records the key", () => {
    const { value, redactedKeys } = redactSecrets({ token: 0, ok: 1 });
    expect(value).toEqual({ token: "[REDACTED]", ok: 1 });
    expect(redactedKeys).toEqual(["token"]);
  });

  it("returns an empty redactedKeys list when nothing matches", () => {
    const { value, redactedKeys } = redactSecrets({ a: 1, b: { c: "ok" } });
    expect(value).toEqual({ a: 1, b: { c: "ok" } });
    expect(redactedKeys).toEqual([]);
  });
});
