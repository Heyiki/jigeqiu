import React from 'react';
import { BookmarkDialog, type BookmarkDialogProps } from '../common/BookmarkDialog';

type QuickAddModalProps = Omit<BookmarkDialogProps, 'onSave' | 'onCreateFolder'> & {
  onSaveBookmark: BookmarkDialogProps['onSave'];
  onCreateFolderInline: NonNullable<BookmarkDialogProps['onCreateFolder']>;
};

export function QuickAddModal({ onSaveBookmark, onCreateFolderInline, defaultPinToDesktop = true, ...props }: QuickAddModalProps) {
  return <BookmarkDialog {...props} defaultPinToDesktop={defaultPinToDesktop} onSave={onSaveBookmark} onCreateFolder={onCreateFolderInline} />;
}
