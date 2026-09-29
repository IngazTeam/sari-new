import { useState } from "react";
import { useTranslation } from "react-i18next";
import { agentDraft, compareAgentDraft } from "@shared/virtual-agent-review";
import type { VirtualAgentDraft } from "@shared/virtual-agent-form";
import { Button } from "@/components/ui/button";

type Agent = Parameters<typeof agentDraft>[0] & {
  id: number;
  sortOrder: number;
};
export type TeamReview = {
  agents: Agent[];
  revision: string;
  canManage: boolean;
};

export function VirtualAgentReview({
  latest,
  editing,
  base,
  draft,
  onApply,
}: {
  latest: TeamReview;
  editing: number | null;
  base: VirtualAgentDraft;
  draft: VirtualAgentDraft;
  onApply: (draft: VirtualAgentDraft, base: VirtualAgentDraft) => void;
}) {
  const { t } = useTranslation();
  const labels = {
    name: t("virtualTeamUx.name"),
    role: t("virtualTeamUx.role"),
    department: t("virtualTeamUx.department"),
    personalityPrompt: t("virtualTeamUx.instructions"),
    tone: t("virtualTeamUx.tone"),
    avatarEmoji: t("virtualTeamUx.avatar"),
    isDefault: t("virtualTeamUx.default"),
    isActive: t("virtualTeamUx.active"),
    triggerKeywords: t("virtualTeamUx.keywordsLabel"),
    shiftStart: t("virtualTeamReview.shiftStart"),
    shiftEnd: t("virtualTeamReview.shiftEnd"),
  } as const;
  const [choices, setChoices] = useState<
    Partial<Record<keyof VirtualAgentDraft, "mine" | "saved">>
  >({});
  const row = latest.agents.find(a => a.id === editing);
  const current = row ? agentDraft(row) : base;
  const comparison = compareAgentDraft(base, draft, current);
  const missing = editing !== null && !row;
  const tones: Record<string, string> = {
    friendly: t("virtualTeamUx.tones.friendly"),
    professional: t("virtualTeamUx.tones.professional"),
    casual: t("virtualTeamUx.tones.casual"),
    empathetic: t("virtualTeamUx.tones.empathetic"),
    persuasive: t("virtualTeamUx.tones.persuasive"),
  };
  const avatars: Record<string, string> = {
    support: t("virtualTeamUx.avatars.support"),
    sales: t("virtualTeamUx.avatars.sales"),
    reception: t("virtualTeamUx.avatars.reception"),
    manager: t("virtualTeamUx.avatars.manager"),
    tech: t("virtualTeamUx.avatars.tech"),
    marketing: t("virtualTeamUx.avatars.marketing"),
    consultant: t("virtualTeamUx.avatars.consultant"),
    creative: t("virtualTeamUx.avatars.creative"),
    analyst: t("virtualTeamUx.avatars.analyst"),
    hr: t("virtualTeamUx.avatars.hr"),
    finance: t("virtualTeamUx.avatars.finance"),
    default: t("virtualTeamUx.avatars.default"),
  };
  const value = (key: string, v: VirtualAgentDraft[keyof VirtualAgentDraft]) =>
    typeof v === "boolean"
      ? t(v ? "virtualTeamReview.yes" : "virtualTeamReview.no")
      : Array.isArray(v)
        ? v.join("، ") || t("virtualTeamReview.empty")
        : (key === "tone"
            ? tones[v]
            : key === "avatarEmoji"
              ? avatars[v]
              : undefined) ||
          v ||
          t("virtualTeamReview.empty");
  return (
    <section
      aria-label={t("virtualTeamReview.title")}
      className="space-y-4 rounded-xl border border-primary/30 bg-muted/30 p-4"
    >
      <h3 className="font-semibold">{t("virtualTeamReview.title")}</h3>
      <p className="text-sm text-muted-foreground">
        {t("virtualTeamReview.reviewHelp")}
      </p>
      <details className="rounded-lg border p-3" open>
        <summary className="cursor-pointer font-medium">
          {t("virtualTeamReview.currentTeam")}
        </summary>
        <ol className="mt-3 space-y-2">
          {latest.agents.map((a, index) => (
            <li key={a.id} className="rounded-lg border bg-card p-3 text-sm">
              <details>
                <summary className="cursor-pointer break-words">
                  {index + 1}. {a.name} · {a.role} ·{" "}
                  {t(
                    a.isActive ? "virtualTeamUx.active" : "virtualTeamUx.paused"
                  )}
                  {a.isDefault ? ` · ${t("virtualTeamUx.default")}` : ""}
                </summary>
                <dl className="mt-3 space-y-2">
                  {Object.entries(agentDraft(a)).map(([key, v]) => (
                    <div key={key}>
                      <dt className="font-medium">
                        {labels[key as keyof typeof labels]}
                      </dt>
                      <dd className="whitespace-pre-wrap [overflow-wrap:anywhere]">
                        {value(key, v)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </details>
            </li>
          ))}
        </ol>
        {!latest.agents.length && (
          <p className="mt-2 text-sm">{t("virtualTeamUx.empty")}</p>
        )}
      </details>
      {missing ? (
        <p role="alert" className="text-sm text-destructive">
          {t("virtualTeamReview.missing")}
        </p>
      ) : (
        <>
          {comparison.changed.map(key => (
            <fieldset
              key={key}
              className="min-w-0 space-y-2 rounded-lg border bg-card p-3"
            >
              <legend className="px-1 text-sm font-semibold">
                {labels[key]}
              </legend>
              <div className="grid min-w-0 gap-3 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-muted-foreground">
                    {t("virtualTeamReview.saved")}
                  </p>
                  <p className="max-h-40 overflow-auto whitespace-pre-wrap [overflow-wrap:anywhere]">
                    {value(key, current[key])}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">
                    {t("virtualTeamReview.mine")}
                  </p>
                  <p className="max-h-40 overflow-auto whitespace-pre-wrap [overflow-wrap:anywhere]">
                    {value(key, draft[key])}
                  </p>
                </div>
              </div>
              {comparison.conflicts.includes(key) ? (
                <div className="flex flex-wrap gap-3 text-sm">
                  {(["saved", "mine"] as const).map(choice => (
                    <label
                      key={choice}
                      className="flex min-h-11 cursor-pointer items-center gap-2"
                    >
                      <input
                        type="radio"
                        name={`review-${key}`}
                        checked={choices[key] === choice}
                        onChange={() =>
                          setChoices(old => ({ ...old, [key]: choice }))
                        }
                      />
                      {t(
                        choice === "mine"
                          ? "virtualTeamReview.chooseMine"
                          : "virtualTeamReview.chooseSaved"
                      )}
                    </label>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {t("virtualTeamReview.mergeUnchanged")}
                </p>
              )}
            </fieldset>
          ))}
          <Button
            type="button"
            className="min-h-11 whitespace-normal"
            disabled={
              !latest.canManage ||
              comparison.conflicts.some(key => !choices[key])
            }
            onClick={() => {
              const merged = { ...comparison.merged };
              for (const key of comparison.conflicts)
                if (choices[key] === "saved")
                  Object.assign(merged, { [key]: current[key] });
              onApply(merged, current);
            }}
          >
            {t("virtualTeamReview.applyReview")}
          </Button>
        </>
      )}
    </section>
  );
}
