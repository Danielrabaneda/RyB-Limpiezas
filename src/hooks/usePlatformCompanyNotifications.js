import { useEffect, useState } from "react";
import { getPlatformNewCompanyCount } from "../services/platformService";

export const PLATFORM_COMPANIES_REVIEWED_EVENT =
  "limpiagest-platform-companies-reviewed";

export default function usePlatformCompanyNotifications(enabled) {
  const [newCompanyCount, setNewCompanyCount] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setNewCompanyCount(0);
      return undefined;
    }

    let active = true;
    const loadCount = async () => {
      try {
        const result = await getPlatformNewCompanyCount();
        if (active) setNewCompanyCount(Number(result?.count) || 0);
      } catch (error) {
        console.warn("No se pudo cargar el aviso de empresas nuevas:", error);
      }
    };
    const clearCount = () => setNewCompanyCount(0);

    loadCount();
    window.addEventListener(PLATFORM_COMPANIES_REVIEWED_EVENT, clearCount);
    return () => {
      active = false;
      window.removeEventListener(PLATFORM_COMPANIES_REVIEWED_EVENT, clearCount);
    };
  }, [enabled]);

  return newCompanyCount;
}
