import { httpsCallable } from "firebase/functions";
import { functions } from "../config/firebase";

export async function openSubscriptionCheckout(plan) {
  const result = await httpsCallable(functions, "createSubscriptionCheckout")({
    plan,
    returnUrl: `${window.location.origin}/admin/ajustes`,
  });
  window.location.assign(result.data.url);
}

export async function openSubscriptionPortal() {
  const result = await httpsCallable(functions, "createSubscriptionPortal")({
    returnUrl: `${window.location.origin}/admin/ajustes`,
  });
  window.location.assign(result.data.url);
}
