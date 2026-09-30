import { useLocation } from "wouter";
import { KnowledgeWorkspaceScope } from "@/components/KnowledgeWorkspaceScope";
import { CustomerDetailWorkspace } from "@/components/merchant/CustomerDetailWorkspace";
import { WorkspaceState } from "@/components/merchant/WorkspaceState";
import { customerKeyFromPath } from "@/lib/customer-workspace-cache";
export default function CustomerDetails() {
  useLocation();
  const key = customerKeyFromPath(window.location.pathname);
  if (!key) return <WorkspaceState kind="missing" />;
  return (
    <KnowledgeWorkspaceScope slot="customers">
      {scope => (
        <CustomerDetailWorkspace
          key={scope + ":" + key}
          scope={scope}
          customerKey={key}
        />
      )}
    </KnowledgeWorkspaceScope>
  );
}
