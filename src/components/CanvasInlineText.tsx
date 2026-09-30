import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

interface CanvasInlineTextProps {
  value: string;
  editing: boolean;
  field: string;
  multiline?: boolean;
  className?: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
  label: string;
}

export function CanvasInlineText(props: CanvasInlineTextProps) {
  if (!props.editing) return <span className={props.className} data-inline-field={props.field}>{props.value}</span>;
  // A fresh session keeps cancellation and unsaved text from leaking into the next edit.
  return <CanvasInlineTextEditor {...props} />;
}

function CanvasInlineTextEditor({ value, multiline = false, className, onCommit, onCancel, label }: CanvasInlineTextProps) {
  const [draft, setDraft] = useState(value);
  const editorRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const finished = useRef(false);
  const finishEdit = useCallback((cancel = false) => {
    if (finished.current) return;
    finished.current = true;
    const editedValue = editorRef.current?.value ?? value;
    if (cancel || editedValue === value) onCancel();
    else onCommit(editedValue);
  }, [onCancel, onCommit, value]);

  useLayoutEffect(() => {
    const saveBeforeOutsidePointer = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || editorRef.current?.contains(event.target)) return;
      // Canvas selection can remove the input before blur. Flush the save before
      // that selection or a toolbar action reads the plan, including export and undo.
      flushSync(() => finishEdit());
    };
    document.addEventListener("pointerdown", saveBeforeOutsidePointer, true);
    return () => document.removeEventListener("pointerdown", saveBeforeOutsidePointer, true);
  }, [finishEdit]);

  const sharedProps = {
    ref: (node: HTMLInputElement | HTMLTextAreaElement | null) => { editorRef.current = node; },
    autoFocus: true,
    className: `canvas-inline-editor ${className ?? ""}`,
    value: draft,
    "aria-label": label,
    onClick: (event: React.MouseEvent) => event.stopPropagation(),
    onPointerDown: (event: React.PointerEvent) => event.stopPropagation(),
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(event.target.value),
    onBlur: () => finishEdit(),
    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (event.key === "Escape") { event.preventDefault(); finishEdit(true); }
      else if (event.key === "Enter" && (!multiline || event.metaKey || event.ctrlKey)) { event.preventDefault(); finishEdit(); }
    },
  };
  return multiline ? <textarea {...sharedProps} /> : <input {...sharedProps} />;
}
