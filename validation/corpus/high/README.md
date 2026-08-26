# Acme Service

A fast, well-documented service for the Acme platform. It ingests events, transforms them,
and exposes a clean HTTP API. This README covers setup, usage, verification, and structure.

## Usage
run npm start, then verify with npm test. The service listens on :8080.

## Architecture
modules under src/: api (http), domain (core logic), infra (db/queue).

## Examples
see examples/ for request/response samples.

## Contributing
see CONTRIBUTING.md.

## Reproducibility
commit the lockfile and use a devcontainer for deterministic builds.
