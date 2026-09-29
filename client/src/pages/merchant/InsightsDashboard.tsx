import { KnowledgeWorkspaceScope } from "@/components/KnowledgeWorkspaceScope";
import { InsightsWorkspace } from "@/components/merchant/InsightsWorkspace";
export default function InsightsDashboard() {
  return (
    <KnowledgeWorkspaceScope slot="insights">
      {key => <InsightsWorkspace key={key} />}
    </KnowledgeWorkspaceScope>
  );
}
