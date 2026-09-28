import { expect } from "vitest";

export function evaluationDriver(w: any) {
  const node = (s: string): any => {
    const e = w.document.querySelector(s);
    expect(e, s).toBeTruthy();
    return e;
  };
  const click = (a: string, extra = "") =>
    node(`[data-be-action="${a}"]${extra}`).click();
  const option = (key: string, value: string) => {
    const e = node(`[data-be-option="${key}"]`);
    e.value = value;
    e.dispatchEvent(new w.Event("change", { bubbles: true }));
  };
  const consent = (key: string) => {
    const e = node(`[data-be-consent="${key}"]`);
    expect(e.disabled).toBe(false);
    e.checked = true;
    e.dispatchEvent(new w.Event("change", { bubbles: true }));
  };
  const field = (name: string, value: string) => {
    const e = node(`[data-be-field="${name}"]`);
    e.value = value;
    e.dispatchEvent(
      new w.Event(e.tagName === "SELECT" ? "change" : "input", {
        bubbles: true,
      })
    );
  };
  function completeRun() {
    click("create");
    for (let i = 0; i < 8; i++) {
      consent("cost");
      click("advance");
    }
    expect(node("#be-progress").value).toBe(64);
  }
  function fillReview(preference = "candidate", failIndex = -1) {
    option("jump", "0");
    for (let i = 0; i < 32; i++) {
      for (const arm of ["baseline", "candidate"]) {
        field(
          arm + ".verdict",
          arm === "candidate" && i === failIndex ? "fail" : "pass"
        );
        field(arm + ".quote", node(`[data-be-response="${arm}"]`).textContent);
        field(
          arm + ".reason",
          "راجعت النص والسياق وحدود الصلاحية وسبب هذا الحكم في الحالة التوضيحية."
        );
      }
      option("preference", i === failIndex ? "baseline" : preference);
      if (i < 31) click("review-next");
    }
  }
  const data = () =>
    JSON.parse(w.localStorage.getItem("sary-brain-evaluation-v1"));
  return { node, click, option, consent, field, completeRun, fillReview, data };
}
