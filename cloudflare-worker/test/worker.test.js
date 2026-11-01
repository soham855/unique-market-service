import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";

const env = {
  DB: {
    prepare(sql) {
      assert.equal(sql, "SELECT 1 AS ok");
      return { first: async () => ({ ok: 1 }) };
    },
  },
};

test("health endpoint confirms D1 binding without exposing data", async () => {
  const response = await worker.fetch(new Request("https://staging.example/health"), env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    service: "unique-market-d1-staging-worker",
    database: "connected",
  });
});

test("unknown origins are rejected", async () => {
  const request = new Request("https://staging.example/health", {
    headers: { Origin: "https://untrusted.example" },
  });
  const response = await worker.fetch(request, env);
  assert.equal(response.status, 403);
});

test("profile endpoint rejects missing bearer token", async () => {
  const response = await worker.fetch(
    new Request("https://staging.example/v1/me"),
    { ...env, SUPABASE_URL: "https://auth.example", SUPABASE_PUBLISHABLE_KEY: "test-key" },
  );
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Sign in required" });
});

test("non-GET requests are rejected", async () => {
  const response = await worker.fetch(
    new Request("https://staging.example/health", { method: "POST" }),
    env,
  );
  assert.equal(response.status, 405);
});

test("CORS preflight returns an empty 204 response", async () => {
  const response = await worker.fetch(
    new Request("https://staging.example/health", {
      method: "OPTIONS",
      headers: { Origin: "https://salesuniquemarket.com" },
    }),
    env,
  );
  assert.equal(response.status, 204);
  assert.equal(await response.text(), "");
  assert.equal(response.headers.get("access-control-allow-origin"), "https://salesuniquemarket.com");
});
