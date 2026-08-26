# agent-readiness task shortcuts
# One-command setup: make setup   (installs pinned deps from lockfile)
.PHONY: setup test lint typecheck build format ci

setup: ## Install pinned dependencies (one-command setup)
	npm ci

test: ## Run the full test suite
	npm test

lint: ## Lint (ESLint)
	npm run lint

typecheck: ## Strict type-check (tsc --noEmit)
	npm run typecheck

build: ## Type-check build (no emit)
	npm run build

format: ## Format with Prettier
	npm run format

ci: test lint typecheck ## Everything CI runs
