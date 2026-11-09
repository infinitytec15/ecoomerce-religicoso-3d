import type { SVGProps } from 'react';
import { iconPaths, type IconName } from './icons';
export function Icon({ name, ...props }: { name: IconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d={iconPaths[name]} />
    </svg>
  );
}
export type { IconName };
