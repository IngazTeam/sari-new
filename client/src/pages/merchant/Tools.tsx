import { useLocation, useSearch } from "wouter";
import { MerchantToolsDirectory } from "@/components/merchant/MerchantToolsDirectory";
import { readToolFilters, toolsLocation } from "@/lib/merchant-tools-search";
export default function MerchantTools() {
  const search = useSearch(),
    [, navigate] = useLocation();
  const filters = readToolFilters(search);
  return (
    <MerchantToolsDirectory
      filters={filters}
      unknownSection={filters.unknownSection}
      onChange={(next, replace) => navigate(toolsLocation(next), { replace })}
    />
  );
}
