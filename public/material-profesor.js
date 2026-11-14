// Selección local de fragmentos: el temario no se envía a un proveedor de IA.
const palabras = (s) => String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").match(/[a-z0-9]{3,}/g) || [];
const comunes = new Set(palabras("que para con los las una uno del por como este esta sobre tema profesor explica explicame quiero respuesta"));
export function seleccionarMaterial(temas, consulta, temaId, limite = 4200) {
  const terminos = new Set(palabras(consulta).filter((p) => !comunes.has(p)));
  const fragmentos = temas.flatMap((t) => {
    const texto = String(t.texto || "");
    const partes = texto.match(/[\s\S]{1,1100}/g) || [];
    return partes.map((contenido, i) => {
      const tokens = new Set(palabras(t.titulo + " " + contenido));
      const coincidencias = [...terminos].filter((p) => tokens.has(p)).length;
      return { titulo: t.titulo, contenido, i, puntuacion: coincidencias + (t.id === temaId ? 4 : 0) };
    });
  }).sort((a, b) => b.puntuacion - a.puntuacion || a.i - b.i);
  let salida = "";
  for (const f of fragmentos) {
    const bloque = `\n[Tema: ${f.titulo}]\n${f.contenido}\n`;
    if (salida.length + bloque.length > limite) continue;
    salida += bloque;
  }
  return salida;
}

export function validarCorreccion(texto) {
  const c = JSON.parse(texto.replace(/^```(?:json)?\s*|\s*```$/g, "").trim());
  if (!Number.isFinite(c.nota) || c.nota < 0 || c.nota > 10 ||
      !["aciertos", "mejoras", "respuesta_modelo"].every((k) => typeof c[k] === "string" && c[k].trim())) {
    throw new Error("El profesor no ha producido una corrección válida. Compara tu respuesta con los criterios del tema.");
  }
  return { nota: Math.round(c.nota), aciertos: c.aciertos, mejoras: c.mejoras, respuesta_modelo: c.respuesta_modelo };
}
