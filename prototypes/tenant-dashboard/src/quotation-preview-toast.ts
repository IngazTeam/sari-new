const show = (text: string) => (window as any).toast(text);
export const toast = { success: show, error: show };
