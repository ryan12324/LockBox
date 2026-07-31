import { Icon as IconifyIcon, type IconProps as IconifyComponentProps } from '@iconify/react';
import { lockboxIcons, type IconName } from '../icons/generated.js';

export type IconProps = Omit<
  IconifyComponentProps,
  'icon' | 'width' | 'height' | 'aria-label' | 'aria-hidden'
> & {
  name: IconName;
  size?: number | string;
  label?: string;
};

export function Icon({ name, size = '1em', label, className, ...rest }: IconProps) {
  const classes = ['lb-icon', className].filter(Boolean).join(' ');

  return (
    <IconifyIcon
      {...rest}
      icon={lockboxIcons[name]}
      width={size}
      height={size}
      className={classes}
      aria-hidden={label === undefined ? 'true' : undefined}
      aria-label={label}
      role={label === undefined ? undefined : 'img'}
    />
  );
}

export type { IconName } from '../icons/generated.js';
