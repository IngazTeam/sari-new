import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ download: vi.fn(), llm: vi.fn() }));
vi.mock("../security/download-media", () => ({
  downloadPublicMedia: m.download,
}));
vi.mock("../_core/llm", () => ({ invokeLLM: m.llm }));
import { fetchPageSnapshot } from "./page-fetch";
import { pageUrlInput } from '../../shared/knowledge-page-intake';
const words = "One two three four five six seven eight nine ten eleven";
beforeEach(() => {
  vi.clearAllMocks();
  m.download.mockResolvedValue({
    data: Buffer.from(
      `<html><title>Title</title><body><script>globalThis.bad=1</script><nav>Noise</nav><main><p>${words}</p><p>Second paragraph</p></main></body></html>`
    ),
    mimeType: "text/html",
  });
  m.llm.mockRejectedValue(Error("Provider unavailable"));
});
it("reads bounded inert HTML, retains block boundaries and works without AI", async () => {
  expect(
    await fetchPageSnapshot(20, "https://example.test/a#fragment")
  ).toMatchObject({
    title: "Title",
    url: "https://example.test/a",
    content: words + "\nSecond paragraph",
    analysis: null,
  });
  expect(m.download).toHaveBeenCalledWith("https://example.test/a", 2097152);
  expect(m.llm.mock.calls[0][0].merchantId).toBe(20);
});
it.each([
  "http://example.test",
  "https://user:pass@example.test",
  "https://example.test:8443",
])("blocks unsafe input %s before transport", async url => {
  await expect(fetchPageSnapshot(20, url)).rejects.toThrow();
  expect(m.download).not.toHaveBeenCalled();
});
it.each(["application/pdf", "image/png", "application/octet-stream"])(
  "rejects unsupported %s without AI",
  async mimeType => {
    m.download.mockResolvedValue({ data: Buffer.from(words), mimeType });
    await expect(
      fetchPageSnapshot(20, "https://example.test")
    ).rejects.toThrow();
    expect(m.llm).not.toHaveBeenCalled();
  }
);
it("accepts UTF-8 plain text without interpreting markup", async () => {
  m.download.mockResolvedValue({
    data: Buffer.from(words + " <img src=x>"),
    mimeType: "text/plain",
  });
  expect(
    (await fetchPageSnapshot(20, "https://example.test")).content
  ).toContain("<img src=x>");
});
it("rejects short or oversized text rather than silently truncating it", async () => {
  expect(pageUrlInput.safeParse({url:'not a URL'}).success).toBe(false);
  for (const content of ["short", "word ".repeat(10) + "ع".repeat(32768)]) {
    m.download.mockResolvedValue({
      data: Buffer.from(content),
      mimeType: "text/plain",
    });
    await expect(
      fetchPageSnapshot(20, "https://example.test")
    ).rejects.toThrow();
  }
  expect(m.llm).not.toHaveBeenCalled();
});
it("validates advisory classification and drops malformed model output", async () => {
  m.llm.mockResolvedValue({
    choices: [
      {
        message: {
          content: JSON.stringify({
            summary: "Advice",
            sections: [{ title: "Topic", points: ["Fact"] }],
          }),
        },
      },
    ],
  });
  expect(
    (await fetchPageSnapshot(20, "https://example.test")).analysis?.summary
  ).toBe("Advice");
  m.llm.mockResolvedValue({
    choices: [{ message: { content: '{"summary":1,"sections":"bad"}' } }],
  });
  expect(
    (await fetchPageSnapshot(20, "https://example.test")).analysis
  ).toBeNull();
});
