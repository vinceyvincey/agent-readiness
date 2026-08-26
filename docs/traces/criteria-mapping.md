# Droid 84-Criteria → Pi Check Mapping

> Extracted from actual Droid session traces (`/readiness-report` system prompt).
> Droid has 84 criteria: 44 repo-scope + 40 app-scope. Pi has ~53 checks across 10 pillars.

## Level distribution (Droid)

| Level | Count | Description |
|---|---|---|
| L1 | 7 | Basic tooling (README, linter, type check, formatter, unit tests, env template, gitignore) |
| L2 | 26 | Documented processes (AGENTS.md, CI, hooks, CODEOWNERS, coverage, etc.) |
| L3 | 29 | Standardized (skills, dead code, integration tests, tracing, metrics, etc.) |
| L4 | 20 | Optimized (fast CI, deployment frequency, feature flags, test isolation, etc.) |
| L5 | 1 | Autonomous (cyclomatic complexity analysis) |

## Scoring comparison

| Aspect | Droid | Pi |
|---|---|---|
| Formula | Flat pass rate across all non-skipped signals | Weighted pillar scores with 80% N-1 gating |
| Levels | L1-L5 (0-20% → 80-100%) | L0-L5 (pillar gates + mandatory P2/P6) |
| Skipping | Context-aware (marks N/A for irrelevant criteria) | No skipping (all checks evaluated) |
| Weighting | All signals equal | Configurable per-pillar weights (default 10% each) |

## Full mapping table

### Style & Validation (12 criteria → P5)

| Droid ID | Level | Scope | Pi equiv | Status | Feasibility |
|---|---|---|---|---|---|
| lint_config | L1 | app | P5.1 | ✅ Aligned | - |
| type_check | L1 | app | P5.3 | ✅ Aligned | - |
| formatter | L1 | app | P5.2 | ✅ Aligned | - |
| pre_commit_hooks | L2 | app | P4.3 | ✅ Aligned | - |
| strict_typing | L2 | app | P5.6 (M10) | ✅ Aligned | - |
| naming_consistency | L3 | app | — | **GAP** | ✅ Add check: naming convention docs or ESLint naming rules |
| cyclomatic_complexity | L5 | app | — | **GAP** | ✅ Add check: complexity analysis config |
| dead_code_detection | L3 | app | — | **GAP** | ✅ Add check: knip/vulture/staticcheck config |
| duplicate_code_detection | L3 | app | — | **GAP** | ✅ Add check: jscpd/CPD config |
| code_modularization | L4 | app | P9.3 (partial) | ⚠️ Partial | Pi checks src/lib/packages dirs; Droid checks enforcement tooling |
| n_plus_one_detection | L4 | app | — | **GAP** | ❌ Agent-only (requires code analysis) |
| heavy_dependency_detection | L4 | app | — | **GAP** | ❌ Agent-only (requires bundle analysis) |

### Build System (17 criteria → P3/P4)

| Droid ID | Level | Scope | Pi equiv | Status | Feasibility |
|---|---|---|---|---|---|
| build_cmd_doc | L2 | repo | P3.2 | ✅ Aligned | - |
| deps_pinned | L2 | repo | P3.1 | ✅ Aligned | - |
| vcs_cli_tools | L2 | repo | — | **GAP** | ✅ Add check: gh/glab on PATH |
| automated_pr_review | L2 | repo | P1.7 (partial) | ⚠️ Partial | Pi checks .factory/droids; Droid checks actual review automation |
| agentic_development | L3 | repo | P1.6/P1.7/P1.8 | ⚠️ Partial | Pi checks .factory/ files; Droid checks git history for agent co-authorship |
| fast_ci_feedback | L4 | repo | — | **GAP** | ❌ Agent-only (requires CI timing data) |
| build_performance_tracking | L4 | repo | — | **GAP** | ❌ Agent-only (requires CI metrics) |
| deployment_frequency | L4 | repo | — | **GAP** | ❌ Agent-only (requires release data) |
| single_command_setup | L3 | repo | P8.2 | ✅ Aligned | - |
| feature_flag_infrastructure | L4 | repo | — | **GAP** | ❌ Hard (no standard config file) |
| release_notes_automation | L3 | repo | — | **GAP** | ✅ Add check: semantic-release/changesets config |
| progressive_rollout | L4 | repo | — | **GAP** | ❌ Agent-only (requires infra analysis) |
| rollback_automation | L4 | repo | — | **GAP** | ❌ Agent-only (requires infra analysis) |
| monorepo_tooling | L2 | repo | discover.ts (M8) | ⚠️ Partial | Pi discovers apps; Droid checks tooling config |
| version_drift_detection | L3 | repo | — | **GAP** | ❌ Agent-only (requires monorepo analysis) |
| release_automation | L3 | repo | — | **GAP** | ✅ Add check: CD workflow or semantic-release config |
| dead_feature_flag_detection | L3 | repo | — | **GAP** | ❌ Agent-only (prerequisite fails) |
| unused_dependencies_detection | L3 | app | — | **GAP** | ✅ Add check: depcheck/knip/deptry config |

### Testing (10 criteria → P2)

| Droid ID | Level | Scope | Pi equiv | Status | Feasibility |
|---|---|---|---|---|---|
| unit_tests_exist | L1 | app | P2.1 | ✅ Aligned | - |
| unit_tests_runnable | L2 | app | — | **GAP** | ⚠️ Behavioral (Droid runs npm test; pi can check devDeps include runner) |
| integration_tests_exist | L3 | app | — | **GAP** | ✅ Add check: cypress/playwright/e2e config |
| test_coverage_thresholds | L2 | app | P2.4 | ✅ Aligned | - |
| test_performance_tracking | L4 | app | — | **GAP** | ❌ Agent-only (requires timing data) |
| flaky_test_detection | L4 | app | — | **GAP** | ❌ Agent-only (requires retry config + CI data) |
| test_naming_conventions | L3 | app | — | **GAP** | ✅ Add check: testMatch/testRegex in jest/vitest config |
| test_isolation | L4 | app | — | **GAP** | ✅ Add check: parallelization config (xdist, threads, sharding) |
| interactive_qa_exists | L2 | app | — | **GAP** | ❌ Agent-only (requires understanding run path) |
| interactive_qa_runnable | L3 | app | — | **GAP** | ❌ Agent-only (requires running the app) |

### Documentation (9 criteria → P0/P1)

| Droid ID | Level | Scope | Pi equiv | Status | Feasibility |
|---|---|---|---|---|---|
| agents_md | L2 | repo | P1.1 | ✅ Aligned | - |
| readme | L1 | repo | P0.1/P0.2 | ✅ Aligned | - |
| documentation_freshness | L3 | repo | — | **GAP** | ✅ Add check: git log for doc modifications within 180 days |
| automated_doc_generation | L2 | repo | — | **GAP** | ✅ Add check: typedoc/jsdoc/sphinx config |
| skills | L3 | repo | P1.4 (partial) | ⚠️ Partial | Pi checks mcp.json/CLAUDE.md; Droid checks .factory/skills/ |
| service_flow_documented | L3 | repo | P0.3 (partial) | ⚠️ Partial | Pi checks docs/ dir; Droid checks for architecture diagrams |
| agents_md_validation | L4 | repo | — | **GAP** | ❌ Agent-only (requires CI/hook analysis) |
| api_schema_docs | L3 | app | — | **GAP** | ✅ Add check: openapi.json/swagger.json/graphql schema |
| database_schema | L2 | app | — | **GAP** | ✅ Add check: prisma schema, SQL migrations, ORM entities |

### Development Environment (5 criteria → P8)

| Droid ID | Level | Scope | Pi equiv | Status | Feasibility |
|---|---|---|---|---|---|
| env_template | L1 | repo | P8.1 | ✅ Aligned | - |
| devcontainer | L2 | repo | P8.3 | ✅ Aligned | - |
| local_services_setup | L2 | repo | — | **GAP** | ✅ Add check: docker-compose.yml or tiltfile |
| devcontainer_runnable | L3 | repo | — | **GAP** | ❌ Agent-only (requires devcontainer CLI) |
| runbooks_documented | L2 | repo | — | **GAP** | ✅ Add check: runbook dir or SRE docs |

### Debugging & Observability (12 criteria → P7)

| Droid ID | Level | Scope | Pi equiv | Status | Feasibility |
|---|---|---|---|---|---|
| structured_logging | L2 | app | P7.1 (partial) | ⚠️ Partial | Pi checks for logging library mention; Droid checks actual deps |
| distributed_tracing | L3 | app | — | **GAP** | ✅ Add check: OpenTelemetry/X-Request-ID in deps |
| metrics_collection | L3 | app | — | **GAP** | ✅ Add check: Datadog/Prometheus/New Relic in deps |
| code_quality_metrics | L4 | app | — | **GAP** | ❌ Agent-only (requires CI/admin access) |
| error_tracking_contextualized | L2 | app | — | **GAP** | ✅ Add check: Sentry/Bugsnag/Rollbar in deps |
| alerting_configured | L3 | app | — | **GAP** | ✅ Add check: PagerDuty/OpsGenie config |
| deployment_observability | L4 | app | — | **GAP** | ❌ Agent-only (requires dashboard links) |
| health_checks | L3 | app | — | **GAP** | ✅ Add check: /health endpoint or k8s probes |
| circuit_breakers | L4 | app | — | **GAP** | ❌ Agent-only (requires code analysis) |
| profiling_instrumentation | L4 | app | — | **GAP** | ❌ Agent-only (requires code analysis) |
| log_scrubbing | L3 | app | — | **GAP** | ✅ Add check: pino redact / winston format in logging config |
| product_analytics_instrumentation | L3 | app | — | **GAP** | ✅ Add check: Mixpanel/Amplitude/PostHog in deps |

### Security (12 criteria → P6/P4)

| Droid ID | Level | Scope | Pi equiv | Status | Feasibility |
|---|---|---|---|---|---|
| branch_protection | L2 | repo | — | **GAP** | ❌ Agent-only (requires API access) |
| secret_scanning | L3 | repo | P6.2/P6.4 | ⚠️ Partial | Pi checks for committed secrets; Droid checks scanning config |
| codeowners | L2 | repo | P4.4 | ✅ Aligned | - |
| automated_security_review | L2 | repo | — | **GAP** | ❌ Agent-only (requires API access) |
| dependency_update_automation | L2 | repo | P4.5 | ✅ Aligned | - |
| gitignore_comprehensive | L1 | repo | P6.1 | ✅ Aligned | - |
| privacy_compliance | L4 | repo | — | **GAP** | ❌ Agent-only (requires policy analysis) |
| secrets_management | L2 | repo | P6.5 (partial) | ⚠️ Partial | Pi checks .env.example patterns; Droid checks for vault integration |
| min_release_age | L3 | repo | — | **GAP** | ✅ Add check: Renovate minimumReleaseAge config |
| dast_scanning | L4 | app | — | **GAP** | ❌ Agent-only (requires running service) |
| pii_handling | L3 | app | — | **GAP** | ❌ Agent-only (requires code analysis) |
| large_file_detection | L3 | repo | P5.4 (partial) | ⚠️ Partial | Pi checks for mega-files; Droid checks for detection tooling |

### Task Discovery (4 criteria → P9/P4)

| Droid ID | Level | Scope | Pi equiv | Status | Feasibility |
|---|---|---|---|---|---|
| issue_templates | L2 | repo | P4.6 (M10) | ✅ Aligned | - |
| issue_labeling_system | L2 | repo | — | **GAP** | ✅ Add check: .github/labels.yml or label config |
| pr_templates | L2 | repo | P4.7 (M10) | ✅ Aligned | - |
| backlog_health | L4 | repo | — | **GAP** | ❌ Agent-only (requires issue data) |

### Product & Experimentation (2 criteria → no pi pillar)

| Droid ID | Level | Scope | Pi equiv | Status | Feasibility |
|---|---|---|---|---|---|
| product_analytics_instrumentation | L3 | app | — | **GAP** | ✅ Add check: analytics SDK in deps |
| error_to_insight_pipeline | L5 | repo | — | **GAP** | ✅ Add check: Sentry webhook in CI or issue creation automation |

## Summary

| Category | Count | Percentage |
|---|---|---|
| ✅ Fully aligned | 15 | 18% |
| ⚠️ Partially aligned | 9 | 11% |
| **GAP** - feasible to add | 20 | 24% |
| **GAP** - agent-only/infeasible | 40 | 47% |

### Checks to add in M11 (feasible, highest impact)

1. `naming_consistency` → P5 (naming convention docs or ESLint naming rules)
2. `dead_code_detection` → P5 (knip/vulture/staticcheck config)
3. `duplicate_code_detection` → P5 (jscpd/CPD config)
4. `cyclomatic_complexity` → P5 (complexity analysis config)
5. `unused_dependencies_detection` → P5 (depcheck/knip/deptry config)
6. `large_file_detection` → P5 (gitattributes LFS or linter max-lines)
7. `integration_tests_exist` → P2 (cypress/playwright/e2e config)
8. `test_naming_conventions` → P2 (testMatch/testRegex in config)
9. `test_isolation` → P2 (parallelization config)
10. `documentation_freshness` → P0 (git log for doc modifications)
11. `automated_doc_generation` → P0 (typedoc/jsdoc/sphinx config)
12. `api_schema_docs` → P0 (openapi.json/swagger.json/graphql)
13. `runbooks_documented` → P7 (runbook dir or SRE docs)
14. `local_services_setup` → P8 (docker-compose.yml)
15. `distributed_tracing` → P7 (OpenTelemetry in deps)
16. `metrics_collection` → P7 (Datadog/Prometheus in deps)
17. `error_tracking_contextualized` → P7 (Sentry/Bugsnag in deps)
18. `product_analytics_instrumentation` → P7 (Mixpanel/Amplitude in deps)
19. `issue_labeling_system` → P4 (label config)
20. `release_automation` → P4 (CD workflow or semantic-release)
