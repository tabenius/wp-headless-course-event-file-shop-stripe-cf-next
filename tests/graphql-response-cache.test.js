import test from "node:test";
import assert from "node:assert/strict";
import {
  buildGraphqlResponseCacheKey,
  getGraphqlResponseCacheConfig,
  readGraphqlResponseCache,
  resetGraphqlResponseCacheForTests,
  writeGraphqlResponseCache,
} from "../src/lib/graphqlResponseCache.js";

test("buildGraphqlResponseCacheKey is stable for equivalent payloads", async () => {
  const left = await buildGraphqlResponseCacheKey({
    endpoint: "https://wp.example/graphql",
    query: "query Home { generalSettings { title } }",
    variables: { uri: "/" },
    cacheEpoch: 2,
  });
  const right = await buildGraphqlResponseCacheKey({
    endpoint: "https://wp.example/graphql",
    query: "query Home { generalSettings { title } }",
    variables: { uri: "/" },
    cacheEpoch: 2,
  });

  assert.equal(left, right);
  assert.ok(left.startsWith("graphql:response:v1:"));
});

test("GraphQL response cache keeps fresh and stale local entries", async () => {
  resetGraphqlResponseCacheForTests();
  const key = await buildGraphqlResponseCacheKey({
    endpoint: "https://wp.example/graphql",
    query: "query Products { products { nodes { name } } }",
    variables: {},
    cacheEpoch: 0,
  });

  const wrote = await writeGraphqlResponseCache(
    key,
    { products: { nodes: [{ name: "Slow is smooth" }] } },
    { operationName: "Products" },
  );
  assert.equal(wrote, true);

  const fresh = await readGraphqlResponseCache(key);
  assert.deepEqual(fresh.data.products.nodes, [{ name: "Slow is smooth" }]);
  assert.equal(fresh.stale, false);
});

test("GraphQL response cache config exposes conservative defaults", () => {
  const config = getGraphqlResponseCacheConfig();
  assert.equal(config.enabled, true);
  assert.equal(config.bindingName, "COURSE_ACCESS");
  assert.equal(config.freshTtlSeconds, 300);
  assert.equal(config.staleTtlSeconds, 3600);
  assert.equal(config.maxBytes, 512000);
});
