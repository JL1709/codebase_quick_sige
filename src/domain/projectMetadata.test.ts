import { describe, expect, it } from "vitest";
import {
  formatProjectDetails,
  formatProjectIdentity,
  formatProjectLocation,
  joinProvidedProjectValues,
  projectDocumentStem,
} from "./projectMetadata";

describe("project metadata presentation", () => {
  it("never adds separators or placeholder data for omitted values", () => {
    const project = { name: "Test", projectNumber: undefined, address: undefined, city: undefined };

    expect(formatProjectIdentity(project)).toBe("Test");
    expect(formatProjectIdentity(project, true)).toBe("Test");
    expect(formatProjectLocation(project)).toBe("");
    expect(formatProjectDetails(project)).toBe("");
    expect(joinProvidedProjectValues([undefined, "", " A0 "])).toBe("A0");
  });

  it("formats only values that were provided", () => {
    const project = { name: "West Site", projectNumber: "WS-12", address: "Main Street 5", city: "Berlin" };

    expect(formatProjectIdentity(project)).toBe("West Site · WS-12");
    expect(formatProjectIdentity(project, true)).toBe("WS-12 · West Site");
    expect(formatProjectLocation(project)).toBe("Main Street 5, Berlin");
    expect(formatProjectDetails(project)).toBe("WS-12 · Main Street 5, Berlin");
  });

  it("uses the user-provided name for filenames when no project number exists", () => {
    expect(projectDocumentStem({ name: "Prüfung West / 2", projectNumber: undefined })).toBe("prufung-west-2");
    expect(projectDocumentStem({ name: "West Site", projectNumber: "WS-12" })).toBe("ws-12");
  });
});
