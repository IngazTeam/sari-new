import { KnowledgeWorkspaceScope } from "@/components/KnowledgeWorkspaceScope";
import { DataSyncWorkspace } from "@/components/merchant/DataSyncWorkspace";
export default function DataSync() {
  return (
    <KnowledgeWorkspaceScope slot="data-sync">
      {scope => <DataSyncWorkspace key={scope} scope={scope} />}
    </KnowledgeWorkspaceScope>
  );
}
