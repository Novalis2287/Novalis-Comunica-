// Convierte el registro de visitas reales del alumno en un resumen de texto
// para el profesor: qué puntos del flujo cumple y cuáles se le resisten.
const RESULTADOS = {
  acepto: "aceptó el tratamiento",
  pensarlo: "lo tiene que pensar",
  no: "no aceptó",
  "sin-plan": "no se presentó plan en esta visita",
};

const MAX_VISITAS = 60;
const MAX_NOTAS = 600;

// Acepta solo la forma esperada y descarta todo lo demás (los datos llegan del navegador).
export function limpiarVisitas(visitas) {
  return (Array.isArray(visitas) ? visitas : [])
    .filter((v) => v && typeof v === "object" && v.puntos && typeof v.puntos === "object")
    .slice(-MAX_VISITAS)
    .map((v) => ({
      fecha: String(v.fecha || "").slice(0, 10),
      resultado: RESULTADOS[v.resultado] ? v.resultado : "sin-plan",
      objecion: String(v.objecion || "").slice(0, 80),
      notas: String(v.notas || "").slice(0, MAX_NOTAS),
      puntos: Object.fromEntries(Object.entries(v.puntos).filter(([, hecho]) => hecho === true).map(([id]) => [String(id).slice(0, 40), true])),
    }));
}

export function calcularProgreso(visitas, flujo) {
  const total = visitas.length;
  const pasos = flujo.pasos.map((paso) => {
    const puntos = paso.puntos.map((p) => ({
      id: p.id,
      texto: p.texto,
      hechas: visitas.filter((v) => v.puntos[p.id]).length,
    }));
    const hechas = puntos.reduce((a, p) => a + p.hechas, 0);
    return { id: paso.id, titulo: paso.titulo, puntos, porcentaje: total ? Math.round((100 * hechas) / (puntos.length * total)) : 0 };
  });
  const ids = flujo.pasos.flatMap((p) => p.puntos.map((x) => x.id));
  const cumplimiento = (v) => Math.round((100 * ids.filter((id) => v.puntos[id]).length) / ids.length);
  const conPlan = visitas.filter((v) => v.resultado !== "sin-plan");
  return {
    total,
    pasos,
    cumplimientoMedio: total ? Math.round(visitas.reduce((a, v) => a + cumplimiento(v), 0) / total) : 0,
    aceptacion: conPlan.length ? Math.round((100 * conPlan.filter((v) => v.resultado === "acepto").length) / conPlan.length) : null,
    cumplimiento,
  };
}

export function resumirVisitas(visitasSinLimpiar, flujo) {
  const visitas = limpiarVisitas(visitasSinLimpiar);
  if (!visitas.length) return "";
  const p = calcularProgreso(visitas, flujo);
  let texto = `Visitas reales registradas: ${p.total}. Cumplimiento medio del flujo: ${p.cumplimientoMedio} %.`;
  if (p.aceptacion != null) texto += ` Aceptación cuando se presentó plan: ${p.aceptacion} %.`;
  texto += "\n\nCumplimiento por paso y por punto (visitas en que se cumplió / total):\n";
  for (const paso of p.pasos) {
    texto += `\n${paso.titulo}: ${paso.porcentaje} %\n`;
    for (const punto of paso.puntos) texto += `- ${punto.texto}: ${punto.hechas}/${p.total}\n`;
  }
  texto += "\nVisitas, de la más antigua a la más reciente:\n";
  visitas.forEach((v, i) => {
    texto += `${i + 1}. ${v.fecha || "sin fecha"} · ${RESULTADOS[v.resultado]} · cumplimiento ${p.cumplimiento(v)} %`;
    if (v.objecion) texto += ` · objeción principal: ${v.objecion}`;
    if (v.notas) texto += ` · notas del alumno: ${v.notas.replace(/\s+/g, " ")}`;
    texto += "\n";
  });
  return texto;
}
