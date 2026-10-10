// Generated from the design of the Action plan screens. Labels live in the message files under door.ap.*.
export type FlowKind = 'event' | 'project' | 'program';
export type FieldType = 'text' | 'area' | 'select' | 'person' | 'tag' | 'date' | 'time';
export type FlowField = { key: string; type: FieldType; req: boolean; map: 'name' | 'aim' | 'leader' | 'date' | 'venue' | 'needs' | 'detail'; half: boolean; opts?: keyof typeof OPTIONS };
export type FlowStep = { id: string; fields: FlowField[] };
export type Flow = { kind: FlowKind; planType: 'EVENT' | 'PROJECT' | 'PROGRAM'; steps: FlowStep[] };
export const OPTIONS = {"purpose": ["WORSHIP", "EVANGELISM", "FELLOWSHIP", "TRAINING", "FUNDRAISING", "SERVICE", "OTHER"], "type": ["WORSHIP", "CONFERENCE", "CONCERT", "TRAINING", "FELLOWSHIP", "OUTREACH", "OTHER"], "reporting": ["MONTHLY", "QUARTERLY", "ANNUALLY"], "oversight": ["UNIT_COMMITTEE", "CHURCH_COUNCIL", "CHURCH_LEADER"], "operatingPlan": ["WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY", "ONCE"]} as const;
export const FLOWS: Record<FlowKind, Flow> = {
  event: { kind: "event", planType: "EVENT", steps: [
    { id: "define", fields: [
      { key: "name", type: "text", req: true, map: "name", half: false },
      { key: "purpose", type: "select", req: true, map: "aim", half: false, opts: "purpose" },
      { key: "type", type: "select", req: true, map: "detail", half: false, opts: "type" },
      { key: "organizer", type: "person", req: false, map: "leader", half: true },
      { key: "outcomes", type: "area", req: true, map: "detail", half: true },
    ] },
    { id: "plan", fields: [
      { key: "date", type: "date", req: true, map: "date", half: true },
      { key: "time", type: "time", req: true, map: "detail", half: true },
      { key: "venue", type: "text", req: true, map: "venue", half: false },
      { key: "agenda", type: "area", req: true, map: "detail", half: false },
      { key: "budgetTag", type: "tag", req: true, map: "detail", half: true },
      { key: "resources", type: "area", req: false, map: "needs", half: true },
      { key: "responsibilities", type: "area", req: false, map: "detail", half: false },
    ] },
  ] },
  project: { kind: "project", planType: "PROJECT", steps: [
    { id: "initiate", fields: [
      { key: "name", type: "text", req: true, map: "name", half: false },
      { key: "problem", type: "area", req: true, map: "aim", half: false },
      { key: "objectives", type: "area", req: true, map: "detail", half: false },
      { key: "benefits", type: "area", req: true, map: "detail", half: false },
      { key: "sponsor", type: "person", req: true, map: "detail", half: true },
      { key: "manager", type: "person", req: true, map: "leader", half: true },
    ] },
    { id: "scope", fields: [
      { key: "deliverables", type: "area", req: true, map: "detail", half: false },
      { key: "requirements", type: "area", req: true, map: "detail", half: false },
      { key: "exclusions", type: "area", req: true, map: "detail", half: true },
      { key: "successCriteria", type: "area", req: true, map: "detail", half: true },
      { key: "constraints", type: "area", req: true, map: "detail", half: false },
    ] },
    { id: "plan", fields: [
      { key: "tasks", type: "area", req: true, map: "detail", half: true },
      { key: "milestones", type: "area", req: true, map: "detail", half: true },
      { key: "costs", type: "text", req: true, map: "detail", half: true },
      { key: "people", type: "area", req: false, map: "detail", half: true },
      { key: "risks", type: "area", req: false, map: "detail", half: true },
      { key: "budgetTag", type: "tag", req: true, map: "detail", half: true },
    ] },
  ] },
  program: { kind: "program", planType: "PROGRAM", steps: [
    { id: "purpose", fields: [
      { key: "name", type: "text", req: true, map: "name", half: false },
      { key: "need", type: "area", req: true, map: "aim", half: false },
      { key: "mission", type: "text", req: true, map: "detail", half: false },
      { key: "population", type: "text", req: true, map: "detail", half: false },
      { key: "impact", type: "text", req: true, map: "detail", half: false },
    ] },
    { id: "design", fields: [
      { key: "objectives", type: "area", req: true, map: "detail", half: true },
      { key: "activities", type: "area", req: true, map: "detail", half: true },
      { key: "services", type: "area", req: true, map: "detail", half: true },
      { key: "eligibility", type: "area", req: true, map: "detail", half: true },
      { key: "operatingModel", type: "area", req: true, map: "detail", half: true },
      { key: "indicators", type: "area", req: true, map: "detail", half: true },
    ] },
    { id: "governance", fields: [
      { key: "leader", type: "person", req: true, map: "leader", half: true },
      { key: "authority", type: "area", req: true, map: "detail", half: true },
      { key: "reporting", type: "select", req: true, map: "detail", half: true, opts: "reporting" },
      { key: "policies", type: "area", req: false, map: "detail", half: true },
      { key: "oversight", type: "select", req: true, map: "detail", half: true, opts: "oversight" },
    ] },
    { id: "resources", fields: [
      { key: "budgetTag", type: "tag", req: true, map: "detail", half: true },
      { key: "recruit", type: "area", req: false, map: "detail", half: true },
      { key: "allocate", type: "area", req: true, map: "detail", half: true },
      { key: "operatingPlan", type: "select", req: true, map: "detail", half: true, opts: "operatingPlan" },
    ] },
  ] },
};
/** Every key of the details a flow writes (the server accepts exactly these). */
export const DETAIL_KEYS: string[] = [...new Set(Object.values(FLOWS).flatMap((f) => f.steps.flatMap((s) => s.fields.filter((x) => x.map === 'detail' || x.map === 'aim').map((x) => x.key))))];
