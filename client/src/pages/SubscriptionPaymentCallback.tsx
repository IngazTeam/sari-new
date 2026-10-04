import { PaymentReturnWorkspace } from "@/components/merchant/PaymentReturnWorkspace";
import { WorkspaceStandalone } from "@/components/merchant/WorkspaceState";
export default function SubscriptionPaymentCallback() { return <WorkspaceStandalone><PaymentReturnWorkspace kind="public" /></WorkspaceStandalone>; }
