export type KnowledgeSourceInventory = {
  documents: {
    total: number;
    textReady: number;
    empty: number;
    pending: number;
    processing: number;
    failed: number;
  };
  products: { total: number; active: number };
  faqs: { total: number; enabled: number; archived: number };
  pages: { total: number; enabled: number; withText: number };
};
