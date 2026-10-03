import { addDoc, getDocs, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../config/firebase";
import { tenantCollection, tenantDoc } from "../utils/tenantFirestore";

export const DEFAULT_STAGES = [
  { id: "new", name: "Nuevo lead", color: "#64748b", probability: 10 },
  { id: "contacted", name: "Contactado", color: "#3b82f6", probability: 25 },
  { id: "qualified", name: "Interesado", color: "#8b5cf6", probability: 45 },
  { id: "quote_sent", name: "Presupuesto enviado", color: "#f59e0b", probability: 60 },
  { id: "negotiation", name: "En negociación", color: "#f97316", probability: 75 },
  { id: "won", name: "Ganado", color: "#10b981", probability: 100 },
  { id: "lost", name: "Perdido", color: "#ef4444", probability: 0 },
];

export async function getOpportunities(companyId) {
  const snap = await getDocs(tenantCollection(db, companyId, "opportunities"));
  return snap.docs.map((item) => ({ id: item.id, ...item.data() }))
    .sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
}

export async function createOpportunity(companyId, data, user) {
  const now = new Date().toISOString();
  const ref = await addDoc(tenantCollection(db, companyId, "opportunities"), {
    ...data,
    stage: data.stage || "new",
    probability: Number(data.probability ?? 10),
    estimatedValue: Number(data.estimatedValue || 0),
    createdBy: user?.uid || "",
    activities: [{ id: `${Date.now()}`, type: "created", title: "Oportunidad creada", at: now, by: user?.email || "" }],
    lastActivityAt: now,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateOpportunity(companyId, id, data) {
  await updateDoc(tenantDoc(db, companyId, "opportunities", id), { ...data, updatedAt: serverTimestamp() });
}

export async function moveOpportunity(companyId, opportunity, stage, user, extra = {}) {
  const event = { id: `${Date.now()}`, type: "stage", title: `Etapa cambiada a ${DEFAULT_STAGES.find((s) => s.id === stage)?.name || stage}`, at: new Date().toISOString(), by: user?.email || "" };
  const data = { stage, ...extra, activities: [...(opportunity.activities || []), event], lastActivityAt: event.at };
  await updateOpportunity(companyId, opportunity.id, data);
  return data;
}

export async function addOpportunityActivity(companyId, opportunity, activity, user) {
  const item = { id: `${Date.now()}`, ...activity, at: new Date().toISOString(), by: user?.email || "" };
  const data = { activities: [...(opportunity.activities || []), item], lastActivityAt: item.at };
  if (activity.reminderAt) data.nextReminderAt = activity.reminderAt;
  await updateOpportunity(companyId, opportunity.id, data);
  return data;
}

export async function importOpportunities(companyId, rows, user) {
  const ids = [];
  for (const row of rows) ids.push(await createOpportunity(companyId, row, user));
  return ids;
}
