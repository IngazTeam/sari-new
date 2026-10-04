import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
const root = "docs/audits/tenant-features-2026-09-28";
const baseline = JSON.parse(
  readFileSync(`${root}/feature-baseline.json`, "utf8")
);
const current = JSON.parse(
  readFileSync("docs/audits/tenant-features-2026-09-30/inventory.json", "utf8")
);
const transitions = JSON.parse(
  readFileSync(
    "docs/audits/tenant-features-2026-09-30/api-transitions.json",
    "utf8"
  )
).transitions;
describe("no registered tenant feature API disappears during the redesign", () => {
  it('requires explicit API mappings and evidence for newly reconciled transitions', () => {
    const reviewed = transitions.filter((change: any) => change.reviewedIn >= 508);
    expect(reviewed.length).toBeGreaterThan(0);
    for (const change of reviewed) {
      expect(change.evidence.length, change.routes.join(', ')).toBeGreaterThan(0);
      expect(change.featureMappings.map((entry: any) => entry.before).sort()).toEqual([...change.removed].sort());
      const replacements = [...new Set(change.featureMappings.flatMap((entry: any) => entry.after))].sort();
      expect(replacements).toEqual([...change.required].sort());
      if (change.featureMappings.some((entry: any) => entry.after.length === 0))
        expect(change.checks.length, 'Relocation or static guidance must have a checked destination/source').toBeGreaterThan(0);
    }
  });
  it.each(baseline.routes)(
    "preserves reads and actions for $route",
    (before: any) => {
      const after = current.routes.find((r: any) => r.route === before.route);
      expect(after).toBeTruthy();
      const changes = transitions.filter((r: any) =>
        r.routes.includes(before.route)
      );
      const replaced = [
        ...(baseline.approvedReplacements.find(
          (r: any) => r.route === before.route
        )?.removed || []),
        ...changes.flatMap((r: any) => r.removed),
      ];
      for (const type of ["queries", "mutations"])
        for (const api of before[type])
          if (!replaced.includes(api))
            expect(after[type], `${before.route}: ${api}`).toContain(api);
      for (const change of changes) {
        expect(change.note).toBeTruthy();
        for (const evidence of change.evidence)
          expect(existsSync(evidence), evidence).toBe(true);
        for (const required of change.required)
          expect(
            [...after.queries, ...after.mutations],
            before.route
          ).toContain(required);
        for (const check of change.checks) {
          if (check.file)
            expect(readFileSync(check.file, "utf8")).toContain(check.contains);
          else {
            const moved = current.routes.find(
              (r: any) => r.route === check.route
            );
            expect([...moved.queries, ...moved.mutations]).toContain(check.api);
          }
        }
      }
    }
  );
});
