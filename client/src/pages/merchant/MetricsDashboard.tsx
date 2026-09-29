import { KnowledgeWorkspaceScope } from "@/components/KnowledgeWorkspaceScope";
import { TestMetricsWorkspace } from "@/components/merchant/TestMetricsWorkspace";
export default function MetricsDashboard() {
  return (
    <KnowledgeWorkspaceScope slot="test-metrics">
      {key => <TestMetricsWorkspace key={key} />}
    </KnowledgeWorkspaceScope>
  );
}
