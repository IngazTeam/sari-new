import { trpc } from "@/lib/trpc";
import { marginPolicyUpdateSchema } from "@shared/checkout-margin";
import { KnowledgeWorkspaceScope } from "./KnowledgeWorkspaceScope";
import { ReviewedSalesPolicy } from "./merchant/ReviewedSalesPolicy";
export function CheckoutMarginPolicySettings() {
  return (
    <KnowledgeWorkspaceScope slot="sales-margin">
      {(scope) => <PolicyWorkspace key={scope} scope={scope} />}
    </KnowledgeWorkspaceScope>
  );
}
function PolicyWorkspace({ scope }: { scope: string }) {
  const query = trpc.botSettings.getMarginPolicy.useQuery(undefined, {
    refetchOnMount: "always",
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
  const mutation = trpc.botSettings.updateMarginPolicy.useMutation();
  return (
    <ReviewedSalesPolicy
      kind="margin"
      scope={scope}
      query={query}
      save={(input) =>
        mutation.mutateAsync(marginPolicyUpdateSchema.parse(input))
      }
    />
  );
}
