import { useParams } from "wouter";
import { PaymentHistoryPage } from "@/components/merchant/PaymentHistoryPage";
export default function PaymentDetails() {
  const { id } = useParams();
  return <PaymentHistoryPage recordId={id ?? ""} />;
}
