import { KnowledgeWorkspaceScope } from "@/components/KnowledgeWorkspaceScope";
import { PipelineWorkspace } from "@/components/merchant/PipelineWorkspace";
export default function SalesPipeline() {
  return (
    <KnowledgeWorkspaceScope slot="sales-pipeline">
      {key => <PipelineWorkspace key={key} />}
    </KnowledgeWorkspaceScope>
  );
}
