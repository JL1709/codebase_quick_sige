import type { Project } from "./types";

type ProjectIdentity = Pick<Project, "name" | "projectNumber">;
type ProjectLocation = Pick<Project, "address" | "city">;

export function joinProvidedProjectValues(
  values: Array<string | undefined>,
  separator = " · ",
): string {
  return values
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join(separator);
}

export function formatProjectIdentity(project: ProjectIdentity, numberFirst = false): string {
  return joinProvidedProjectValues(numberFirst
    ? [project.projectNumber, project.name]
    : [project.name, project.projectNumber]);
}

export function formatProjectLocation(project: ProjectLocation): string {
  return joinProvidedProjectValues([project.address, project.city], ", ");
}

export function formatProjectDetails(project: ProjectIdentity & ProjectLocation): string {
  return joinProvidedProjectValues([project.projectNumber, formatProjectLocation(project)]);
}

export function projectDocumentStem(project: ProjectIdentity): string {
  const identifier = project.projectNumber?.trim() || project.name.trim() || "project";
  return identifier
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "project";
}
