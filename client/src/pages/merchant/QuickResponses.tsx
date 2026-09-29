import { KnowledgeWorkspaceScope } from "@/components/KnowledgeWorkspaceScope";
import { QuickResponseWorkspace } from "@/components/merchant/QuickResponseWorkspace";
export default function QuickResponses() {
  return (
    <KnowledgeWorkspaceScope slot="quick-responses">
      {key => <QuickResponseWorkspace key={key} />}
    </KnowledgeWorkspaceScope>
  );
}
