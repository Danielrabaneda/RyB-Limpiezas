import { httpsCallable } from "firebase/functions";
import { functions } from "../config/firebase";
import { DATA_PROCESSING_AGREEMENT_VERSION } from "../constants/dataProcessingAgreement";

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

export function getPlatformNewCompanyCount() {
  return call("getPlatformNewCompanyCount");
}

export function markPlatformCompaniesReviewed() {
  return call("markPlatformCompaniesReviewed");
}

export function updateCompanyCommercialState(companyId, patch) {
  return call("updateCompanyCommercialState", { companyId, patch });
}

export function acceptDataProcessingAgreement() {
  return call("acceptDataProcessingAgreement", {
    accepted: true,
    version: DATA_PROCESSING_AGREEMENT_VERSION,
  });
}
