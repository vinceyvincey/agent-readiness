# agent-readiness

A **pi-native** framework to measure and improve how ready a codebase is for autonomous AI coding agents.

Built after researching Factory.ai's *Agent Readiness* model and the open-source ecosystem that has sprouted around it. The implementation here is deliberately **pi-first**: correctness and feedback loops are assessed with pi's own tools, packaged as a pi **skill** and a pi **extension**.

## Repo layout
- `docs/FRAMEWORK.md` - the model: pillars, levels, scoring, gating
- `docs/RESEARCH_LANDSCAPE.md` - Factory.ai + the OSS tools we surveyed
- `docs/PI_ARCHITECTURE.md` - how it maps to pi (skill + extension)
- `docs/IMPLEMENTATION_PLAN.md` - milestones + acceptance criteria
- `docs/CRITICAL_REVIEWS.md` - critiques from critical-friend agents
- `skills/agent-readiness/` - the skill (SKILL.md + criteria/)
- `.pi/extensions/agent-readiness/` - the extension (commands + tools)

## Status
Planning phase. Research + design committed; skill/extension implementation pending.
