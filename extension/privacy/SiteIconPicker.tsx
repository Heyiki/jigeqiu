import { SiteIconPicker as SharedPicker } from '../../src/components/common/SiteIconPicker';
import type { ComponentProps } from 'react';
import { REMOTE_IMAGE_NOTICE } from './content';

export type { SiteIconChoice } from '../../src/components/common/SiteIconPicker';

export function SiteIconPicker(props: ComponentProps<typeof SharedPicker>) {
  return (
    <div>
      <SharedPicker {...props} />
      <p className="extension-remote-image-notice">{REMOTE_IMAGE_NOTICE}</p>
    </div>
  );
}
