import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("../db", () => ({ getPool: async () => ({ execute: mocks.execute }) }));
import { inspectSchemaRequirements } from "./schema-readiness";
const requirements = [
  {
    table: "testConversations",
    columns: ["requestId"],
    uniqueIndexes: [
      { name: "test_session_request", columns: ["merchantId", "requestId"] },
    ],
    checkConstraints: [
      {
        name: "positive_merchant",
        expression: "merchantId > 0",
        enforced: true,
      },
    ],
  },
];
function fixture(
  mode: number | undefined,
  options: {
    table?: string;
    columns?: string[];
    indexColumns?: string[];
    enforced?: string;
  } = {}
) {
  const tableName = options.table ?? "testconversations";
  mocks.execute.mockImplementation(async (sql: string) => {
    if (sql.includes("INFORMATION_SCHEMA.COLUMNS"))
      return [
        (options.columns ?? ["merchantId", "requestId"]).map(columnName => ({
          tableName,
          columnName,
          extra: "",
          generationExpression: "",
          lowerCaseTableNames: mode,
        })),
      ];
    if (sql.includes("INFORMATION_SCHEMA.STATISTICS"))
      return [
        (options.indexColumns ?? ["merchantId", "requestId"]).map(
          (columnName, i) => ({
            tableName,
            columnName,
            indexName: "test_session_request",
            nonUnique: 0,
            seqInIndex: i + 1,
          })
        ),
      ];
    if (sql.includes("INFORMATION_SCHEMA.TABLE_CONSTRAINTS"))
      return [
        [
          {
            tableName,
            constraintName: "positive_merchant",
            checkClause: "`merchantId` > 0",
            enforced: options.enforced ?? "YES",
          },
        ],
      ];
    throw Error("Unexpected schema query");
  });
}
beforeEach(() => vi.resetAllMocks());
describe("schema readiness respects server table-name comparison", () => {
  it.each([1, 2])(
    "accepts lowercase metadata only when server mode %s allows it",
    async mode => {
      fixture(mode);
      await expect(inspectSchemaRequirements(requirements)).resolves.toEqual(
        []
      );
    }
  );
  it.each([0, undefined])(
    "does not silently equate different tables when mode is %s",
    async mode => {
      fixture(mode);
      await expect(inspectSchemaRequirements(requirements)).resolves.toEqual([
        "table:testConversations",
      ]);
    }
  );
  it("accepts the exact camelCase table on a case-sensitive server", async () => {
    fixture(0, { table: "testConversations" });
    await expect(inspectSchemaRequirements(requirements)).resolves.toEqual([]);
  });
  it("still rejects missing columns, reordered uniqueness and unenforced checks", async () => {
    fixture(1, {
      columns: ["merchantId"],
      indexColumns: ["requestId", "merchantId"],
      enforced: "NO",
    });
    await expect(inspectSchemaRequirements(requirements)).resolves.toEqual([
      "column:testConversations.requestId",
      "unique-index-definition:testConversations.test_session_request",
      "check-enforcement:testConversations.positive_merchant",
    ]);
  });
});
