import { useState, useEffect, useMemo } from "react";
import { getOperarios } from "../services/authService";
import {
  updateWorkdayCompanion,
  activateCar,
  deactivateCar,
} from "../services/workdayService";
import { saveManualMileage } from "../services/mileageService";
import {
  addCompanionToService,
  removeCompanionFromService,
} from "../services/scheduleService";
import { createCheckIn, deleteCheckIn } from "../services/checkInService";
import { getDistance } from "../utils/geolocation";
import { format } from "date-fns";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../config/firebase";

export function useCarAndCompanion(
  userProfile,
  {
    activeWorkday,
    activeCheckIn,
    activeWorkdaysList,
    loadToday,
    actionLoading,
    setActionLoading,
  },
) {
  const [allOperarios, setAllOperarios] = useState([]);
  const [companionSelectorOpen, setCompanionSelectorOpen] = useState(false);
  const [mileageModalOpen, setMileageModalOpen] = useState(false);
  const [manualKm, setManualKm] = useState("");

  // Cargar lista de operarios
  useEffect(() => {
    async function loadOps() {
      if (!userProfile?.uid) return;
      try {
        const ops = await getOperarios();
        setAllOperarios(
          ops.filter((o) => o.uid !== userProfile.uid && o.active),
        );
      } catch (err) {
        console.error("Error loading operarios", err);
      }
    }
    loadOps();
  }, [userProfile]);

  // Wake lock y watchPosition para registrar el trayecto del vehículo
  useEffect(() => {
    let watchId = null;
    let wakeLock = null;

    const requestWakeLock = async () => {
      try {
        if ("wakeLock" in navigator) {
          wakeLock = await navigator.wakeLock.request("screen");
        }
      } catch (err) {
        console.warn(
          "[WakeLock] No se pudo activar el bloqueo de pantalla:",
          err,
        );
      }
    };

    const releaseWakeLock = async () => {
      try {
        if (wakeLock) {
          await wakeLock.release();
          wakeLock = null;
        }
      } catch (err) {
        console.error("[WakeLock] Error al liberar bloqueo:", err);
      }
    };

    const handleVisibilityChange = async () => {
      if (document.visibilityState === "visible" && activeWorkday?.carActive) {
        await requestWakeLock();
      }
    };

    if (activeWorkday && activeWorkday.carActive) {
      requestWakeLock();
      document.addEventListener("visibilitychange", handleVisibilityChange);

      const processPosition = (pos) => {
        const currentBreadcrumb = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          timestamp: Date.now(),
        };

        try {
          const existing = JSON.parse(
            localStorage.getItem("ryb_car_breadcrumbs") || "[]",
          );

          if (existing.length > 0) {
            const last = existing[existing.length - 1];
            const dist = getDistance(
              last.lat,
              last.lng,
              currentBreadcrumb.lat,
              currentBreadcrumb.lng,
            );
            const timeDiff = currentBreadcrumb.timestamp - last.timestamp;

            // Guardar si se ha movido > 50m o pasaron > 2 minutos (120s)
            if (dist >= 50 || timeDiff >= 120000) {
              existing.push(currentBreadcrumb);
              localStorage.setItem(
                "ryb_car_breadcrumbs",
                JSON.stringify(existing),
              );
            }
          } else {
            existing.push(currentBreadcrumb);
            localStorage.setItem(
              "ryb_car_breadcrumbs",
              JSON.stringify(existing),
            );
          }
        } catch (e) {
          console.error(
            "[GPS] Error guardando breadcrumb en watchPosition:",
            e,
          );
        }
      };

      if ("geolocation" in navigator) {
        watchId = navigator.geolocation.watchPosition(
          processPosition,
          (error) => console.warn("[GPS] watchPosition error:", error),
          {
            enableHighAccuracy: true,
            timeout: 20000,
            maximumAge: 30000,
          },
        );
      }
    }

    return () => {
      releaseWakeLock();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (watchId !== null && "geolocation" in navigator) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [activeWorkday?.carActive]);

  const handleSetCompanion = async (companionId) => {
    if (!activeWorkday) return;
    const oldCompanionId = activeWorkday.currentCompanionId;
    setActionLoading(true);
    try {
      await updateWorkdayCompanion(activeWorkday.id, companionId);

      if (activeCheckIn?.scheduledServiceId) {
        // Eliminar acompañante viejo
        if (oldCompanionId && oldCompanionId !== companionId) {
          try {
            await removeCompanionFromService(
              activeCheckIn.scheduledServiceId,
              oldCompanionId,
            );

            const qComp = query(
              collection(db, "checkIns"),
              where(
                "scheduledServiceId",
                "==",
                activeCheckIn.scheduledServiceId,
              ),
              where("userId", "==", oldCompanionId),
              where("checkOutTime", "==", null),
            );
            const compSnap = await getDocs(qComp);
            for (const docSnap of compSnap.docs) {
              await deleteCheckIn(docSnap.id);
            }
          } catch (e) {
            console.warn("Could not remove old companion check-in", e);
          }
        }
        // Añadir nuevo acompañante
        if (companionId && companionId !== oldCompanionId) {
          await addCompanionToService(
            activeCheckIn.scheduledServiceId,
            companionId,
          );

          try {
            await createCheckIn({
              userId: companionId,
              communityId: activeCheckIn.communityId,
              scheduledServiceId: activeCheckIn.scheduledServiceId,
              lat: activeCheckIn.checkInLocation?.latitude || 0,
              lng: activeCheckIn.checkInLocation?.longitude || 0,
              manualTime: activeCheckIn.checkInTime?.toDate
                ? activeCheckIn.checkInTime.toDate()
                : new Date(activeCheckIn.checkInTime),
              exceptionReason:
                "Incorporación de acompañante durante un servicio ya iniciado.",
            });
          } catch (e) {
            console.warn("Could not create check-in for new companion", e);
          }
        }
      }

      await loadToday();
      setCompanionSelectorOpen(false);
    } catch (err) {
      alert("Error al asignar acompañante: " + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleCar = async () => {
    if (!activeWorkday) return;
    setActionLoading(true);
    try {
      if (activeWorkday.carActive) {
        const breadcrumbs = JSON.parse(
          localStorage.getItem("ryb_car_breadcrumbs") || "[]",
        );
        await deactivateCar(activeWorkday.id, breadcrumbs);
        localStorage.removeItem("ryb_car_breadcrumbs");
      } else {
        localStorage.setItem("ryb_car_breadcrumbs", "[]");
        await activateCar(activeWorkday.id);
      }
      await loadToday();
    } catch (err) {
      alert("Error al cambiar modo coche: " + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleManualMileage = async () => {
    if (!manualKm || isNaN(manualKm)) {
      alert("Por favor, ingresa un número válido de kilómetros");
      return;
    }
    setActionLoading(true);
    try {
      const name = userProfile.name || userProfile.displayName || "Operario";
      await saveManualMileage(userProfile.uid, name, new Date(), manualKm);
      alert("Kilometraje guardado correctamente");
      setMileageModalOpen(false);
      setManualKm("");
    } catch (err) {
      alert("Error al guardar kilometraje: " + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Resolver conflicto de coche compartido
  const handleResolveCarConflict = async (companionDrives) => {
    setActionLoading(true);
    try {
      if (companionDrives) {
        // Desactivar mi coche
        const breadcrumbs = JSON.parse(
          localStorage.getItem("ryb_car_breadcrumbs") || "[]",
        );
        await deactivateCar(activeWorkday.id, breadcrumbs);
        localStorage.removeItem("ryb_car_breadcrumbs");
      } else {
        // Desactivar coche del compañero
        await deactivateCar(companionInfo.workday.id, []);
      }
      await loadToday();
    } catch (e) {
      console.error("Error al resolver conflicto de coche:", e);
      alert("Error al resolver el conflicto. Por favor inténtalo de nuevo.");
    } finally {
      setActionLoading(false);
    }
  };

  // Obtener info del acompañante en tiempo real
  const companionInfo = useMemo(() => {
    if (!activeWorkday)
      return { uid: null, workday: null, carActive: false, name: "" };

    let companionUid = activeWorkday.currentCompanionId;

    if (!companionUid) {
      const titularWd = activeWorkdaysList.find(
        (d) =>
          d.currentCompanionId === userProfile?.uid &&
          d.userId !== userProfile?.uid,
      );
      if (titularWd) {
        companionUid = titularWd.userId;
      }
    }

    if (!companionUid)
      return { uid: null, workday: null, carActive: false, name: "" };

    const compWd = activeWorkdaysList.find((d) => d.userId === companionUid);
    const opInfo = allOperarios.find((o) => o.uid === companionUid);
    const name = opInfo?.name?.split(" ")[0] || "Compañero";

    return {
      uid: companionUid,
      workday: compWd || null,
      carActive: compWd?.carActive === true,
      name: name,
    };
  }, [activeWorkday, activeWorkdaysList, allOperarios, userProfile?.uid]);

  const hasCarConflict =
    activeWorkday?.carActive === true && companionInfo.carActive === true;

  return {
    allOperarios,
    companionSelectorOpen,
    setCompanionSelectorOpen,
    mileageModalOpen,
    setMileageModalOpen,
    manualKm,
    setManualKm,
    handleSetCompanion,
    handleToggleCar,
    handleManualMileage,
    handleResolveCarConflict,
    companionInfo,
    hasCarConflict,
  };
}
