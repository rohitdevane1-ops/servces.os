import React, { useEffect, useId, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { EASE_CINEMATIC } from './motionTokens';

interface ModalProps {
  isOpen: boolean;
  onClose?: () => void;
  dismissible?: boolean;
  title?: string;
  maxWidth?: string;
  maxWidthClass?: string;
  backdropClassName?: string;
  containerClassName?: string;
  ariaLabel?: string;
  children: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  dismissible = true,
  title,
  maxWidth,
  maxWidthClass = 'max-w-xl',
  backdropClassName = 'bg-slate-900/60 backdrop-blur-xs',
  containerClassName = 'bg-white rounded-2xl shadow-2xl border border-slate-200/90 w-full overflow-hidden flex flex-col max-h-[92vh]',
  ariaLabel,
  children,
}) => {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const resolvedMaxWidth = maxWidth || maxWidthClass;

  useEffect(() => {
    if (!isOpen) return;
    const prevFocused = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible && onClose) {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (prevFocused && typeof prevFocused.focus === 'function') {
        prevFocused.focus();
      }
    };
  }, [isOpen, dismissible, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className={`fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto ${backdropClassName}`}
          onClick={() => {
            if (dismissible && onClose) {
              onClose();
            }
          }}
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel || title}
            aria-labelledby={!ariaLabel && title ? titleId : undefined}
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.22, ease: EASE_CINEMATIC }}
            className={`${containerClassName} ${resolvedMaxWidth} focus:outline-none`}
            onClick={(e) => e.stopPropagation()}
          >
            {title && (
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
                <h2 id={titleId} className="text-base font-extrabold text-slate-900">
                  {title}
                </h2>
                {dismissible && onClose && (
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close dialog"
                    className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-200/50 transition-colors cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>
            )}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
