import type { ReportSelection } from "../../../shared/report-workspace";
import { reportFixture } from "./report-model";
import {
  useReportVersion,
  reportMode,
  reportVersion,
  refreshReport,
} from "./report-preview-state";
export const trpc = {
  reports: {
    workspace: {
      useQuery(input: ReportSelection) {
        useReportVersion();
        const code =
          reportMode === "forbidden"
            ? "FORBIDDEN"
            : reportMode === "session"
              ? "UNAUTHORIZED"
              : reportMode === "error"
                ? "INTERNAL_SERVER_ERROR"
                : null;
        return {
          data: reportFixture(input, reportMode),
          error: code ? { data: { code } } : null,
          isFetching: reportMode === "loading",
          isLoading: false,
          fetchStatus: reportMode === "offline" ? "paused" : "idle",
          dataUpdatedAt: reportVersion,
          refetch: refreshReport,
        };
      },
    },
  },
};
