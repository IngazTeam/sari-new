import { KnowledgeWorkspaceScope } from "@/components/KnowledgeWorkspaceScope";
import { QuotationTemplateWorkspace } from "@/components/merchant/QuotationTemplateWorkspace";
export default function QuotationTemplates() {
  return (
    <KnowledgeWorkspaceScope slot="quotation-templates">
      {scope => <QuotationTemplateWorkspace key={scope} scope={scope} />}
    </KnowledgeWorkspaceScope>
  );
}
