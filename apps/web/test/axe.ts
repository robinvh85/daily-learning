/**
 * Automated accessibility check with axe-core in jsdom (plan Phase 7).
 * jsdom has no layout, so `color-contrast` is checked separately (tokens: see README / plan);
 * `region` is off because page tests render a page without the app shell (Layout has the landmarks).
 */
import axe from 'axe-core';
import { expect } from 'vitest';

export async function expectNoAxeViolations(
  container: Element = document.body,
  opts: { allowOutsideLandmarks?: boolean } = { allowOutsideLandmarks: true },
): Promise<void> {
  const results = await axe.run(container, {
    rules: {
      'color-contrast': { enabled: false },
      region: { enabled: !opts.allowOutsideLandmarks },
    },
  });
  const summary = results.violations.map(
    (v) => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.map((n) => n.html).join('\n  ')}`,
  );
  expect(summary).toEqual([]);
}
