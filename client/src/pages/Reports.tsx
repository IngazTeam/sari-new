import { KnowledgeWorkspaceScope } from "@/components/KnowledgeWorkspaceScope";
import { ReportsWorkspace } from "@/components/merchant/ReportsWorkspace";
export default function Reports() {
  return (
    <KnowledgeWorkspaceScope slot="reports">
      {scope => <ReportsWorkspace key={scope} scope={scope} />}
    </KnowledgeWorkspaceScope>
  );
}
