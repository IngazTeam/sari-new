import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { setupCatalogDraft } from "@shared/setup-catalog";
import { knowledgeCacheEpoch } from "@/lib/knowledge-workspace-cache";
import {
  buildSetupWebsitePreview,
  setupWebsitePreview,
  setupWebsiteUrl,
  setupWebsitePatch,
  validSetupWebsiteProfile,
  readSetupWebsiteChoices,
  type SetupWebsitePreview,
  type SetupWebsiteChoices,
  type SetupWebsiteProfileKey,
} from "@/lib/setup-website-draft";

interface WebsiteStepProps {
  wizardData: Record<string, any>;
  updateWizardData: (data: Record<string, any>) => void;
  goToNextStep: () => void;
  skipStep: () => void;
}
const text = (value: unknown) => (typeof value === "string" ? value : "");
const pageSize = 20;

export default function WebsiteStep({
  wizardData,
  updateWizardData,
  goToNextStep,
  skipStep,
}: WebsiteStepProps) {
  const { t } = useTranslation();
  const restored = setupWebsitePreview.safeParse(wizardData.websitePreview);
  const [preview, setPreview] = useState<SetupWebsitePreview | null>(
    restored.success ? restored.data : null
  );
  const [url, setUrl] = useState(
    text(wizardData.websiteInputUrl ?? wizardData.websiteUrl)
  );
  const [choices, setChoiceState] = useState<SetupWebsiteChoices>(() =>
    readSetupWebsiteChoices(
      wizardData.websitePreviewChoices,
      restored.success ? restored.data : null
    )
  );
  const setChoices = (
    change: (old: SetupWebsiteChoices) => SetupWebsiteChoices
  ) => {
    const next = change(choices);
    setChoiceState(next);
    if (preview)
      updateWizardData({
        websitePreviewChoices: { ...next, previewId: preview.id },
      });
  };
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(0);
  const requestRef = useRef(0),
    busyRef = useRef(false),
    epoch = useRef(knowledgeCacheEpoch());
  const mutation = trpc.analysis.previewAnalysis.useMutation();
  useEffect(
    () => () => {
      requestRef.current++;
    },
    []
  );
  const applied = preview?.id === wizardData.websitePreviewAppliedId;
  let sourceMatches = false;
  try {
    sourceMatches = preview?.sourceUrl === setupWebsiteUrl(url);
  } catch {}
  let patch: Record<string, unknown> | null = null,
    choiceError = "";
  if (preview)
    try {
      patch = setupWebsitePatch(wizardData, preview, choices);
    } catch (cause) {
      choiceError = t(
        cause instanceof Error && cause.message === "SETUP_WEBSITE_LIMIT"
          ? "setupWebsiteUx.limit"
          : cause instanceof Error &&
              cause.message === "SETUP_WEBSITE_DRAFT_INVALID"
            ? "setupWebsiteUx.invalidDraft"
            : cause instanceof Error &&
                cause.message === "SETUP_WEBSITE_DRAFT_TOO_LARGE"
              ? "setupWebsiteUx.tooLarge"
              : "setupWebsiteUx.invalidChoice"
      );
    }
  const labels: Record<SetupWebsiteProfileKey, string> = {
    businessName: t("setupWorkspace.nameLabel"),
    phone: t("setupWorkspace.phoneLabel"),
    address: t("setupApprovalUx.address"),
    description: t("setupApprovalUx.description"),
    businessType: t("setupWorkspace.businessType"),
  };
  const profileValue = (key: SetupWebsiteProfileKey, raw: unknown) =>
    key === "businessType" && ["store", "services", "both"].includes(text(raw))
      ? t(
          raw === "store"
            ? "setupWorkspace.storeTitle"
            : raw === "services"
              ? "setupWorkspace.servicesTitle"
              : "setupWorkspace.bothTitle"
        )
      : text(raw) || t("setupWorkspace.notProvided");
  const analyze = async () => {
    if (busyRef.current) return;
    let sourceUrl: string;
    try {
      sourceUrl = setupWebsiteUrl(url);
    } catch {
      setError(t("setupWebsiteUx.urlInvalid"));
      return;
    }
    const request = ++requestRef.current;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await mutation.mutateAsync({ websiteUrl: sourceUrl });
      if (
        request !== requestRef.current ||
        epoch.current !== knowledgeCacheEpoch()
      )
        return;
      let proposal: SetupWebsitePreview;
      try {
        proposal = buildSetupWebsitePreview(
          result,
          sourceUrl,
          crypto.randomUUID()
        );
      } catch {
        setError(t("setupWebsiteUx.invalidResult"));
        return;
      }
      const nextChoices = readSetupWebsiteChoices(null, proposal);
      setPreview(proposal);
      setChoiceState(nextChoices);
      setPage(0);
      setUrl(sourceUrl);
      // Persist the proposal only. Applying reviewed choices is a separate action.
      updateWizardData({
        websiteInputUrl: sourceUrl,
        websitePreview: proposal,
        websitePreviewChoices: { ...nextChoices, previewId: proposal.id },
      });
    } catch (cause: any) {
      if (
        request !== requestRef.current ||
        epoch.current !== knowledgeCacheEpoch()
      )
        return;
      setError(
        t(
          cause?.data?.code === "TOO_MANY_REQUESTS"
            ? "setupWebsiteUx.rateLimited"
            : cause?.data?.code === "FORBIDDEN" ||
                cause?.data?.code === "UNAUTHORIZED"
              ? "setupWebsiteUx.accessDenied"
              : "setupWebsiteUx.failed"
        )
      );
    } finally {
      if (request === requestRef.current) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  };
  const apply = () => {
    if (
      !preview ||
      applied ||
      busy ||
      !sourceMatches ||
      !patch ||
      epoch.current !== knowledgeCacheEpoch()
    )
      return;
    updateWizardData(patch);
    goToNextStep();
  };
  const chooseProduct = (id: string, checked: boolean) =>
    setChoices(old => ({
      ...old,
      productIds: checked
        ? [...old.productIds.filter(v => v !== id), id]
        : old.productIds.filter(v => v !== id),
    }));
  const download = () => {
    if (!preview) return;
    const objectUrl = URL.createObjectURL(
      new Blob([JSON.stringify(preview, null, 2)], { type: "application/json" })
    );
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = "sary-website-suggestions.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  };
  return (
    <div className="ms-website-entry space-y-5">
      <p>{t("setupWebsiteUx.intro")}</p>
      <label className="ms-catalog-field" htmlFor="setup-website-url">
        {t("setupWorkspace.reviewWebsite")}
      </label>
      <div className="ms-actions">
        <Input
          id="setup-website-url"
          type="url"
          inputMode="url"
          dir="ltr"
          placeholder="https://example.com"
          value={url}
          disabled={busy}
          aria-describedby={error ? "setup-website-error" : undefined}
          onChange={event => {
            setUrl(event.target.value);
            setError("");
            updateWizardData({ websiteInputUrl: event.target.value });
          }}
          onKeyDown={event => {
            if (event.key === "Enter") {
              event.preventDefault();
              void analyze();
            }
          }}
        />
        <Button onClick={analyze} disabled={busy || !url.trim()}>
          {busy ? (
            <Loader2 aria-hidden="true" className="animate-spin" />
          ) : (
            <Search aria-hidden="true" />
          )}
          {t(busy ? "websiteStep.auto_1" : "websiteStep.auto_2")}
        </Button>
      </div>
      {error && (
        <p id="setup-website-error" role="alert">
          {error}
        </p>
      )}
      {busy && <p role="status">{t("setupWebsiteUx.analyzing")}</p>}
      {wizardData.websitePreview && !restored.success && !preview && (
        <p role="alert">{t("setupWebsiteUx.unreadable")}</p>
      )}
      {!preview && wizardData.websiteAnalysis?.confirmed && (
        <p>{t("setupWebsiteUx.previouslyReviewed")}</p>
      )}
      {preview && (
        <section
          className="space-y-5"
          aria-label={t("setupWebsiteUx.review")}
          aria-busy={busy}
        >
          <header className="space-y-2">
            <h2>{t("setupWebsiteUx.review")}</h2>
            <p dir="ltr" className="break-all">
              {preview.sourceUrl}
            </p>
            <p>{t("setupWebsiteUx.estimates")}</p>
            <p>
              {t("setupWebsiteUx.counts", {
                products: preview.products.length,
                pages: preview.pageCount ?? "—",
                faqs: preview.faqCount ?? "—",
              })}
            </p>
            <p>{t("setupApprovalUx.websiteAttribution")}</p>
            {applied && <p role="status">{t("setupWebsiteUx.applied")}</p>}
            {!sourceMatches && (
              <p role="alert">{t("setupWebsiteUx.sourceChanged")}</p>
            )}
          </header>
          <fieldset
            disabled={busy || applied || !sourceMatches}
            className="space-y-5 min-w-0"
          >
            <section
              className="ms-catalog-item space-y-3"
              aria-label={t("setupWorkspace.reviewCatalog")}
            >
              <h3>{t("setupWebsiteUx.products")}</h3>
              <p>{t("setupWebsiteUx.selectHelp")}</p>
              <label className="ms-catalog-field">
                {t("setupWebsiteUx.catalogAction")}
                <select
                  value={choices.catalog}
                  onChange={e =>
                    setChoices(old => ({
                      ...old,
                      catalog: e.target.value as SetupWebsiteChoices["catalog"],
                    }))
                  }
                >
                  <option value="merge">{t("setupWebsiteUx.merge")}</option>
                  <option value="replace">{t("setupWebsiteUx.replace")}</option>
                  <option value="skip">{t("setupWebsiteUx.skip")}</option>
                </select>
              </label>
              {choices.catalog === "replace" && (
                <p role="alert">{t("setupWebsiteUx.replaceHelp")}</p>
              )}
              {preview.products.length === 0 ? (
                <p>{t("setupWebsiteUx.empty")}</p>
              ) : (
                <>
                  <p role="status">
                    {t("setupWebsiteUx.selected", {
                      count: choices.productIds.length,
                      total: preview.products.length,
                    })}
                  </p>
                  <div className="ms-actions">
                    <Button
                      variant="outline"
                      onClick={() =>
                        setChoices(old => ({ ...old, productIds: [] }))
                      }
                    >
                      {t("setupWebsiteUx.clearSelection")}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() =>
                        setChoices(old => ({
                          ...old,
                          productIds: Array.from(
                            new Set([
                              ...old.productIds,
                              ...preview.products
                                .slice(page * pageSize, (page + 1) * pageSize)
                                .map(row => row.id),
                            ])
                          ),
                        }))
                      }
                    >
                      {t("setupWebsiteUx.selectPage")}
                    </Button>
                  </div>
                  <ol className="ms-website-products">
                    {preview.products
                      .slice(page * pageSize, (page + 1) * pageSize)
                      .map((row, index) => (
                        <li key={row.id}>
                          <label className="ms-website-pick">
                            <input
                              type="checkbox"
                              checked={choices.productIds.includes(row.id)}
                              onChange={e =>
                                chooseProduct(row.id, e.target.checked)
                              }
                            />
                            <strong>
                              {row.name || t("setupDraftUx.unnamed")}{" "}
                              <small>#{page * pageSize + index + 1}</small>
                            </strong>
                          </label>
                          <p>
                            {t("setupCatalogUx.price")}:{" "}
                            <bdi>
                              {row.price || t("setupWorkspace.notProvided")}{" "}
                              {row.currency}
                            </bdi>
                          </p>
                          {!setupCatalogDraft.safeParse({ products: [row] })
                            .success && (
                            <p>{t("setupCatalogUx.extractedPriceReview")}</p>
                          )}
                          <details>
                            <summary>{t("setupCatalogUx.more")}</summary>
                            <p>{row.description}</p>
                            {row.category && (
                              <p>
                                {t("setupApprovalUx.category")}: {row.category}
                              </p>
                            )}
                            {row.websiteOriginalPrice && (
                              <p>
                                {t("setupCatalogUx.sourcePrice", {
                                  value: row.websiteOriginalPrice,
                                })}
                              </p>
                            )}
                            {row.productUrl && (
                              <a
                                href={row.productUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                dir="ltr"
                                className="block break-all"
                              >
                                {row.productUrl}
                              </a>
                            )}
                            {row.imageUrl && (
                              <a
                                href={row.imageUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block break-all"
                              >
                                {t("setupApprovalUx.viewImage")}
                              </a>
                            )}
                          </details>
                        </li>
                      ))}
                  </ol>
                  {preview.products.length > pageSize && (
                    <nav
                      className="ms-actions"
                      aria-label={t("setupWebsiteUx.pagination")}
                    >
                      <Button
                        variant="outline"
                        disabled={page === 0}
                        onClick={() => setPage(p => p - 1)}
                      >
                        {t("setupWizard.auto_0")}
                      </Button>
                      <span>
                        {t("setupWebsiteUx.page", {
                          current: page + 1,
                          total: Math.ceil(preview.products.length / pageSize),
                        })}
                      </span>
                      <Button
                        variant="outline"
                        disabled={
                          (page + 1) * pageSize >= preview.products.length
                        }
                        onClick={() => setPage(p => p + 1)}
                      >
                        {t("basicInfoStep.auto_3")}
                      </Button>
                    </nav>
                  )}
                </>
              )}
            </section>
            {Object.keys(preview.profile).length > 0 && (
              <section
                className="ms-catalog-item space-y-3"
                aria-label={t("setupWebsiteUx.profile")}
              >
                <h3>{t("setupWebsiteUx.profile")}</h3>
                <p>{t("setupWebsiteUx.profileHelp")}</p>
                {(Object.keys(preview.profile) as SetupWebsiteProfileKey[]).map(
                  key => (
                    <div className="ms-website-profile" key={key}>
                      <label className="ms-website-pick">
                        <input
                          type="checkbox"
                          checked={choices.profile.includes(key)}
                          disabled={
                            !validSetupWebsiteProfile(key, preview.profile[key])
                          }
                          onChange={e =>
                            setChoices(old => ({
                              ...old,
                              profile: e.target.checked
                                ? [...old.profile, key]
                                : old.profile.filter(k => k !== key),
                            }))
                          }
                        />
                        <strong>{labels[key]}</strong>
                      </label>
                      <dl>
                        <div>
                          <dt>{t("setupWebsiteUx.current")}</dt>
                          <dd>{profileValue(key, wizardData[key])}</dd>
                        </div>
                        <div>
                          <dt>{t("setupWebsiteUx.suggested")}</dt>
                          <dd>{profileValue(key, preview.profile[key])}</dd>
                        </div>
                      </dl>
                      {!validSetupWebsiteProfile(key, preview.profile[key]) && (
                        <p role="alert">{t("setupWebsiteUx.invalidProfile")}</p>
                      )}
                    </div>
                  )
                )}
              </section>
            )}
            {choiceError && <p role="alert">{choiceError}</p>}
            <Button onClick={apply} disabled={!patch}>
              {t("setupWebsiteUx.addDraft")}
            </Button>
          </fieldset>
          <details className="ms-details">
            <summary>{t("setupWebsiteUx.contact")}</summary>
            <div className="space-y-2">
              <p>{preview.industry}</p>
              {preview.contact.phones.map((v, i) => (
                <p key={`p${i}`} dir="ltr">
                  {v}
                </p>
              ))}
              {preview.contact.emails.map((v, i) => (
                <p key={`e${i}`} dir="ltr">
                  {v}
                </p>
              ))}
              <p dir="ltr">{preview.contact.whatsapp}</p>
              <p>{preview.contact.address}</p>
              <p>{t("setupWebsiteUx.contactHelp")}</p>
            </div>
          </details>
          <Button variant="outline" onClick={download}>
            {t("setupWebsiteUx.download")}
          </Button>
        </section>
      )}
      <div className="ms-actions">
        <Button onClick={skipStep} variant="ghost">
          {t("setupTemplateUx.back")}
        </Button>
      </div>
    </div>
  );
}
