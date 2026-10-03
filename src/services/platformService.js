import { httpsCallable } from "firebase/functions";
import { functions } from "../config/firebase";

async function call(name, data = {}) {
  const result = await httpsCallable(functions, name)(data);
  return result.data;
}

export async function listCompanyRequests() {
  const result = await call("listCompanyRequests");
  return result.requests || [];
}

export function updateCompanyRequest(id, status) {
  return call("updateCompanyRequest", { id, status });
}

export function deleteCompanyRequest(id) {
  return call("deleteCompanyRequest", { id });
}

export function provisionCompanyFromRequest(data) {
  return call("provisionCompanyFromRequest", data);
}

export function getPlatformDashboard() {
  return call("getPlatformDashboard");
}

export function updateCompanyCommercialState(companyId, patch) {
  return call("updateCompanyCommercialState", { companyId, patch });
}
