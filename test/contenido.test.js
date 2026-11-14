import test from "node:test";
import assert from "node:assert/strict";
import { separarCabecera, textoParaNarrar, listarTemas } from "../lib/contenido.js";
import { trocear } from "../scripts/generar-audio.mjs";

test("separa la cabecera del tema", () => {
  const { datos, cuerpo } = separarCabecera("---\ntitulo: Tema: uno\nresumen: Hola\n---\n\n## Texto\n");
  assert.equal(datos.titulo, "Tema: uno");
  assert.equal(datos.resumen, "Hola");
  assert.equal(cuerpo.trim(), "## Texto");
});

test("el texto narrado no lleva marcas de formato", () => {
  const t = textoParaNarrar("## Título\n\n- **Uno.** Texto con [enlace](http://x).\n- Dos\n\n> Cita");
  assert.equal(t, "Título.\n\nUno. Texto con enlace.\nDos\n\nCita");
});

test("trocea sin perder texto ni pasarse del máximo", () => {
  const texto = Array.from({ length: 30 }, (_, i) => `Párrafo ${i}. ${"Frase de relleno. ".repeat(12)}`.trim()).join("\n\n");
  const trozos = trocear(texto, 800);
  assert.ok(trozos.length > 1);
  assert.ok(trozos.every((t) => t.length <= 800));
  assert.equal(trozos.join("\n\n").replace(/\s+/g, " "), texto.replace(/\s+/g, " "));
});

test("los exámenes de todos los temas están bien formados", () => {
  for (const tema of listarTemas()) {
    for (const p of tema.preguntas) {
      assert.ok(p.enunciado, `${tema.id}: pregunta sin enunciado`);
      if (p.tipo === "test") {
        assert.ok(Number.isInteger(p.correcta) && p.correcta >= 0 && p.correcta < p.opciones.length, `${tema.id}: respuesta correcta fuera de rango`);
      } else {
        assert.equal(p.tipo, "desarrollo", `${tema.id}: tipo de pregunta desconocido`);
      }
    }
  }
});

test("el flujo de la primera visita está bien formado", async () => {
  const { obtenerFlujo } = await import("../lib/contenido.js");
  const flujo = obtenerFlujo();
  const temas = new Set(listarTemas().map((t) => t.id));
  const ids = new Set();
  for (const paso of flujo.pasos) {
    assert.ok(paso.puntos.length > 0, `${paso.id}: sin puntos`);
    for (const p of paso.puntos) {
      assert.ok(!ids.has(p.id), `punto repetido: ${p.id}`);
      ids.add(p.id);
    }
    for (const t of paso.temas) assert.ok(temas.has(t), `${paso.id}: tema inexistente ${t}`);
    assert.equal(paso.escena.opciones.filter((o) => o.correcta).length, 1, `${paso.id}: debe haber una única opción correcta`);
  }
});

test("el resumen de visitas descarta datos mal formados", async () => {
  const { resumirVisitas, limpiarVisitas } = await import("../lib/progreso.js");
  const { obtenerFlujo } = await import("../lib/contenido.js");
  assert.equal(resumirVisitas("no es una lista", obtenerFlujo()), "");
  const limpias = limpiarVisitas([{ resultado: "inventado", puntos: { "preg-exacta": true, falso: "sí" }, notas: "x".repeat(5000) }, null]);
  assert.equal(limpias.length, 1);
  assert.equal(limpias[0].resultado, "sin-plan");
  assert.deepEqual(limpias[0].puntos, { "preg-exacta": true });
  assert.equal(limpias[0].notas.length, 600);
});
