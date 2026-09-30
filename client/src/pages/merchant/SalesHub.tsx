import { KnowledgeWorkspaceScope } from "@/components/KnowledgeWorkspaceScope";
import { QuotationWorkspace } from "@/components/merchant/QuotationWorkspace";
export default function SalesHub() {
  return (
    <KnowledgeWorkspaceScope slot="sales-hub">
      {scope => <QuotationWorkspace key={scope} scope={scope} />}
    </KnowledgeWorkspaceScope>
  );
}
