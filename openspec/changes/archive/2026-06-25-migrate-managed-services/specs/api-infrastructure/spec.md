# Delta for api-infrastructure

## ADDED Requirements

### Requirement: REQ-API-UPSTASH-1 — Rate limiter degrades gracefully when Upstash env vars are unset

The `rateLimitedPublicProcedure` middleware (or equivalent rate-limit wrapper used by tRPC procedures) MUST degrade to a no-op when `UPSTASH_REDIS_REST_URL` or `UPSTASH_REDIS_REST_TOKEN` is unset. This matches the existing graceful-degrade behavior of the `ioredis` client (see `src/infrastructure/redis/rate-limiter.ts` line 17: "if (!redis) return; // Redis unavailable — skip rate limiting").

The graceful-degrade contract:
- If Upstash env vars are unset, the rate limit check returns `{ allowed: true }` without making any Upstash API call.
- If Upstash env vars are set but the API call fails (network error, 5xx response), the rate limit check MUST log the error and return `{ allowed: true }` (fail-open). Blocking requests on a transient Upstash outage is worse than briefly allowing un-rate-limited traffic.

#### Scenario: Rate limiter no-ops when Upstash unset

- GIVEN `UPSTASH_REDIS_REST_URL` is unset
- WHEN a rate-limited tRPC procedure is invoked
- THEN `rateLimit(...)` MUST return `{ allowed: true }` without an Upstash API call
- AND the procedure MUST proceed as if the rate limit passed

#### Scenario: Rate limiter fails open on Upstash API error

- GIVEN `UPSTASH_REDIS_REST_URL` is set but the API call returns a 500
- WHEN `rateLimit(...)` is called
- THEN it MUST log the error to the server console
- AND it MUST return `{ allowed: true }` (fail-open)
- AND it MUST NOT throw

#### Scenario: Rate limiter applies when Upstash is reachable

- GIVEN `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set and reachable
- WHEN 31 requests are made within a 10-second window from the same IP
- THEN the 31st request MUST be rate-limited (returns `{ allowed: false }`)
- AND the first 30 requests MUST be allowed

### Requirement: REQ-API-UPSTASH-2 — Cache degrades gracefully when Upstash env vars are unset

The `cacheGetOrSet` and `cacheInvalidate` functions in `src/infrastructure/redis/cache.ts` MUST degrade gracefully when Upstash env vars are unset:
- `cacheGetOrSet(key, fetcher)` MUST return `fetcher()` directly (no cache hit check, no cache write).
- `cacheInvalidate(...)` MUST be a no-op (no Upstash API call).

This preserves the existing `ioredis` graceful-degrade contract (line 13 of `cache.ts`: "if (!redis) return fetcher();").

#### Scenario: cacheGetOrSet bypasses cache when Upstash unset

- GIVEN `UPSTASH_REDIS_REST_URL` is unset
- WHEN `cacheGetOrSet(key, fetcher)` is called
- THEN it MUST call `fetcher()` directly
- AND it MUST NOT make an Upstash API call
- AND it MUST return the fetcher's result

#### Scenario: cacheInvalidate is a no-op when Upstash unset

- GIVEN `UPSTASH_REDIS_REST_URL` is unset
- WHEN `cacheInvalidate("slots:doctor-1:2026-06-26")` is called
- THEN it MUST return without making an Upstash API call
- AND it MUST NOT throw

### Requirement: REQ-API-UPSTASH-3 — Cache uses explicit key list for invalidation (Upstash REST has no pattern-delete)

The `cacheInvalidate` function MUST NOT use `KEYS` or `SCAN` + `DEL` patterns (Upstash REST does not support `KEYS` pattern matching efficiently). Instead, the cache layer MUST track the set of keys written under a logical namespace and invalidate by enumerating the explicit list at write time.

Implementation approach (one of):
- Maintain a `Set<string>` of cache keys in a per-namespace index stored under a well-known key (e.g., `__index__:slots:<doctorId>:<date>`).
- The cache write appends the new key to the index; the invalidate reads the index and deletes each key explicitly.

#### Scenario: cacheInvalidate does not use KEYS pattern matching

- GIVEN `cacheInvalidate(...)` is called
- WHEN the implementation is read
- THEN it MUST NOT call any `KEYS` or `SCAN` API
- AND it MUST use an explicit key list (either inline or via an index key)

#### Scenario: Explicit key list is consistent under concurrent writes

- GIVEN two concurrent calls to `cacheGetOrSet` with different keys under the same namespace
- WHEN both writes complete
- THEN `cacheInvalidate(namespace)` MUST invalidate both keys
- AND it MUST NOT lose either key due to race conditions (the index key is updated last, after the value write)
