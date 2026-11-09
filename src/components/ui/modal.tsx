'use client';
import * as Dialog from '@radix-ui/react-dialog';
import { useId, useRef, type ReactNode } from 'react';
import { Icon } from './icon';
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  className = '',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  const opener = useRef<HTMLElement | null>(null),
    descriptionId = useId();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="ui-modal-backdrop" />
        <Dialog.Content
          className={`ui-modal op-dialog ${className}`}
          aria-describedby={description ? descriptionId : undefined}
          onOpenAutoFocus={() => {
            opener.current =
              document.activeElement instanceof HTMLElement ? document.activeElement : null;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (opener.current?.isConnected) opener.current.focus();
          }}
        >
          <div className="viewer-header">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close asChild>
              <button className="icon-btn" aria-label={`Fechar ${title}`}>
                <Icon name="close" />
              </button>
            </Dialog.Close>
          </div>
          {description && (
            <Dialog.Description id={descriptionId} className="sr-only">
              {description}
            </Dialog.Description>
          )}
          <div className="op-dialog-body">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
