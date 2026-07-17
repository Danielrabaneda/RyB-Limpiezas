import { useState, useEffect } from "react";
import { useNotifications } from "../contexts/NotificationContext";
import {
  startWorkday,
  endWorkday,
  closeStaleWorkday,
  findLastActivityForUser,
} from "../services/workdayService";
import { completeCheckOut } from "../services/checkInService";
import { format, differenceInMinutes } from "date-fns";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../config/firebase";
import { getCurrentLocation } from "../utils/geolocation";

export function useWorkdayLifecycle(
  userProfile,
  {
    activeWorkday,
    setActiveWorkday,
    staleWorkday,
    setStaleWorkday,
    activeCheckIn,
    setActiveCheckIn,
    enrichedServices,
    loadToday,
    actionLoading,
    setActionLoading,
  },
) {
  const { triggerWorkdayStartPopups, triggerWorkdayEndPopups } =
    useNotifications();
  const [retroactiveModal, setRetroactiveModal] = useState({
    open: false,
    suggestedTime: null,
    suggestedTimeStr: "",
    actualTimeStr: "",
    workdayId: null,
    allTasksCompleted: false,
  });

  // Popup de inicio de jornada
  useEffect(() => {
    if (activeWorkday) {
      triggerWorkdayStartPopups();
    }
  }, [activeWorkday, triggerWorkdayStartPopups]);

  const handleStartWorkday = async () => {
    if (!userProfile?.uid) return;
    setActionLoading(true);
    try {
      const name = userProfile.name || userProfile.displayName || "Operario";
      await startWorkday(userProfile.uid, name);
      await loadToday();
    } catch (err) {
      console.error(err);
      alert("Error al iniciar jornada: " + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleEndWorkday = async () => {
    if (!activeWorkday) return;

    setActionLoading(true);
    try {
      // Verificar si hay un servicio/portal activo y en curso
      if (activeCheckIn) {
        setActionLoading(false);
        const confirmClose = window.confirm(
          `Tienes un servicio en curso en "${activeCheckIn.communityName}". ¿Deseas finalizar este servicio automáticamente y terminar tu jornada?`,
        );
        if (!confirmClose) return;

        setActionLoading(true);
        const loc = await getCurrentLocation();
        const lat = loc?.lat || 0;
        const lng = loc?.lng || 0;

        await completeCheckOut(activeCheckIn.id, lat, lng, null, null, loc);

        // Cargar check-ins de los acompañantes
        try {
          const qComp = query(
            collection(db, "checkIns"),
            where("scheduledServiceId", "==", activeCheckIn.scheduledServiceId),
            where("checkOutTime", "==", null),
          );
          const compSnap = await getDocs(qComp);
          for (const docSnap of compSnap.docs) {
            if (docSnap.id !== activeCheckIn.id) {
              await completeCheckOut(docSnap.id, lat, lng, null, null, loc);
            }
          }
        } catch (compErr) {
          console.warn(
            "[TodayPage] Error al finalizar check-outs de los acompañantes:",
            compErr,
          );
        }

        setActiveCheckIn(null);
      }

      // 1. Buscar la última actividad registrada para este usuario hoy
      const lastActivity = await findLastActivityForUser(
        userProfile.uid,
        new Date(),
        activeWorkday.id,
      );

      // 2. Verificar si todas las tareas del día están completadas
      const allTasksCompleted =
        enrichedServices.length > 0 &&
        enrichedServices.every((s) => s.status === "completed");

      if (lastActivity) {
        const diffMins = differenceInMinutes(new Date(), lastActivity);
        if (diffMins > 30) {
          setRetroactiveModal({
            open: true,
            suggestedTime: lastActivity,
            suggestedTimeStr: format(lastActivity, "HH:mm"),
            actualTimeStr: format(new Date(), "HH:mm"),
            workdayId: activeWorkday.id,
            allTasksCompleted,
          });
          setActionLoading(false);
          return;
        }
      }

      setActionLoading(false);
      if (
        !window.confirm(
          "¿Estás seguro de que quieres finalizar tu jornada laboral?",
        )
      )
        return;

      setActionLoading(true);
      const breadcrumbs = JSON.parse(
        localStorage.getItem("ryb_car_breadcrumbs") || "[]",
      );
      await endWorkday(activeWorkday.id, breadcrumbs);
      localStorage.removeItem("ryb_car_breadcrumbs");
      await loadToday();
      triggerWorkdayEndPopups();
    } catch (err) {
      console.error("Error al finalizar jornada:", err);
      alert("Error al finalizar jornada: " + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleResolveEndWorkday = async (useRetroactive) => {
    if (!activeWorkday) return;
    setActionLoading(true);
    try {
      const breadcrumbs = JSON.parse(
        localStorage.getItem("ryb_car_breadcrumbs") || "[]",
      );
      const endTime =
        useRetroactive && retroactiveModal.suggestedTime
          ? retroactiveModal.suggestedTime
          : new Date();

      if (activeCheckIn) {
        try {
          const loc = await getCurrentLocation();
          const lat = loc?.lat || activeCheckIn.checkInLocation?.latitude || 0;
          const lng = loc?.lng || activeCheckIn.checkInLocation?.longitude || 0;
          const exceptionReason = useRetroactive
            ? window.prompt(
                "Indica el motivo del cierre retroactivo del servicio (obligatorio):",
              )
            : null;
          if (useRetroactive && (!exceptionReason || !exceptionReason.trim())) {
            setActionLoading(false);
            return;
          }
          await completeCheckOut(
            activeCheckIn.id,
            lat,
            lng,
            useRetroactive ? endTime : null,
            null,
            {
              ...loc,
              exceptionReason,
            },
          );

          try {
            const qComp = query(
              collection(db, "checkIns"),
              where(
                "scheduledServiceId",
                "==",
                activeCheckIn.scheduledServiceId,
              ),
              where("checkOutTime", "==", null),
            );
            const compSnap = await getDocs(qComp);
            for (const docSnap of compSnap.docs) {
              if (docSnap.id !== activeCheckIn.id) {
                await completeCheckOut(
                  docSnap.id,
                  lat,
                  lng,
                  useRetroactive ? endTime : null,
                  null,
                  {
                    ...loc,
                    exceptionReason,
                  },
                );
              }
            }
          } catch (compErr) {
            console.warn(
              "[TodayPage] Error al finalizar check-outs de los acompañantes:",
              compErr,
            );
          }

          setActiveCheckIn(null);
        } catch (err) {
          console.error(
            "[TodayPage] Error al auto-cerrar servicio en resolución de jornada:",
            err,
          );
        }
      }

      if (useRetroactive && retroactiveModal.suggestedTime) {
        await endWorkday(
          activeWorkday.id,
          breadcrumbs,
          retroactiveModal.suggestedTime,
        );
      } else {
        await endWorkday(activeWorkday.id, breadcrumbs, null);
      }

      localStorage.removeItem("ryb_car_breadcrumbs");
      setRetroactiveModal({
        open: false,
        suggestedTime: null,
        suggestedTimeStr: "",
        actualTimeStr: "",
        workdayId: null,
        allTasksCompleted: false,
      });
      await loadToday();
      triggerWorkdayEndPopups();
    } catch (err) {
      console.error(err);
      alert("Error al procesar el fin de jornada: " + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleResolveStaleWorkday = async () => {
    if (!staleWorkday) return;
    setActionLoading(true);
    try {
      await closeStaleWorkday(
        staleWorkday.workday.id,
        staleWorkday.suggestedEndTime,
      );
      setStaleWorkday(null);
      alert(
        "Jornada anterior cerrada correctamente. Ahora puedes iniciar la de hoy.",
      );
      await loadToday();
    } catch (err) {
      alert("Error al cerrar jornada anterior: " + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  return {
    retroactiveModal,
    setRetroactiveModal,
    handleStartWorkday,
    handleEndWorkday,
    handleResolveEndWorkday,
    handleResolveStaleWorkday,
  };
}
