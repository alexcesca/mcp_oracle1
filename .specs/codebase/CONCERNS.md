# Concerns

Analyzed: 2026-06-01

## High Priority

### 1) Broken test expectations in leite aggregation unit test

- Location: `tests/leite-aggregation.test.ts`
- Issue:
  - assertions expect SQL based on logical field names instead of mapped physical columns used by implementation.
- Impact:
  - CI instability and reduced trust in test suite.
- Evidence:
  - current test run fails in this case.

### 2) Oracle integration tests can pass without validating Oracle behavior

- Location: `tests/integration.test.ts`
- Issue:
  - tests return early when env/service is unavailable but are still marked as pass.
- Impact:
  - false confidence in Oracle integration health.

## Medium Priority

### 3) Invalid SQL test does not test invalid SQL path

- Location: `tests/integration.test.ts`
- Issue:
  - test named as invalid SQL uses `SELECT 1 FROM dual`, which is valid SQL.
- Impact:
  - expected error-path coverage is misleading.

### 4) Session mode default appears fragile

- Location: `index.ts`
- Issue:
  - `DEFAULT_SESSION_MODE` is set to `statelesss` (extra `s`).
  - current parser then falls back to `stateful` unless env is exactly `stateless`.
- Impact:
  - behavior may differ from intended default and can confuse maintainers.

### 5) DNS rebinding protection disabled in HTTP transport object

- Location: `index.ts`
- Issue:
  - `enableDnsRebindingProtection: false` in Streamable HTTP transport options.
- Mitigation already present:
  - custom `Origin` validation is implemented.
- Residual risk:
  - if origin policy is misconfigured (e.g., wildcard), attack surface increases.

## Low Priority

### 6) Heavy startup logging in normal and test paths

- Locations: `index.ts`, tests output
- Issue:
  - extensive `console.error` output can hide actual failures in CI logs.
- Impact:
  - slower diagnosis and noisy pipeline output.

### 7) Potential SQL classification edge cases

- Location: `common/utils.ts`
- Issue:
  - read-only detection depends on statement-prefix classification after comment removal.
  - uncommon SQL wrappers may be misclassified.
- Impact:
  - low probability; mostly guardrail quality concern.

## Recommended Prioritized Actions

1. Fix failing `tests/leite-aggregation.test.ts` to match current mapped SQL behavior.
2. Refactor Oracle integration tests to explicit skip semantics when env is absent.
3. Correct invalid SQL test case and assert actual failure path.
4. Clarify intended default for session mode and normalize constant/value.
5. Re-evaluate `enableDnsRebindingProtection` setting against deployment model.
