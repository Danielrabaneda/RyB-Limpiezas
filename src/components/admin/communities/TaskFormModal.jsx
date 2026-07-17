import React from "react";

export default function TaskFormModal({
  showTaskModal,
  setShowTaskModal,
  editingTask,
  setEditingTask,
  taskForm,
  setTaskForm,
  handleSaveTask,
  operarios,
  WEEKDAYS,
  MONTHS,
  FREQ_LABELS,
  toggleWeekDay,
}) {
  if (!showTaskModal) return null;

  return (
    <div
      className="modal-overlay"
      onClick={() => {
        setShowTaskModal(false);
        setEditingTask(null);
      }}
    >
      <div
        className="modal"
        style={{ maxWidth: "600px" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 className="modal-title">
            {editingTask ? "✏️ Editar tarea" : "➕ Nueva tarea"}
          </h3>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setShowTaskModal(false);
              setEditingTask(null);
            }}
          >
            ✕
          </button>
        </div>
        <form onSubmit={handleSaveTask}>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label">Nombre de la tarea</label>
              <input
                className="form-input"
                value={taskForm.taskName}
                onChange={(e) =>
                  setTaskForm((f) => ({ ...f, taskName: e.target.value }))
                }
                placeholder="Ej: Limpieza de portal"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Color en calendario impreso</label>
              <div className="flex items-center gap-3">
                {[
                  { color: "#22c55e", label: "Escalera" },
                  { color: "#eab308", label: "Portal" },
                  { color: "#3b82f6", label: "Oficina" },
                  { color: "#ef4444", label: "Otras" },
                ].map((opt) => (
                  <button
                    key={opt.color}
                    type="button"
                    onClick={() =>
                      setTaskForm((f) => ({ ...f, printColor: opt.color }))
                    }
                    style={{
                      width: "36px",
                      height: "36px",
                      borderRadius: "50%",
                      backgroundColor: opt.color,
                      border:
                        taskForm.printColor === opt.color
                          ? "3px solid #000"
                          : "2px solid rgba(0,0,0,0.15)",
                      cursor: "pointer",
                      boxShadow:
                        taskForm.printColor === opt.color
                          ? "0 0 0 2px white, 0 0 0 4px " + opt.color
                          : "none",
                      transition: "all 0.15s ease",
                    }}
                    title={opt.label}
                  />
                ))}
              </div>
              <p className="text-xs text-muted mt-1">
                🟢 Limpieza Escalera &nbsp; 🟡 Repaso Portal &nbsp; 🔵 Limpieza
                Oficina &nbsp; 🔴 Otras tareas
              </p>
            </div>

            <div className="form-group">
              <label className="flex items-center gap-3 cursor-pointer p-3 bg-slate-50 rounded-xl border border-slate-200">
                <input
                  type="checkbox"
                  style={{ width: "20px", height: "20px", cursor: "pointer" }}
                  checked={taskForm.isGarage}
                  onChange={(e) =>
                    setTaskForm((f) => ({ ...f, isGarage: e.target.checked }))
                  }
                />
                <div>
                  <span className="font-bold text-slate-900 block">
                    🚗 Es Limpieza de Garaje
                  </span>
                  <span className="text-xs text-slate-500">
                    Si se marca, aparecerá en el cuadrante anual.
                  </span>
                  {taskForm.isGarage && taskForm.serviceMode === "periodic" && (
                    <div className="mt-1 px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-[9px] font-bold inline-block animate-pulse">
                      💡 TIP: Elige un día de la semana (ej: Viernes)
                    </div>
                  )}
                </div>
              </label>
            </div>

            <div className="form-group">
              <label
                className="flex items-center gap-3 cursor-pointer p-3 rounded-xl border"
                style={{
                  background: taskForm.isUrgent ? "#fff5f5" : "#f8fafc",
                  borderColor: taskForm.isUrgent ? "#fecaca" : "#e2e8f0",
                  transition: "all 0.2s ease",
                }}
              >
                <input
                  type="checkbox"
                  style={{ width: "20px", height: "20px", cursor: "pointer" }}
                  checked={taskForm.isUrgent || false}
                  onChange={(e) =>
                    setTaskForm((f) => ({ ...f, isUrgent: e.target.checked }))
                  }
                />
                <div>
                  <span
                    className="font-bold block"
                    style={{ color: taskForm.isUrgent ? "#991b1b" : "#0f172a" }}
                  >
                    🚨 Marcar como Urgente (Rojo e Intermitente)
                  </span>
                  <span className="text-xs text-slate-500">
                    Si se marca, la tarea aparecerá en rojo y con brillo
                    parpadeante en la app móvil.
                  </span>
                </div>
              </label>
            </div>

            <div className="form-group">
              <label className="form-label">
                Asignar a operario (Opcional)
              </label>
              <select
                className="form-select"
                value={taskForm.assignedUserId}
                onChange={(e) =>
                  setTaskForm((f) => ({ ...f, assignedUserId: e.target.value }))
                }
              >
                <option value="">— Cualquiera asignado a la comunidad —</option>
                {operarios
                  .filter((o) => o.active)
                  .map((op) => (
                    <option key={op.uid} value={op.uid}>
                      {op.name} ({op.email})
                    </option>
                  ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Tipo de programación</label>
              <div className="grid grid-3 gap-2 bg-slate-50 p-1 rounded-lg">
                <button
                  type="button"
                  className={`btn btn-sm ${taskForm.serviceMode === "periodic" ? "btn-primary" : "btn-ghost"}`}
                  onClick={() =>
                    setTaskForm((f) => ({ ...f, serviceMode: "periodic" }))
                  }
                >
                  Periódica
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${taskForm.serviceMode === "once" ? "btn-primary" : "btn-ghost"}`}
                  onClick={() =>
                    setTaskForm((f) => ({ ...f, serviceMode: "once" }))
                  }
                >
                  Un solo día
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${taskForm.serviceMode === "range" ? "btn-primary" : "btn-ghost"}`}
                  onClick={() =>
                    setTaskForm((f) => ({ ...f, serviceMode: "range" }))
                  }
                >
                  Periodo (Días seguidos)
                </button>
              </div>
            </div>

            {taskForm.serviceMode === "once" && (
              <div className="form-group animate-slideDown">
                <label className="form-label">Fecha concreta</label>
                <input
                  type="date"
                  className="form-input"
                  value={taskForm.punctualDate}
                  onChange={(e) =>
                    setTaskForm((f) => ({ ...f, punctualDate: e.target.value }))
                  }
                  required
                />
              </div>
            )}

            {taskForm.serviceMode === "range" && (
              <div className="form-row animate-slideDown p-4 bg-slate-50 rounded-xl mb-4 border border-slate-200">
                <div className="form-group mb-0">
                  <label className="form-label text-xs font-bold uppercase text-slate-500">
                    Desde
                  </label>
                  <input
                    type="date"
                    className="form-input"
                    value={taskForm.startDate}
                    onChange={(e) =>
                      setTaskForm((f) => ({ ...f, startDate: e.target.value }))
                    }
                    required
                  />
                </div>
                <div className="form-group mb-0">
                  <label className="form-label text-xs font-bold uppercase text-slate-500">
                    Hasta
                  </label>
                  <input
                    type="date"
                    className="form-input"
                    value={taskForm.endDate}
                    onChange={(e) =>
                      setTaskForm((f) => ({ ...f, endDate: e.target.value }))
                    }
                    required
                  />
                </div>
              </div>
            )}

            {taskForm.serviceMode === "periodic" && (
              <>
                <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl mb-4">
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label font-bold text-indigo-900">
                        Frecuencia
                      </label>
                      <select
                        className="form-select border-indigo-200"
                        value={taskForm.frequencyType}
                        onChange={(e) =>
                          setTaskForm((f) => ({
                            ...f,
                            frequencyType: e.target.value,
                          }))
                        }
                      >
                        <option value="weekly">Semanal</option>
                        <option value="biweekly">Quincenal</option>
                        <option value="monthly">Mensual</option>
                        <option value="bimonthly">Cada 2 meses</option>
                        <option value="trimonthly">Cada 3 meses</option>
                        <option value="quadrimonthly">Cada 4 meses</option>
                        <option value="semiannual">Cada 6 meses</option>
                        <option value="eightmonthly">Cada 8 meses</option>
                        <option value="annual">Anual</option>
                      </select>
                      {[
                        "bimonthly",
                        "trimonthly",
                        "quadrimonthly",
                        "semiannual",
                        "eightmonthly",
                      ].includes(taskForm.frequencyType) && (
                        <div className="mt-2 text-[10px] text-indigo-600 font-medium">
                          Se programará en:{" "}
                          {taskForm.frequencyType === "bimonthly"
                            ? "Ene, Mar, May, Jul, Sep, Nov"
                            : taskForm.frequencyType === "trimonthly"
                              ? "Ene, Abr, Jul, Oct"
                              : taskForm.frequencyType === "quadrimonthly"
                                ? "Ene, May, Sep"
                                : taskForm.frequencyType === "semiannual"
                                  ? "Ene, Jul"
                                  : "Ene, Sep"}
                        </div>
                      )}
                    </div>
                    <div className="form-group">
                      <label className="form-label font-bold text-indigo-900">
                        Veces (X)
                      </label>
                      <input
                        className="form-input border-indigo-200"
                        type="number"
                        min="1"
                        value={taskForm.frequencyValue}
                        onChange={(e) =>
                          setTaskForm((f) => ({
                            ...f,
                            frequencyValue: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>

                  {taskForm.serviceMode === "periodic" && (
                    <div className="form-group mt-2">
                      <label className="form-label text-xs font-bold text-indigo-700">
                        Días de la semana
                      </label>
                      <div className="chip-group">
                        {WEEKDAYS.map((d) => (
                          <button
                            type="button"
                            key={d.val}
                            className={`chip ${taskForm.weekDays.includes(d.val) ? "selected" : ""}`}
                            onClick={() => toggleWeekDay(d.val)}
                          >
                            {d.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {[
                    "monthly",
                    "bimonthly",
                    "trimonthly",
                    "quadrimonthly",
                    "semiannual",
                    "eightmonthly",
                    "annual",
                  ].includes(taskForm.frequencyType) && (
                    <div className="form-group mt-2">
                      <div className="grid grid-2 gap-4">
                        <div>
                          <label className="text-xs font-bold text-indigo-700">
                            Días del mes (Ej: 1, 15)
                          </label>
                          <input
                            className="form-input border-indigo-200"
                            placeholder="Ej: 1, 15"
                            value={taskForm.monthDays.join(", ")}
                            onChange={(e) =>
                              setTaskForm((f) => ({
                                ...f,
                                monthDays: e.target.value
                                  .split(",")
                                  .map((s) => s.trim())
                                  .filter(Boolean),
                              }))
                            }
                          />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-indigo-700">
                            Semana del mes
                          </label>
                          <select
                            className="form-select border-indigo-200"
                            value={taskForm.weekOfMonth}
                            onChange={(e) =>
                              setTaskForm((f) => ({
                                ...f,
                                weekOfMonth: e.target.value,
                              }))
                            }
                          >
                            <option value="">Cualquier semana</option>
                            <option value="1">1ª semana</option>
                            <option value="2">2ª semana</option>
                            <option value="3">3ª semana</option>
                            <option value="4">4ª semana</option>
                            <option value="5">Última semana</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div
                  className="p-4 rounded-xl border-2 transition-all"
                  style={{
                    background: taskForm.flexibleWeek
                      ? "var(--color-warning-light)"
                      : "#f8fafc",
                    borderColor: taskForm.flexibleWeek
                      ? "var(--color-warning)"
                      : "var(--color-border)",
                    boxShadow: taskForm.flexibleWeek
                      ? "0 4px 12px rgba(245, 158, 11, 0.1)"
                      : "none",
                  }}
                >
                  <label className="flex items-center gap-3 cursor-pointer">
                    <div
                      className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${taskForm.flexibleWeek ? "bg-warning border-warning" : "border-slate-300"}`}
                    >
                      {taskForm.flexibleWeek && (
                        <span className="text-white text-xs">✓</span>
                      )}
                    </div>
                    <input
                      type="checkbox"
                      className="hidden"
                      checked={taskForm.flexibleWeek}
                      onChange={(e) =>
                        setTaskForm((f) => ({
                          ...f,
                          flexibleWeek: e.target.checked,
                        }))
                      }
                    />
                    <div>
                      <span className="font-bold text-slate-900 block">
                        📅 Tarea de Semana Flexible
                      </span>
                      <span className="text-xs text-slate-500">
                        Aparecerá toda la semana hasta que se marque como
                        "Hecho"
                      </span>
                    </div>
                  </label>
                </div>

                <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg mt-4">
                  <h4 className="text-xs font-bold text-blue-800 uppercase mb-2">
                    Configuración avanzada de inicio
                  </h4>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="text-xs text-blue-700 font-semibold text-muted">
                        Mes de inicio/específico
                      </label>
                      <select
                        className="form-select"
                        value={taskForm.monthOfYear}
                        onChange={(e) =>
                          setTaskForm((f) => ({
                            ...f,
                            monthOfYear: e.target.value,
                          }))
                        }
                      >
                        <option value="">
                          A partir de ahora / Todos los meses
                        </option>
                        {MONTHS.map((m) => (
                          <option key={m.val} value={m.val}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="text-xs text-blue-700 font-semibold text-muted">
                        A partir del día
                      </label>
                      <input
                        type="date"
                        className="form-input"
                        value={taskForm.startDate}
                        onChange={(e) =>
                          setTaskForm((f) => ({
                            ...f,
                            startDate: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setShowTaskModal(false);
                setEditingTask(null);
              }}
            >
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary">
              {editingTask ? "Guardar cambios" : "Crear tarea"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
