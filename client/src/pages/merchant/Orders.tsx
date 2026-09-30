import { KnowledgeWorkspaceScope } from "@/components/KnowledgeWorkspaceScope";
import { OrderWorkspace } from "@/components/merchant/OrderWorkspace";
export default function Orders() {
  return (
    <KnowledgeWorkspaceScope slot="orders">
      {scope => <OrderWorkspace key={scope} scope={scope} />}
    </KnowledgeWorkspaceScope>
  );
}
