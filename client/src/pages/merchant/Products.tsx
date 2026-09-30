import { KnowledgeWorkspaceScope } from "@/components/KnowledgeWorkspaceScope";
import { ProductCatalogWorkspace } from "@/components/merchant/ProductCatalogWorkspace";
export default function Products() {
  return (
    <KnowledgeWorkspaceScope slot="products">
      {scope => <ProductCatalogWorkspace key={scope} scope={scope} />}
    </KnowledgeWorkspaceScope>
  );
}
