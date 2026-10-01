import { trpc } from "@/lib/trpc";
import { discountPolicyUpdateSchema } from "@shared/discount-policy";
import { KnowledgeWorkspaceScope } from "./KnowledgeWorkspaceScope";
import { ReviewedSalesPolicy } from "./merchant/ReviewedSalesPolicy";
export function DiscountPolicySettings() {
  return (
    <KnowledgeWorkspaceScope slot="sales-discount">
      {(scope) => <PolicyWorkspace key={scope} scope={scope} />}
    </KnowledgeWorkspaceScope>
  );
}
function PolicyWorkspace({ scope }: { scope: string }) {
  const query = trpc.botSettings.getDiscountPolicy.useQuery(undefined, {
    refetchOnMount: "always",
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
  const mutation = trpc.botSettings.updateDiscountPolicy.useMutation();
  return (
    <ReviewedSalesPolicy
      kind="discount"
      scope={scope}
      query={query}
      save={(input) =>
        mutation.mutateAsync(discountPolicyUpdateSchema.parse(input))
      }
    />
  );
}
