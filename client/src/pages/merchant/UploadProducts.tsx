import { useState } from "react";
import { useTranslation } from "react-i18next";
import { KnowledgeWorkspaceScope } from "@/components/KnowledgeWorkspaceScope";
import { ProductImportWorkspace } from "@/components/merchant/ProductImportWorkspace";
import { ProductImportProviderTools } from "@/components/merchant/ProductImportProviderTools";
import { ProductFileAdviceWorkspace } from "@/components/merchant/ProductFileAdviceWorkspace";
function ImportPage({ scope }: { scope: string }) {
  const { t } = useTranslation(),
    [providers, setProviders] = useState(false);
  return (
    <div className="pw-workspace">
      <ProductImportWorkspace
        scope={scope}
        renderAdvice={props => <ProductFileAdviceWorkspace {...props} />}
      />
      <details
        className="pw-panel"
        onToggle={event => setProviders(event.currentTarget.open)}
      >
        <summary>{t("productImportUx.providers")}</summary>
        <p>{t("productImportUx.providersHint")}</p>
        {providers && <ProductImportProviderTools key={scope} />}
      </details>
    </div>
  );
}
export default function UploadProducts() {
  return (
    <KnowledgeWorkspaceScope slot="product-import">
      {scope => <ImportPage key={scope} scope={scope} />}
    </KnowledgeWorkspaceScope>
  );
}
