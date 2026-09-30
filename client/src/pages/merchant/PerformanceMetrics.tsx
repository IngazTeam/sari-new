import { KnowledgeWorkspaceScope } from "@/components/KnowledgeWorkspaceScope";
import { PerformanceWorkspace } from "@/components/merchant/PerformanceWorkspace";
export default function PerformanceMetrics() {
  return (
    <KnowledgeWorkspaceScope slot="performance-metrics">
      {key => <PerformanceWorkspace key={key} />}
    </KnowledgeWorkspaceScope>
  );
}
