import { KnowledgeWorkspaceScope } from "@/components/KnowledgeWorkspaceScope";
import { MessageWorkspace } from "@/components/merchant/MessageWorkspace";
export default function Analytics() {
  return (
    <KnowledgeWorkspaceScope slot="message-analytics">
      {key => <MessageWorkspace key={key} />}
    </KnowledgeWorkspaceScope>
  );
}
