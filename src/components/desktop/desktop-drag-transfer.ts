// The native drag source stays mounted while its folder is temporarily hidden.
export const FOLDER_DRAG_START = 'jipage:folder-drag-start';
export const FOLDER_DRAG_END = 'jipage:folder-drag-end';
export const FOLDER_DRAG_CANCEL = 'jipage:folder-drag-cancel';

export interface FolderDragStart {
  bookmarkId: string;
  folderId: string;
  x: number;
  y: number;
}

export interface FolderDragEnd {
  committed: boolean;
  error?: string;
}

export function transferFolderDrag(detail: FolderDragStart) {
  window.dispatchEvent(new CustomEvent<FolderDragStart>(FOLDER_DRAG_START, { detail }));
}

export function finishFolderDrag(committed: boolean, error?: string) {
  window.dispatchEvent(new CustomEvent<FolderDragEnd>(FOLDER_DRAG_END, { detail: { committed, error } }));
}
