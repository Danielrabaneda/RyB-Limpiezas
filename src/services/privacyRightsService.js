import { httpsCallable } from "firebase/functions";
import { functions } from "../config/firebase";

export async function submitPrivacyRightsRequest(type, details) {
  const callable = httpsCallable(functions, "submitPrivacyRightsRequest");
  return (await callable({ type, details })).data;
}

export async function listPrivacyRightsRequests() {
  const callable = httpsCallable(functions, "listPrivacyRightsRequests");
  return (await callable()).data;
}

export async function exportPrivacyRightsData(requestId) {
  const callable = httpsCallable(functions, "exportPrivacyRightsData");
  return (await callable({ requestId })).data;
}

export async function applyPrivacyRightsAction(requestId, action, extra = {}) {
  const callable = httpsCallable(functions, "applyPrivacyRightsAction");
  return (await callable({ requestId, action, ...extra })).data;
}
