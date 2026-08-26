// M4: produce a lightweight inline markdown badge from an agent-readiness report.
// No external dependency; emits a shields.io-style static URL badge.
import type { ReadinessReport } from './engine.ts';

const LEVEL_LABEL: Record<string, string> = {
  L0: 'L0/unknown',
  L1: 'L1/functional',
  L2: 'L2/documented',
  L3: 'L3/standardized',
  L4: 'L4/optimized',
  L5: 'L5/autonomous',
};
const LEVEL_COLOR: Record<string, string> = {
  L0: 'lightgrey',
  L1: 'red',
  L2: 'orange',
  L3: 'yellow',
  L4: 'blue',
  L5: 'brightgreen',
};

export function badgeMarkdown(report: ReadinessReport): string {
  const label = encodeURIComponent('agent-readiness');
  const level = LEVEL_LABEL[report.level] || report.level;
  const msg = encodeURIComponent(level + ' ' + report.overall + '/100');
  const color = LEVEL_COLOR[report.level] || 'lightgrey';
  const url = 'https://img.shields.io/badge/' + label + '-' + msg + '-' + color;
  return '[![' + label + '](' + url + ')](docs/validation/latest.md)';
}
