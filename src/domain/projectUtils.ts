import type { Plan, Project } from "./types";

export function calculateProjectCompleteness(project: Project, plan?: Plan): number {
  const checks = [
    Boolean(project.name),
    Boolean(project.projectNumber),
    Boolean(project.address && project.city),
    Boolean(project.startDate && project.endDate),
    project.participants.some((participant) => participant.role === "owner"),
    project.participants.some((participant) => participant.role === "coordinator"),
    project.emergencyContacts.length >= 2,
    Boolean(plan),
    plan?.status === "published",
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

export function countPlanBlocks(plan?: Plan): number {
  return plan?.sections.reduce((total, section) => total + section.items.length, 0) ?? 0;
}
