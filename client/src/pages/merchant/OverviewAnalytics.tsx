import { KnowledgeWorkspaceScope } from "@/components/KnowledgeWorkspaceScope";
import { OverviewWorkspace } from "@/components/merchant/OverviewWorkspace";
export default function OverviewAnalytics() {
  return (
    <KnowledgeWorkspaceScope slot="overview-analytics">
      {key => <OverviewWorkspace key={key} />}
    </KnowledgeWorkspaceScope>
  );
}
