import { useEffect } from 'react';

export function visibleMerchantViewport(layoutHeight: number, viewport: {height: number; offsetTop: number; scale: number}, editing: boolean) {
  // Pinch zoom must remain browser-controlled rather than repeatedly relaying out the form.
  if (viewport.scale < 0.99 || viewport.scale > 1.01 || viewport.height <= 0) return null;
  return {
    height: viewport.height,
    top: Math.max(0, viewport.offsetTop),
    keyboard: editing && layoutHeight - viewport.height > 120,
  };
}

const installations = new WeakMap<Window, {users: number; dispose: () => void}>();
export function installMerchantViewport(win: Window = window) {
  const previous = installations.get(win);
  if (previous) {
    previous.users++;
    return releaseOnce(win);
  }
  const doc = win.document, body = doc.body;
  const hadSurface = body.classList.contains('merchant-surface');
  const properties = ['--mw-visible-height', '--mw-viewport-top'];
  const oldStyles = properties.map(name => body.style.getPropertyValue(name));
  const oldKeyboard = body.getAttribute('data-mw-keyboard');
  const meta = doc.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  const originalViewport = meta?.content;
  if (meta) meta.content = [...meta.content.split(',').map(s=>s.trim()).filter(s=>!s.startsWith('viewport-fit=')), 'viewport-fit=cover'].join(', ');
  const installedViewport = meta?.content;
  body.classList.add('merchant-surface');
  const update = () => {
    const active = doc.activeElement;
    const editing = !!active?.matches('textarea, input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="file"]):not([type="button"]):not([type="submit"]), [contenteditable="true"]');
    const viewport = win.visualViewport || {height: win.innerHeight, offsetTop: 0, scale: 1};
    const geometry = visibleMerchantViewport(doc.documentElement.clientHeight || win.innerHeight, viewport, editing);
    if (!geometry) return;
    body.style.setProperty(properties[0], `${geometry.height}px`);
    body.style.setProperty(properties[1], `${geometry.top}px`);
    body.toggleAttribute('data-mw-keyboard', geometry.keyboard);
  };
  win.visualViewport?.addEventListener('resize', update);
  win.visualViewport?.addEventListener('scroll', update);
  win.addEventListener('resize', update);
  doc.addEventListener('focusin', update);
  doc.addEventListener('focusout', update);
  update();
  installations.set(win, {users: 1, dispose: () => {
    win.visualViewport?.removeEventListener('resize', update);
    win.visualViewport?.removeEventListener('scroll', update);
    win.removeEventListener('resize', update);
    doc.removeEventListener('focusin', update);
    doc.removeEventListener('focusout', update);
    if (!hadSurface) body.classList.remove('merchant-surface');
    properties.forEach((name,index)=>oldStyles[index] ? body.style.setProperty(name,oldStyles[index]) : body.style.removeProperty(name));
    if (oldKeyboard === null) body.removeAttribute('data-mw-keyboard'); else body.setAttribute('data-mw-keyboard',oldKeyboard);
    if (meta && meta.content === installedViewport && originalViewport !== undefined) meta.content = originalViewport;
  }});
  return releaseOnce(win);
}
function releaseOnce(win: Window) {
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const active = installations.get(win);
    if (active && --active.users === 0) { active.dispose(); installations.delete(win); }
  };
}
export function useMerchantViewport() {
  useEffect(() => installMerchantViewport(), []);
}
