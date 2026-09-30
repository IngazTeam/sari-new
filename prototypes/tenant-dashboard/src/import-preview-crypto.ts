// UI simulation only: not a cryptographic fingerprint or production implementation.
export function createHash(_algorithm: string) {
  let source = "";
  return {
    update(value: string) {
      source += value;
      return this;
    },
    digest(_encoding: string) {
      let hash = 2166136261;
      for (const char of source)
        hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
      return (hash >>> 0).toString(16).padStart(8, "0").repeat(8);
    },
  };
}
