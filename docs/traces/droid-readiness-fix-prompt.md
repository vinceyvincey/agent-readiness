<system-reminder>
You are fixing failing Agent Readiness signals. Agent Readiness evaluates how well a repository supports autonomous AI agents working on the codebase.

## Report Summary
**Repository:** https://github.com/test/low.git
**Level:** 1
**Score:** 1.6%

## Failing Signals (61 total)

- **Linter Configuration** (`lint_config`): [0/1] - No linter config (.eslintrc*, eslint.config.*, ruff, etc.) anywhere in the repo; only src/index.ts exists.
  Description: Project has a linter configured to catch code quality issues
  Evaluation instructions: Linter configured – Project has a linter configured to catch code quality issues. Common examples: ESLint (.eslintrc.*, eslint.config.*) for TS/JS, ruff/flake8 (pyproject.toml, .flake8, ruff.toml) for Python, SonarQube/SonarCloud (sonar-project.properties, .sonarcloud.properties, or "sonar" in CI workflows). Other equivalent linters or static analysis tools also satisfy this criterion.

- **Type Checker** (`type_check`): [0/1] - No tsconfig.json or any type checker configuration present.
  Description: Project uses static type checking
  Evaluation instructions: Type checker – tsconfig.json with "strict": true for TS, mypy.ini or [tool.mypy] in pyproject.toml for Py.

- **Code Formatter** (`formatter`): [0/1] - No formatter config (.prettierrc*, [tool.black], etc.) present.
  Description: Project uses an automated code formatter
  Evaluation instructions: Formatter – Prettier (.prettierrc*) for TS, Black ([tool.black] in pyproject.toml) for Py.

- **Pre-commit Hooks** (`pre_commit_hooks`): [0/1] - No .pre-commit-config.yaml, husky, or lint-staged configuration found.
  Description: Project uses pre-commit hooks to enforce quality checks
  Evaluation instructions: Pre-commit hooks – Husky/lint-staged for TS, .pre-commit-config.yaml with ruff/black for Py.

- **Strict Typing** (`strict_typing`): [0/1] - No tsconfig.json with strict:true or any strict typing config; TypeScript strictness not enabled.
  Description: TypeScript strict mode or mypy strict mode is enabled
  Evaluation instructions: Strict typing enabled – Project uses strict type checking. Common approaches: TypeScript tsconfig.json with "strict": true, Python mypy strict mode in mypy.ini or pyproject.toml, SonarQube/SonarCloud for TypeScript (has type-related rules that complement strict mode; verify it is not explicitly disabled in sonar properties). Other type checkers or strict mode configurations also satisfy this criterion. Some languages (Rust, Go) are typed by default. Reason about each application and skip if unclear.

- **Naming Consistency** (`naming_consistency`): [0/1] - No naming convention enforcement (ESLint naming rules, pylint, or documented conventions).
  Description: Consistent naming conventions enforced across the codebase
  Evaluation instructions: Naming consistency – Consistent naming conventions are enforced. Common approaches: ESLint @typescript-eslint/naming-convention rule, pylint naming-style rules, explicit naming conventions documented in AGENTS.md or CONTRIBUTING.md (e.g., "use camelCase for functions"), SonarQube/SonarCloud (has naming convention rules enabled by default in quality profiles; verify it is not explicitly disabled in sonar properties). Other linter rules, code quality tools, or documented conventions that enforce naming standards also satisfy this criterion.

- **Cyclomatic Complexity** (`cyclomatic_complexity`): [0/1] - No complexity analysis tooling or CI checks (ESLint complexity, radon, SonarQube, etc.).
  Description: Code maintains reasonable complexity thresholds
  Evaluation instructions: Cyclomatic complexity – Code complexity is analyzed and monitored. Common tools: ESLint complexity rule, lizard or radon for Python, gocyclo or go-critic for Go, SonarQube/SonarCloud (has built-in cognitive/cyclomatic complexity analysis enabled by default; verify it is not explicitly disabled in sonar properties). Other complexity analyzers or CI checks that enforce complexity thresholds also satisfy this criterion.

- **Large File Detection** (`large_file_detection`): [0/1] - No git hooks, CI file-size checks, .gitattributes/LFS, or linter max-lines rules.
  Description: Tooling detects/prevents overly large files
  Evaluation instructions: Large file detection – Check for tooling that detects/prevents overly large files (language-agnostic). PASS if ANY ONE of the following exists: 1) Git hooks checking file size or line count (husky, pre-commit, custom scripts). 2) CI job that flags files over a threshold. 3) .gitattributes with LFS for large binary files. 4) Linter rules for file size (ESLint max-lines for JS/TS, pylint max-module-lines for Python, or equivalent). 5) Code quality platform with file size/complexity checks.

- **Dead Code Detection** (`dead_code_detection`): [0/1] - No dead code tooling (knip, vulture, staticcheck, SonarQube) or CI checks.
  Description: Dead code detection tooling configured
  Evaluation instructions: Dead code detection – Tooling detects unused/dead code. PASS if ANY ONE of the following exists: 1) JS/TS: knip, unimported, or ESLint import/no-unused-modules. 2) Python: vulture or dead. 3) Go: deadcode or staticcheck. 4) Rust: cargo-udeps. 5) Java: SpotBugs or PMD with unused code rules. 6) SonarQube/SonarCloud (has built-in unused code detection enabled by default; verify it is not explicitly disabled in sonar properties). 7) Any other dead code detector, CI check, or pre-commit hook that flags unused code. Check for config files at both repo root and app level (e.g., knip.json, .eslintrc, pyproject.toml). For monorepos, if a tool is configured at the repo root, read its config to determine which applications it covers (e.g., workspaces or include/exclude patterns) and count covered apps as passing.

- **Duplicate Code Detection** (`duplicate_code_detection`): [0/1] - No duplication detection tooling (jscpd, PMD CPD, SonarQube) configured.
  Description: Duplicate code (DRY) detection tooling configured
  Evaluation instructions: Duplicate code detection – Tooling detects copy-paste or duplicate code to enforce DRY (Don't Repeat Yourself) principles. Common tools: jscpd (in CI or pre-commit), PMD CPD for Java, SonarQube/SonarCloud (has built-in CPD enabled by default; verify it is not explicitly disabled in sonar properties). Other duplication detectors, CI checks, or pre-commit hooks that flag duplicate code also satisfy this criterion.

- **Technical Debt Tracking** (`tech_debt_tracking`): [0/1] - No TODO/FIXME scanning, linter rules, or code quality platform tracking tech debt.
  Description: Tooling tracks technical debt markers
  Evaluation instructions: Tech debt tracking – Tooling tracks technical debt markers. Common approaches: TODO/FIXME scanner in CI, TODO comments required to link to issues (e.g., TODO(TICKET-123) enforcement), language-specific linter rules (eslint-plugin-no-unsanitized-todo, pylint fixme), SonarQube/SonarCloud (has built-in technical debt tracking via SQALE methodology enabled by default; verify it is not explicitly disabled in sonar properties). Other tech debt tracking tools, code quality platforms, or documented tracking systems also satisfy this criterion.

- **Build Command Documentation** (`build_cmd_doc`): [0/1] - No README or AGENTS.md documents any build/install command.
  Description: Project documents how to build the code
  Evaluation instructions: Build command documented – README/AGENTS.md lists "npm run build" (TS) or "pip install -r requirements.txt" (Py)

- **Dependencies Pinned** (`deps_pinned`): [0/1] - No package.json, lockfile, or requirements file exists.
  Description: Project pins dependencies to specific versions
  Evaluation instructions: Dependencies pinned – lockfile committed (package-lock.json, yarn.lock, pnpm-lock.yaml) for TS; requirements.txt with == pins or poetry.lock for Py

- **Automated PR Review Generation** (`automated_pr_review`): [0/1] - No PR review automation (danger.js, review bots, CI comments); remote repo test/low returns 404, no PRs verifiable.
  Description: System automatically generates code review comments on pull requests
  Evaluation instructions: Automated PR review generation – Check for automation that generates code review comments on PRs. If `gh` or `glab` CLI is available and authenticated, run `gh pr list --state all --limit 10 --json reviews,comments` to verify bots/automation are posting review comments (not just status checks). Look for danger.js, droid exec reviews, custom GitHub Actions comments, or AI-powered review bots. Key is automation that GENERATES review content, not just runs checks. Skip if `gh`/`glab` CLI is not available or not authenticated.

- **Agentic Development** (`agentic_development`): [0/1] - Single commit by 'test' with no AI co-authors; no agent CI workflows, agent CLI scripts, or .factory/.claude dirs.
  Description: AI agents are integrated into the development workflow
  Evaluation instructions: Agentic development detected – Look for evidence that AI agents are part of the development workflow. Check: 1) Git history for agent co-authorship: `git log --format='%an|||%ae|||%s|||%b' -100` and search for AI coding agent identifiers in author/co-author fields. Common patterns include AI tool names (often with '[bot]' suffix) in author fields or 'Co-authored-by' headers (e.g., 'factory-droid[bot]', 'Claude Code'). Note: dependency bots like dependabot or renovate do not count. Also note that these examples are non-exhaustive - look for any AI coding agent identifiers. Optional: if `gh` CLI available, use `gh pr list --json commits` for more reliable co-author detection. 2) CI/CD workflows that invoke agents for reviews, code generation, or documentation. 3) Scripts/Makefiles with agent CLI commands (e.g., droid exec). 4) Agent configuration directories, skills, or hooks (e.g., .factory/droids/, .factory/skills/, .factory/hooks/). Need at least one strong evidence point showing agents actively participate in development.

- **Fast CI Feedback** (`fast_ci_feedback`): [0/1] - No CI workflows exist and remote repo is unreachable, so no CI feedback pipeline to measure.
  Description: CI pipeline provides feedback in under 10 minutes
  Evaluation instructions: Fast CI feedback – CI pipeline provides feedback in under 10 minutes. If `gh` or `glab` CLI is available and authenticated, run `gh pr list --state merged --limit 20 --json statusCheckRollup`. For each PR, find all status checks in statusCheckRollup array and calculate CI duration from earliest startedAt to latest completedAt or updatedAt (ISO8601 timestamps). Example: if checks start at 10:00:00Z and finish at 10:06:00Z, CI duration is 6 minutes. Verify average CI duration is under 10 minutes for typical PRs. IMPORTANT: Calculate CI check duration, NOT PR merge time (createdAt to mergedAt). Focus on the primary CI workflow that runs on PRs. Skip if `gh`/`glab` CLI is not available or not authenticated.

- **Build Performance Tracking** (`build_performance_tracking`): [0/1] - No CI, build caching, or build metrics configuration of any kind.
  Description: Build duration is measured and optimized
  Evaluation instructions: Build performance tracking – Build duration is measured and optimized. If `gh` or `glab` CLI is available and authenticated, use `gh run view --log` or `gh pr view --json statusCheckRollup` to analyze build step timing. Also check for: 1) Build caching configured (turbo cache, nx cache, webpack cache, buildx cache). 2) Build metrics exported to monitoring. 3) Evidence of build optimization (parallel builds, incremental builds). Verify deliberate performance monitoring exists, not just builds that happen to run. Skip if `gh`/`glab` CLI is not available or not authenticated and no other build performance evidence exists.

- **Deployment Frequency** (`deployment_frequency`): [0/1] - No deploy workflows, releases, or CD automation; remote repo returns 404.
  Description: System deploys multiple times per week with automation
  Evaluation instructions: Frequent deployments – System deploys multiple times per week with automation. If `gh` or `glab` CLI is available and authenticated, run BOTH: 1) `gh release list --limit 30` to check for release-based deploys. 2) For workflow-based deploys, first list workflows with `ls .github/workflows/ | grep -i deploy` to find deploy workflow filenames, then run `gh run list --workflow={exact-name}.yml --limit 30` for each (gh CLI does not support wildcards in --workflow). Alternatively, run `gh run list --limit 50` and filter for deploy-related workflows. Some orgs use releases, others use workflow runs - either is valid. Count successful deploys from both sources combined and verify multiple deploys per week minimum. Also verify deployment automation (auto-deploy on merge, CD pipelines). This is about culture of frequent shipping. Skip if `gh`/`glab` CLI is not available or not authenticated.

- **Single Command Setup** (`single_command_setup`): [0/1] - No README/AGENTS.md documents a setup-to-dev command sequence.
  Description: One command gets you from clone to running dev server
  Evaluation instructions: Single command setup – README or AGENTS.md or SKILLS documents a single command (or short sequence) that takes you from fresh clone to running dev server. Example: 'npm install && npm run dev' or 'make dev'.

- **Feature Flag Infrastructure** (`feature_flag_infrastructure`): [0/1] - No feature flag platform (LaunchDarkly, Statsig, Unleash) or custom flag system.
  Description: Feature flag system configured for safe rollouts
  Evaluation instructions: Feature flag infrastructure – LaunchDarkly, Statsig, Unleash, GrowthBook, or custom feature flag system is configured. Enables agents to ship changes behind toggles, reducing risk of agent-authored code affecting all users immediately.

- **Release Notes Automation** (`release_notes_automation`): [0/1] - No semantic-release, changesets, or changelog generation tooling.
  Description: Automated release notes or changelog generation
  Evaluation instructions: Release notes automation – Automated release notes or changelog generation exists. Does not need to run on every commit - can be periodic (weekly/release-based) via semantic-release, standard-version, changesets, GitHub releases, or custom scripts. Ensures agent contributions are documented.

- **Unused Dependencies Detection** (`unused_dependencies_detection`): [0/1] - No depcheck/knip/deptry or CI checks for unused dependencies.
  Description: Tooling detects unused dependencies
  Evaluation instructions: Unused dependencies detection – Check for tooling that detects unused dependencies in any language. PASS if ANY ONE of the following exists: 1) JS/TS: depcheck, npm-check, or knip configured. 2) Python: deptry or pip-extra-reqs. 3) Go: `go mod tidy` in CI (ensures go.mod only has used deps). 4) Rust: cargo-udeps. 5) Java/Maven: `mvn dependency:analyze` in CI. 6) Java/Gradle: dependency-analysis plugin. 7) Any CI job or pre-commit hook that checks for unused dependencies.

- **Release Automation** (`release_automation`): [0/1] - No CD pipeline, semantic-release, GitOps, or Docker publishing automation.
  Description: Automated release/deployment pipelines configured
  Evaluation instructions: Release automation – Check for automated release/deployment pipelines. Look for: 1) CD pipeline in .github/workflows (deploy on merge to main). 2) semantic-release or similar configured. 3) GitOps setup (ArgoCD, Flux manifests). 4) Automated Docker image publishing. 5) Release-please or changesets automation. PASS if releases/deployments are automated rather than manual.

- **Unit Tests Exist** (`unit_tests_exist`): [0/1] - No test files or test directories exist.
  Description: Project has unit tests
  Evaluation instructions: Unit tests present – *.test.ts / __tests__/ (TS) or tests/test_*.py (Py).

- **Integration Tests Exist** (`integration_tests_exist`): [0/1] - No integration/E2E test setup (Playwright, Cypress, etc.).
  Description: Project has integration or end-to-end tests
  Evaluation instructions: Integration tests present – cypress/, playwright.config.ts (TS) or tests/integration/, Behave .feature files (Py).

- **Unit Tests Runnable** (`unit_tests_runnable`): [0/1] - No test runner or test script exists to run.
  Description: Unit tests can be run locally with a simple command
  Evaluation instructions: Tests runnable locally – "test": "vitest" (or Vitest) script in package.json (TS) or pytest runnable via tox/make test (Py). Actually run the command you find to see if the tests really are runnable (do not worry about whether they pass, just if they can be run). Use flags like --listTests (vitest) or --collect-only (pytest) to verify runnability without running the full suite, which can take hours. It is very important to use these flags to avoid waiting for the entire test suite to complete.

- **Test Performance Tracking** (`test_performance_tracking`): [0/1] - No test timing output, reports, or analytics configured.
  Description: Test suite duration is measured and monitored
  Evaluation instructions: Test performance tracking – Test suite duration is measured and tracked. Check: 1) CI outputs that show test timing (e.g., vitest --verbose, pytest --durations). 2) Test reports uploaded as artifacts. 3) Integration with test analytics platforms (BuildPulse, Datadog CI, GitHub Actions test reporting). 4) Config flags for test timing output in package.json scripts or CI workflows. Evidence that org monitors test performance, not just pass/fail.

- **Flaky Test Detection** (`flaky_test_detection`): [0/1] - No tests, retry config, or flaky test tooling; no remote PR data available.
  Description: System identifies and tracks unstable tests
  Evaluation instructions: Flaky test detection – Check for proactive flaky test management. If `gh` or `glab` CLI is available and authenticated, run `gh pr list --state all --limit 10 --json statusCheckRollup` to detect duplicate check names (indicates retries/flakiness). Also check for: 1) Test retry configuration (vitest-retry, pytest-rerunfailures). 2) Flaky test tracking tools (BuildPulse). 3) CI quarantine/skip mechanisms. 4) Test stability metrics. Skip if `gh`/`glab` CLI is not available or not authenticated and no other flaky test detection evidence exists.

- **Test Coverage Thresholds** (`test_coverage_thresholds`): [0/1] - No coverage thresholds or coverage tooling configured.
  Description: Minimum coverage enforced in CI
  Evaluation instructions: Test coverage thresholds – Minimum coverage percentages are enforced. Common approaches: vi.config.js coverageThreshold, pytest --cov-fail-under, Codecov/Coveralls with PR status checks blocking on coverage, SonarQube/SonarCloud quality gate with coverage threshold (sonar.coverage.* settings or sonar.qualitygate.wait=true in CI). Other CI gates or tools that enforce minimum coverage also satisfy this criterion. Agents must know they have to maintain coverage, not just that it is tracked.

- **Test File Naming Conventions** (`test_naming_conventions`): [0/1] - No test framework config or documented naming conventions.
  Description: Consistent test file naming enforcement
  Evaluation instructions: Test naming conventions – Check for consistent test file naming enforcement in any language. PASS if ANY ONE of the following exists: 1) JS/TS: Vitest testMatch/testRegex, Vitest include patterns, or Mocha test directory config. 2) Python: pytest naming conventions in pytest.ini or pyproject.toml (test_*.py pattern). 3) Go: *_test.go convention (built-in, check tests exist following pattern). 4) Java: Maven/Gradle test source directories with naming patterns. 5) Any test framework configured with explicit naming patterns. 6) Test naming conventions documented in AGENTS.md or CONTRIBUTING.md.

- **Test Isolation** (`test_isolation`): [0/1] - No parallel/isolated test execution configuration.
  Description: Tests are configured for isolated/parallel execution
  Evaluation instructions: Test isolation – Check for test isolation enforcement in any language. PASS if ANY ONE of the following exists: 1) JS/TS: Vitest parallelization (not --runInBand), Vitest threads, or test sharding configured. 2) Python: pytest-xdist for parallel execution. 3) Go: `go test -parallel` or `t.Parallel()` usage. 4) Java: JUnit parallel execution config, or Maven/Gradle parallel test forks. 5) Database isolation patterns (transactions, test databases, factories, testcontainers). 6) Test randomization enabled (--randomize, pytest-randomly). 7) Any test framework configured for parallel or isolated execution.

- **Interactive QA Exists** (`interactive_qa_exists`): [0/1] - No documented path to run or interactively exercise the app (no README/AGENTS.md/scripts).
  Description: A documented, agent-followable path to interactively QA the application exists
  Evaluation instructions: Interactive QA documented – A concrete, agent-followable path to bring the application to an interactive state and exercise it end-to-end must be documented, regardless of app type (web/browser UI, TUI/CLI, backend/API server, mobile app, desktop app, batch/worker). This criterion is documentation-only; do NOT actually run anything. Look for the QA/run path in AGENTS.md, README, CONTRIBUTING, package.json/Makefile/justfile scripts, skills (SKILL.md), docker-compose, .env.example, or e2e/QA harnesses (Playwright/Cypress for web, a TUI test harness for CLIs, curl/httpie or an OpenAPI/health endpoint for APIs, a simulator/emulator flow for mobile). PASS the application only when the documented path is complete enough for an agent to follow end-to-end: it covers installing/standing up required dependencies and services, handling any auth/login gate (documented test credentials or bypass/mock), launching the app, and driving at least one meaningful interaction (load a page and click, run a command and read output, hit an endpoint and get a 2xx, etc.). FAIL if there is no documented path, or the path omits dependencies, auth handling, or the drive step. This is a repository-wide expectation: the criterion is only fully satisfied when EVERY application in the repo passes.

- **Interactive QA Runnable** (`interactive_qa_runnable`): [0/1] - No documented or inferable way to run the app; no deps, scripts, or QA harness.
  Description: An agent can actually bring the application up and interactively QA it end-to-end
  Evaluation instructions: Interactive QA runnable – Building on the documented QA path (see interactive_qa_exists), an agent must be able to ACTUALLY run the application and interactively exercise it end-to-end, regardless of app type (web/browser UI, TUI/CLI, backend/API server, mobile app, desktop app, batch/worker). Step 1 (attempt): follow the documented path to bring the app to an interactive state – install deps, stand up required local services, load env vars, launch the app, and drive at least one meaningful interaction (load a page and click, run a command and read output, hit an endpoint and get a 2xx, etc.). Step 2 (blockers): FAIL the application if the attempt cannot reach an interactive state – e.g. required dependencies/services are neither stood up nor mockable from documented steps, there is an auth/login gate with no documented test credentials or bypass/mock, or there is no documented or reasonably inferable way to run and exercise it. If actually running is not feasible in the evaluation environment, fall back to verifying that a concrete, complete, agent-followable interactive QA path exists (dependencies, auth handling, and the drive step are all covered); otherwise FAIL. Count an application as passing only when its interactive QA path is confirmed runnable (or fully documented on fallback). This is a repository-wide expectation: the criterion is only fully satisfied when EVERY application in the repo passes.

- **AGENTS.md File** (`agents_md`): [0/1] - No AGENTS.md file exists at repository root.
  Description: Repository has an AGENTS.md file with instructions for autonomous agents
  Evaluation instructions: AGENTS.md exists at repo root – Check for AGENTS.md file in repository root directory. File should document essentials for autonomous agents like: npm/bun/yarn scripts (TS/JS), pip/venv/poetry setup (Python), build commands, test commands, development workflow, and project-specific conventions. Verify file exists and is not empty (>100 characters). See https://docs.factory.ai/factory-docs/agents-md for reference.

- **README File** (`readme`): [0/1] - No README.md exists at repository root.
  Description: Repository has a README with basic information
  Evaluation instructions: README.md exists at repo root with setup/usage instructions.

- **Automated Documentation Generation** (`automated_doc_generation`): [0/1] - No doc generation tooling or workflows (OpenAPI, JSDoc, changelog generators).
  Description: System automatically generates or updates technical documentation
  Evaluation instructions: Automated documentation generation – Tools/workflows that create/update docs. Examples: API doc generators (Swagger/OpenAPI), code comment extractors (JSDoc, Sphinx), architecture diagram generators, droid exec creating docs, changelog generators, or README updaters. Must show evidence of automated doc creation, not just static docs.

- **Skills Configuration** (`skills`): [0/1] - No skills directories (.factory/skills, .skills, .claude/skills) found.
  Description: Repository has skills defined following the Claude skills standard
  Evaluation instructions: Skills configured – Check for skills directories (common locations: `.factory/skills/`, `.skills/`, `.claude/skills/`, walk up to git root). Each skill should be in `{skill-name}/SKILL.md` format with either YAML frontmatter containing at minimum `name` and `description`, or table format (`| name | description |`). Verify at least one valid skill exists with non-empty prompt content. See https://code.claude.com/docs/en/skills for the open standard reference.

- **Documentation Freshness** (`documentation_freshness`): [0/1] - git log since 180 days shows no changes to README/AGENTS/CONTRIBUTING (files do not exist).
  Description: Documentation is kept up-to-date with code changes
  Evaluation instructions: Documentation freshness – Run `git log --since="180 days ago" --name-only -- README.md AGENTS.md CONTRIBUTING.md | grep -E "\.(md)$" | head -1`. PASS if at least one of README.md, AGENTS.md, or CONTRIBUTING.md was modified in the last 180 days. This is a simple binary check: key docs updated recently = pass.

- **Service Architecture Documented** (`service_flow_documented`): [0/1] - No architecture diagrams, mermaid/plantuml files, or service dependency docs.
  Description: Architecture diagrams and service dependencies are documented
  Evaluation instructions: Service architecture documented – Check for: 1) Architecture diagram files (*.mermaid, *.puml, *.plantuml, docs/architecture*, docs/diagrams*). 2) Service dependency documentation showing external services, APIs, or databases the application calls. 3) Images in README/docs with names containing "architecture", "flow", "diagram", "sequence". PASS if any architecture diagrams OR service dependency documentation exists.

- **AGENTS.md Freshness Validation** (`agents_md_validation`): [0/1] - Prerequisite agents_md fails; no CI or tooling validating AGENTS.md.
  Description: Automation validates AGENTS.md stays consistent with code
  Evaluation instructions: AGENTS.md validation – Check for automation that validates AGENTS.md stays consistent with code. Look for: 1) CI job that checks AGENTS.md commands still work. 2) Automated AGENTS.md generation/update (droid that updates it). 3) Pre-commit hook validating AGENTS.md commands. 4) Documentation testing (running commands from docs). 5) Link checker for AGENTS.md references. PASS if any validation of AGENTS.md accuracy exists. PREREQUISITE: agents_md must pass.

- **Dev Container** (`devcontainer`): [0/1] - No .devcontainer/devcontainer.json exists.
  Description: Project has a development container configuration
  Evaluation instructions: Dev container configured – .devcontainer/devcontainer.json with Node.js & TS extensions (TS) or Python image with pip/poetry (Py)

- **Environment Template** (`env_template`): [0/1] - No .env.example and no environment variable documentation anywhere.
  Description: .env.example or documented environment variables
  Evaluation instructions: Environment template – .env.example file exists or environment variables are documented in README/AGENTS.md. Without knowing required env vars, agents cannot run the application locally. Absolute blocker.

- **Structured Logging** (`structured_logging`): [0/1] - No logging library or dedicated logger module exists.
  Description: Project uses structured logging for better observability
  Evaluation instructions: Structured logging – Check for logging library in dependencies: TS/JS (winston, pino, bunyan, log4js in package.json), Python (structlog, loguru, python-json-logger in requirements/pyproject.toml), or custom logger module (src/logger.*, lib/logging.*). PASS if any logging library is installed OR a dedicated logger module exists.

- **Distributed Tracing** (`distributed_tracing`): [0/1] - No trace/request ID propagation or OpenTelemetry instrumentation.
  Description: Application implements request tracing
  Evaluation instructions: Check for trace ID or request ID propagation through the application (OpenTelemetry, X-Request-ID headers, etc.) that allows following a request through the system.

- **Metrics Collection** (`metrics_collection`): [0/1] - No metrics/telemetry instrumentation (Prometheus, Datadog, etc.).
  Description: Engineering telemetry for performance monitoring
  Evaluation instructions: Check for metrics/telemetry instrumentation (Datadog, Axiom, Prometheus, New Relic, CloudWatch, etc.) for understanding application performance.

- **Error Tracking Contextualized** (`error_tracking_contextualized`): [0/1] - No Sentry/Bugsnag/Rollbar configuration.
  Description: Sentry/Bugsnag with source maps and breadcrumbs
  Evaluation instructions: Error tracking contextualized – Sentry, Bugsnag, or Rollbar is configured with source maps, breadcrumbs, and user context. Agents can trace production errors back to specific code paths with full stack traces.

- **Alerting Configured** (`alerting_configured`): [0/1] - No PagerDuty/OpsGenie/custom alerting rules defined.
  Description: PagerDuty/OpsGenie or alert rules defined
  Evaluation instructions: Alerting configured – PagerDuty, OpsGenie, or custom alerting rules are defined. The system actively notifies when things go wrong rather than waiting for someone to notice. Prerequisite for incident response.

- **Runbooks Documented** (`runbooks_documented`): [0/1] - No runbooks/playbooks documentation or external incident-response pointers.
  Description: Incident response playbooks exist
  Evaluation instructions: Runbooks documented – Look for external pointers to runbooks/playbooks (links to Notion, Confluence, internal wiki, or dedicated runbooks/ directory). Check README, AGENTS.md, or docs/ for references to incident response procedures. PASS if any documentation points to runbooks, even if hosted externally.

- **Deployment Observability** (`deployment_observability`): [0/1] - No dashboard references, deploy notifications, or observability pointers.
  Description: Can see deploy impact in real-time
  Evaluation instructions: Deployment observability – Look for pointers to monitoring dashboards (Datadog, Grafana, New Relic links in docs or code comments). Check for deploy notification integrations (Slack webhooks, deployment annotations in monitoring). PASS if documentation references where to check deploy impact, even if dashboards are hosted externally.

- **CODEOWNERS File** (`codeowners`): [0/1] - No CODEOWNERS file in root or .github/.
  Description: Repository has a CODEOWNERS file to assign ownership
  Evaluation instructions: CODEOWNERS file exists – in root or .github/ directory with valid team assignments

- **Dependency Update Automation** (`dependency_update_automation`): [0/1] - No dependabot.yml or renovate config; no dependencies exist.
  Description: Dependabot or Renovate configured
  Evaluation instructions: Dependency update automation – Dependabot, Renovate, or similar is configured and creating PRs for dependency updates. Keeps dependencies current automatically, reducing security vulnerability window.

- **Gitignore Comprehensive** (`gitignore_comprehensive`): [0/1] - No .gitignore exists at all.
  Description: .gitignore excludes secrets and build artifacts
  Evaluation instructions: Gitignore comprehensive – .gitignore properly excludes .env files (not .env.example), node_modules, build artifacts, IDE configs (.idea, .vscode), and OS files (.DS_Store). Prevents agents from accidentally committing secrets or generated files.

- **Secrets Management** (`secrets_management`): [0/1] - No secrets manager, encrypted secrets, or env var handling pattern; no .env.example.
  Description: Secure secrets management infrastructure configured
  Evaluation instructions: Secrets management – Check for secure secrets management infrastructure. Look for: 1) Cloud secrets manager integration (AWS Secrets Manager, GCP Secret Manager, Azure Key Vault, HashiCorp Vault) in code or config. 2) Environment variable documentation pointing to secrets manager. 3) GitHub Actions secrets usage (secrets.* references without hardcoded values). 4) SOPS, age, or similar encrypted secrets in repo. 5) .env files properly gitignored with .env.example template. FAIL if secrets appear hardcoded or no secrets management pattern is evident.

- **Sensitive Data Log Scrubbing** (`log_scrubbing`): [0/1] - No log redaction/sanitization mechanisms or documented logging guidelines.
  Description: Log sanitization/scrubbing mechanisms configured
  Evaluation instructions: Log scrubbing – Check for log sanitization/scrubbing mechanisms. Look for: 1) Logging library with redaction support configured (pino redact, winston format with filtering, structlog processors). 2) Custom log sanitization middleware or utilities (grep for 'redact', 'sanitize', 'mask' in logging code). 3) Log scrubbing documentation in AGENTS.md or logging guidelines. 4) PII filtering patterns in log configuration. PASS if any log sanitization mechanism is configured or documented.

- **Minimum Dependency Release Age** (`min_release_age`): [0/1] - No renovate minimumReleaseAge/stabilityDays, dependency policy, or release-age CI checks.
  Description: Dependencies are not adopted immediately after release, mitigating supply chain attacks
  Evaluation instructions: Minimum dependency release age – Check for policies or tooling that enforce a minimum waiting period before adopting new dependency releases. Look for: 1) Renovate configured with `minimumReleaseAge` or `stabilityDays` (or an equivalent delay gate). 2) A documented dependency-update policy that explicitly requires waiting N days before merging version bumps. 3) Custom CI checks that verify the target release date is at least N days old. PASS only if there is an explicit delay (not just centralized updates or signature/provenance verification).

- **Issue Templates** (`issue_templates`): [0/1] - No .github/ISSUE_TEMPLATE or .gitlab/issue_templates directory.
  Description: Structured issue templates exist
  Evaluation instructions: Issue templates – .github/ISSUE_TEMPLATE/ (GitHub) or .gitlab/issue_templates/ (GitLab) directory exists with structured templates for bugs, features, etc. Teaches agents what information to provide when creating issues.

- **Issue Labeling System** (`issue_labeling_system`): [0/1] - No label conventions or evidence of a labeling system; repo unreachable.
  Description: Consistent priority/type/area labels
  Evaluation instructions: Issue labeling system – Consistent labels exist for priority (P0-P3 or critical/high/medium/low), type (bug, feature, chore), and area (frontend, backend, infra). Enables agents to filter and prioritize work programmatically.

- **Backlog Health** (`backlog_health`): [0/1] - Remote repo unreachable (404); no verifiable open issues with titles/labels.
  Description: Issues have clear titles and recent activity
  Evaluation instructions: Backlog health – Issues have clear titles and recent activity. If `gh` or `glab` CLI is available and authenticated, run `gh issue list --state open --limit 50 --json title,createdAt,labels`. Count issues with: 1) titles > 10 characters, 2) at least one label. PASS if >70% of open issues have both a descriptive title (>10 chars) AND at least one label. Also check `gh issue list --state open --json createdAt` - FAIL if >50% of issues are older than 365 days with no recent comments. Skip if `gh`/`glab` CLI is not available or not authenticated.

- **PR Templates** (`pr_templates`): [0/1] - No pull request template exists.
  Description: Pull request templates exist
  Evaluation instructions: PR templates – .github/pull_request_template.md (GitHub) or merge request templates (GitLab) exist with sections for description, testing done, and relevant context. Ensures agent PRs include necessary information for reviewers.

- **Product Analytics Instrumentation** (`product_analytics_instrumentation`): [0/1] - No product analytics (Mixpanel, Amplitude, PostHog, GA4) instrumentation.
  Description: Mixpanel/Amplitude/PostHog instrumented
  Evaluation instructions: Product analytics instrumentation – Mixpanel, Amplitude, PostHog, Heap, or GA4 is instrumented in the application. Agents can see whether features are actually used and measure the impact of their changes on user behavior.

- **Error to Insight Pipeline** (`error_to_insight_pipeline`): [0/1] - No Sentry-issue integration, webhooks, or error-to-issue automation.
  Description: Errors flow from tracking to actionable issues
  Evaluation instructions: Error to insight pipeline – Check for Sentry-GitHub/GitLab integration: search for sentry.io webhook in .github/workflows or repo settings, OR Sentry issue linking config (SENTRY_ORG, SENTRY_PROJECT in env). Also check for error-to-issue automation: GitHub Actions that create issues from errors, or PagerDuty/OpsGenie integrations with issue creation. PASS if any error tracking tool has issue creation integration configured.

## Your Task

**Step 1:** Group the failing signals above by their category. Ask the user which category they want to fix using the AskUser tool. Only show categories that have at least one failing signal.

**Step 2:** Based on the chosen category, present each failing signal in that category as an option in a single AskUser call. Each option is exactly one signal (with its name and current score). The user picks one signal to fix. Do NOT say "select all that apply" or "select one or more".

After the user selects a signal, fix it.

## Fix Instructions

For each signal you are fixing:
1. Explore the repository to understand the current state related to the signal
2. Make **substantive improvements** to the codebase that genuinely address the signal
3. Verify your fix addresses the issue (e.g., run linter if fixing lint_config, run tests if adding tests)
4. Keep changes focused on the signal - don't refactor unrelated code

## Completion

- Provide a succinct summary of what you changed and why it genuinely improves the codebase

## CRITICAL: Quality Standards

Your fix must **genuinely improve the codebase**. Do NOT use workarounds or shortcuts:

- **NO** empty placeholder files (e.g., empty test files, stub configs)
- **NO** minimal implementations that technically pass but provide no real value
- **NO** disabling checks or adding skip markers to pass validation
- **NO** trivial changes that game the metric without improving quality

Examples of BAD fixes:
- Adding an empty `test.js` file to satisfy "has tests" criterion
- Creating a `.eslintrc` that disables all rules
- Adding `// @ts-nocheck` to satisfy TypeScript requirements

Examples of GOOD fixes:
- Writing actual unit tests with meaningful assertions for existing code
- Configuring ESLint with appropriate rules for the project's language/framework
- Adding proper TypeScript types to improve type safety
</system-reminder>