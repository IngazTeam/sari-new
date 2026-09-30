import { KnowledgeWorkspaceScope } from "@/components/KnowledgeWorkspaceScope";
import { CustomerListWorkspace } from "@/components/merchant/CustomerListWorkspace";
export default function Customers() {
  return (
    <KnowledgeWorkspaceScope slot="customers">
      {scope => <CustomerListWorkspace key={scope} scope={scope} />}
    </KnowledgeWorkspaceScope>
  );
}
