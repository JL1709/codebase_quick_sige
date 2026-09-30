import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CanvasInlineText } from "./CanvasInlineText";

afterEach(cleanup);

function EditingHarness({ onSave }: { onSave: (value: string) => void }) {
  const [value, setValue] = useState("Original heading");
  const [editing, setEditing] = useState(true);
  return <div>
    <CanvasInlineText field="sectionTitle" value={value} editing={editing} label="Heading" onCommit={(nextValue) => {
      onSave(nextValue);
      setValue(nextValue);
      setEditing(false);
    }} onCancel={() => setEditing(false)} />
    <button onPointerDown={() => setEditing(false)}>Clear selection</button>
    <button onClick={() => setEditing(true)}>Edit</button>
  </div>;
}

describe("canvas inline editing", () => {
  it("saves before an outside pointer removes the editor and commits only once", () => {
    const onSave = vi.fn();
    render(<EditingHarness onSave={onSave} />);
    const editor = screen.getByRole("textbox", { name: "Heading" });
    fireEvent.change(editor, { target: { value: "Project heading" } });
    fireEvent.pointerDown(screen.getByRole("button", { name: "Clear selection" }));
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText("Project heading")).toBeVisible();
    expect(onSave).toHaveBeenCalledExactlyOnceWith("Project heading");
    fireEvent.blur(editor);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("resets cancellation and the draft for the next editing session", () => {
    const onSave = vi.fn();
    render(<EditingHarness onSave={onSave} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Discard me" } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("Original heading")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("textbox")).toHaveValue("Original heading");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Keep me" } });
    fireEvent.blur(screen.getByRole("textbox"));
    expect(onSave).toHaveBeenCalledExactlyOnceWith("Keep me");
  });

  it("allows pointers inside the editor and avoids saving unchanged text", () => {
    const onCommit = vi.fn();
    const onCancel = vi.fn();
    render(<CanvasInlineText field="text" value="Original" editing label="Text" onCommit={onCommit} onCancel={onCancel} />);
    const editor = screen.getByRole("textbox");
    fireEvent.pointerDown(editor);
    expect(onCancel).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.blur(editor);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it.each([{ metaKey: true }, { ctrlKey: true }])("preserves multiline Enter and saves once with the command modifier %o", (modifier) => {
    const onCommit = vi.fn();
    render(<CanvasInlineText field="blockDescription" value="Original" editing multiline label="Description" onCommit={onCommit} onCancel={vi.fn()} />);
    const editor = screen.getByRole("textbox");
    fireEvent.change(editor, { target: { value: "First line\nSecond line" } });
    fireEvent.keyDown(editor, { key: "Enter" });
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.keyDown(editor, { key: "Enter", ...modifier });
    fireEvent.blur(editor);
    expect(onCommit).toHaveBeenCalledExactlyOnceWith("First line\nSecond line");
  });
});
