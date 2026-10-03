import { beforeEach, afterEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  read: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  log: vi.fn(),
  call: vi.fn(),
  checkpoint: vi.fn(),
}));
vi.mock("./openai", () => ({ callGPT4: m.call }));
vi.mock("../knowledge/intake-execution", () => ({
  assertIntakeCheckpoint: m.checkpoint,
}));
vi.mock("../db/knowledge", () => ({
  getSectionsByMerchantId: m.read,
  createSection: m.create,
  updateSection: m.update,
  logChange: m.log,
}));
import { evolveKnowledge, type ClassifiedSection } from "./knowledge-engine";
const parent: ClassifiedSection = {
  sectionType: "services",
  title: "Services",
  content: "Local business offers standard services",
  summary: "Services",
  confidence: 0.9,
};
const child: ClassifiedSection = {
  sectionType: "policies",
  title: "Delivery",
  content: "Delivery requires an appointment",
  summary: "Delivery",
  confidence: 0.9,
};
const existing = (
  id: number,
  value = parent,
  parentId: number | null = null,
  extra = {}
) => ({
  id,
  parent_id: parentId,
  section_type: value.sectionType,
  title: value.title,
  content: value.content,
  merchant_edited: 0,
  status: "auto_approved",
  use_in_bot: 1,
  ...extra,
});
beforeEach(() => {
  vi.resetAllMocks();
  m.read.mockResolvedValue([]);
  m.checkpoint.mockResolvedValue(undefined);
  m.call.mockResolvedValue("unchanged");
  let id = 100;
  m.create.mockImplementation(async () => ++id);
});
afterEach(() => vi.restoreAllMocks());
it.each([false, true])(
  "keeps a new child when its existing parent is unchanged or merchant-edited (%s)",
  async edited => {
    m.read.mockResolvedValue([
      existing(1, parent, null, { merchant_edited: edited ? 1 : 0 }),
    ]);
    const result = await evolveKnowledge(
      42,
      [{ ...parent, children: [child] }],
      "document"
    );
    expect(result).toMatchObject({ added: 1, unchanged: 1 });
    expect(m.create).toHaveBeenCalledWith(
      expect.objectContaining({
        parentId: 1,
        sectionType: "policies",
        title: child.title,
      })
    );
    expect(m.update).not.toHaveBeenCalled();
  }
);
it("preserves the child type under a new parent", async () => {
  expect(
    (await evolveKnowledge(42, [{ ...parent, children: [child] }], "document"))
      .added
  ).toBe(2);
  expect(m.create).toHaveBeenLastCalledWith(
    expect.objectContaining({ parentId: 101, sectionType: "policies" })
  );
});
it("never matches a child belonging to a different parent", async () => {
  m.read.mockResolvedValue([existing(1), existing(2, child, 99)]);
  expect(
    (await evolveKnowledge(42, [{ ...parent, children: [child] }], "document"))
      .added
  ).toBe(1);
  expect(m.create).toHaveBeenCalledWith(
    expect.objectContaining({ parentId: 1, content: child.content })
  );
  expect(m.update).not.toHaveBeenCalled();
});
it("does not match a root section against another parent's child", async () => {
  m.read.mockResolvedValue([existing(2, child, 99)]);
  expect((await evolveKnowledge(42, [child], "document")).added).toBe(1);
  expect(m.create).toHaveBeenCalledWith(
    expect.objectContaining({ parentId: null })
  );
});
it("updates a matching child using its own evidence without replacing the parent", async () => {
  m.read.mockResolvedValue([existing(1), existing(2, child, 1)]);
  m.call.mockResolvedValue("evolve");
  const value = {
    ...child,
    content: "Delivery requires an appointment and written confirmation",
  };
  expect(
    await evolveKnowledge(42, [{ ...parent, children: [value] }], "document")
  ).toMatchObject({ evolved: 1, unchanged: 1 });
  expect(m.update).toHaveBeenCalledWith(
    2,
    42,
    expect.objectContaining({ content: value.content })
  );
});
it("retains children of a conflicting parent as disabled review items", async () => {
  m.read.mockResolvedValue([existing(1)]);
  m.call.mockResolvedValue("conflict");
  const value = {
    ...parent,
    content: "Local business offers premium services instead",
    children: [child],
  };
  expect(await evolveKnowledge(42, [value], "document")).toMatchObject({
    conflicts: 2,
    added: 0,
  });
  expect(m.create).toHaveBeenLastCalledWith(
    expect.objectContaining({
      parentId: 101,
      status: "pending_review",
      useInBot: false,
    })
  );
});
it("does not activate new children below a disabled parent", async () => {
  m.read.mockResolvedValue([existing(1, parent, null, { use_in_bot: 0 })]);
  await evolveKnowledge(42, [{ ...parent, children: [child] }], "document");
  expect(m.create).toHaveBeenCalledWith(
    expect.objectContaining({
      parentId: 1,
      status: "pending_review",
      useInBot: false,
    })
  );
});
it.each(["invalid", "provider-error"])(
  "does not report unchanged when the evolution model fails (%s)",
  async mode => {
    m.read.mockResolvedValue([existing(1)]);
    if (mode === "provider-error")
      m.call.mockRejectedValue(new Error("PRIVATE_PROVIDER"));
    else m.call.mockResolvedValue("maybe evolve PRIVATE_RESPONSE");
    await expect(
      evolveKnowledge(
        42,
        [
          {
            ...parent,
            content: "Local business offers premium services instead",
          },
        ],
        "document"
      )
    ).rejects.toMatchObject({
      name: "KnowledgeAnalysisError",
      stage: "evolution",
    });
    expect(m.create).not.toHaveBeenCalled();
    expect(m.update).not.toHaveBeenCalled();
    expect(m.log).not.toHaveBeenCalled();
  }
);
it("does not duplicate identical sibling entries in one analysis", async () => {
  const result = await evolveKnowledge(
    42,
    [{ ...parent, children: [child, child] }],
    "document"
  );
  expect(result).toMatchObject({ added: 2, unchanged: 1 });
  expect(m.create).toHaveBeenCalledTimes(2);
});

it('does not hide a small but material change behind high text similarity or a truncated prompt',async()=>{
 const common=Array.from({length:230},(_,i)=>'contextword'+i).join(' ');
 const old={...parent,content:common+' price 1000'};const changed={...parent,content:common+' price 2000'};
 m.read.mockResolvedValue([existing(1,old)]);m.call.mockResolvedValue('conflict');
 expect((await evolveKnowledge(42,[changed],'document')).conflicts).toBe(1);
 const prompt=m.call.mock.calls[0][0][1].content;expect(prompt).toContain('price 1000');expect(prompt).toContain('price 2000');
});
it('does not overwrite a pending review and keeps its children disabled',async()=>{
 m.read.mockResolvedValue([existing(1,parent,null,{status:'pending_review',use_in_bot:0})]);
 await evolveKnowledge(42,[{...parent,children:[child]}],'document');
 expect(m.update).not.toHaveBeenCalled();expect(m.create).toHaveBeenCalledWith(expect.objectContaining({parentId:1,status:'pending_review',useInBot:false}));
});
