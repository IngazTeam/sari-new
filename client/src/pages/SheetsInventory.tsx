import { KnowledgeWorkspaceScope } from "@/components/KnowledgeWorkspaceScope";
import { InventorySheetWorkspace } from "@/components/merchant/InventorySheetWorkspace";
export default function SheetsInventory() {
  return (
    <KnowledgeWorkspaceScope slot="sheet-inventory">
      {scope => <InventorySheetWorkspace key={scope} scope={scope} />}
    </KnowledgeWorkspaceScope>
  );
}
