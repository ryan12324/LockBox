import { lockboxIcons, type IconName } from '@lockbox/design';

interface IconMarkupOptions {
  size?: number;
  label?: string;
}

/** Render a checked-in Iconify icon for non-React extension surfaces. */
export function iconifySvg(
  name: IconName,
  { size = 20, label }: IconMarkupOptions = {}
): string {
  const icon = lockboxIcons[name];
  const accessibility = label
    ? `role="img" aria-label="${label.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}"`
    : 'aria-hidden="true"';

  return `<svg ${accessibility} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${icon.width} ${icon.height}" width="${size}" height="${size}">${icon.body}</svg>`;
}
