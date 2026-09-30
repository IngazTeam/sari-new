import { KnowledgeWorkspaceScope } from "@/components/KnowledgeWorkspaceScope";
import { SheetsSettingsWorkspace } from "@/components/merchant/SheetsSettingsWorkspace";
export default function SheetsSettings() {
  return (
    <KnowledgeWorkspaceScope slot="sheets-settings">
      {scope => <SheetsSettingsWorkspace key={scope} scope={scope} />}
    </KnowledgeWorkspaceScope>
  );
}
