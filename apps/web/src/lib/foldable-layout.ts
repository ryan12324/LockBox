import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export interface FoldableBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface FoldableLayout {
  hasFold: boolean;
  isSeparating: boolean;
  orientation: 'none' | 'vertical' | 'horizontal';
  state: 'flat' | 'half-opened';
  occlusion: 'none' | 'full';
  bounds: FoldableBounds;
}

interface FoldableLayoutPlugin {
  getLayout(): Promise<FoldableLayout>;
  addListener(
    eventName: 'layoutChanged',
    listener: (layout: FoldableLayout) => void
  ): Promise<PluginListenerHandle>;
}

const FoldableLayoutBridge = registerPlugin<FoldableLayoutPlugin>('FoldableLayout');

const foldProperties = [
  '--fold-left',
  '--fold-top',
  '--fold-width',
  '--fold-height',
  '--fold-workspace-offset',
] as const;

export function clearFoldableLayout(root: HTMLElement = document.documentElement): void {
  delete root.dataset.foldOrientation;
  delete root.dataset.foldSeparating;
  delete root.dataset.foldState;
  for (const property of foldProperties) root.style.removeProperty(property);
}

export function applyFoldableLayout(
  layout: FoldableLayout,
  root: HTMLElement = document.documentElement,
  pixelRatio: number = window.devicePixelRatio || 1
): void {
  clearFoldableLayout(root);
  if (!layout.hasFold || !layout.isSeparating || layout.orientation === 'none') return;

  const scale = pixelRatio > 0 ? pixelRatio : 1;
  const left = layout.bounds.left / scale;
  const top = layout.bounds.top / scale;
  const width = Math.max(1, (layout.bounds.right - layout.bounds.left) / scale);
  const height = Math.max(1, (layout.bounds.bottom - layout.bounds.top) / scale);

  root.dataset.foldOrientation = layout.orientation;
  root.dataset.foldSeparating = 'true';
  root.dataset.foldState = layout.state;
  root.style.setProperty('--fold-left', `${left}px`);
  root.style.setProperty('--fold-top', `${top}px`);
  root.style.setProperty('--fold-width', `${width}px`);
  root.style.setProperty('--fold-height', `${height}px`);

  if (layout.orientation === 'horizontal') {
    requestAnimationFrame(() => {
      const workspace = document.querySelector<HTMLElement>('.vault-workspace');
      if (!workspace) return;
      const workspaceOffset = Math.max(0, top - workspace.getBoundingClientRect().top);
      root.style.setProperty('--fold-workspace-offset', `${workspaceOffset}px`);
    });
  }
}

/** Start native fold/hinge observation. Browsers remain on ordinary responsive CSS. */
export function startFoldableLayout(): () => void {
  if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable('FoldableLayout')) {
    return () => clearFoldableLayout();
  }

  let listenerHandle: PluginListenerHandle | undefined;
  let disposed = false;

  const apply = (layout: FoldableLayout) => {
    if (!disposed) applyFoldableLayout(layout);
  };
  const refresh = () => {
    void FoldableLayoutBridge.getLayout().then(apply).catch(() => clearFoldableLayout());
  };

  refresh();
  void FoldableLayoutBridge.addListener('layoutChanged', apply).then((handle) => {
    if (disposed) void handle.remove();
    else listenerHandle = handle;
  });
  window.addEventListener('resize', refresh);
  window.addEventListener('orientationchange', refresh);

  return () => {
    disposed = true;
    window.removeEventListener('resize', refresh);
    window.removeEventListener('orientationchange', refresh);
    if (listenerHandle) void listenerHandle.remove();
    clearFoldableLayout();
  };
}
