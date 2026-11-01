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

test("authenticated profile lookup uses verified Auth identity and D1 role", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://auth.example/auth/v1/user");
    assert.equal(options.headers.Authorization, "Bearer valid-test-token");
    assert.equal(options.headers.apikey, "test-publishable-key");
    return Response.json({ id: "synthetic-user-id", email: "staging@example.test" });
  };
  const profileEnv = {
    SUPABASE_URL: "https://auth.example/",
    SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
    DB: {
      prepare(sql) {
        assert.match(sql, /FROM profiles WHERE id = \?/);
        return {
          bind(id) {
            assert.equal(id, "synthetic-user-id");
            return { first: async () => ({ id, full_name: "Staging User", phone: null, role: "technician" }) };
          },
        };
      },
    },
  };
  try {
    const response = await worker.fetch(
      new Request("https://staging.example/v1/me", { headers: { Authorization: "Bearer valid-test-token" } }),
      profileEnv,
    );
    assert.equal(response.status, 200);
    assert.equal((await response.json()).profile.role, "technician");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("invalid D1 roles fail closed", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ id: "synthetic-user-id" });
  const profileEnv = {
    SUPABASE_URL: "https://auth.example",
    SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
    DB: {
      prepare() {
        return { bind() { return { first: async () => ({ id: "synthetic-user-id", role: "super_admin" }) }; } };
      },
    },
  };
  try {
    const response = await worker.fetch(
      new Request("https://staging.example/v1/me", { headers: { Authorization: "Bearer valid-test-token" } }),
      profileEnv,
    );
    assert.equal(response.status, 403);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
