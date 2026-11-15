import test from "node:test";
import assert from "node:assert/strict";
import { nuevaVisita, normalizarVisitas, cumplimiento, recordatoriosPendientes, resumenHistorial, textoParaIA } from "../public/practica.js";
import { obtenerFlujo } from "../lib/contenido.js";

const flujo = obtenerFlujo();
const total = flujo.pasos.reduce((a, p) => a + p.puntos.length, 0);

test("convierte los registros antiguos en visitas terminadas", () => {
  const [v] = normalizarVisitas([{ id: "a1", fecha: "2026-11-14T10:00:00Z", alias: "A.G.", resultado: "acepto", puntos: { "preg-exacta": true }, notas: "bien" }, null, "x"]);
  assert.equal(v.estado, "terminada");
  assert.equal(v.alias, "A.G.");
  assert.deepEqual(v.seguimiento, []);
  assert.deepEqual(v.recordatorios, []);
  assert.equal(cumplimiento(v, flujo), Math.round(100 / total));
});

test("conserva las visitas nuevas y repara lo que falte", () => {
  const [v] = normalizarVisitas([{ id: "b2", estado: "en-curso", alias: "Luis", pasoActual: 3, puntos: null }]);
  assert.equal(v.pasoActual, 3);
  assert.deepEqual(v.puntos, {});
  assert.deepEqual(v.notasPaso, {});
});

test("ordena los recordatorios pendientes y omite los hechos", () => {
  const a = nuevaVisita({ alias: "A", recordatorios: [{ id: "1", fecha: "2026-12-01", texto: "llamar", hecho: false }, { id: "2", fecha: "2026-11-01", texto: "hecho", hecho: true }] });
  const b = nuevaVisita({ alias: "B", recordatorios: [{ id: "3", fecha: "2026-11-20", texto: "escribir", hecho: false }] });
  assert.deepEqual(recordatoriosPendientes([a, b]).map((r) => r.id), ["3", "1"]);
});

test("el resumen cuenta solo las visitas terminadas", () => {
  const visitas = [
    nuevaVisita({ estado: "terminada", resultado: "acepto", puntos: { "preg-exacta": true } }),
    nuevaVisita({ estado: "terminada", resultado: "no" }),
    nuevaVisita({ estado: "terminada", resultado: "sin-plan" }),
    nuevaVisita({ estado: "en-curso" }),
  ];
  const r = resumenHistorial(visitas, flujo);
  assert.equal(r.terminadas, 3);
  assert.equal(r.enCurso, 1);
  assert.equal(r.aceptacion, 50);
  assert.ok(r.aReforzar.length > 0);
});

test("el material para la IA incluye instrucciones, método y la visita", () => {
  const v = nuevaVisita({ alias: "Alfredo", motivo: "Se le mueve un puente", estado: "terminada", resultado: "pensarlo", objecion: "Precio", puntos: { "preg-exacta": true }, notasPaso: { pregunta: "Dijo que sí" } });
  v.seguimiento.push({ id: "s", fecha: "2026-11-15T09:00:00Z", tipo: "mensaje", texto: "Le escribí" });
  const t = textoParaIA({ visitas: [v], flujo });
  assert.match(t, /Instrucciones para la IA/);
  assert.match(t, /Haz de este paciente/);
  assert.match(t, /Paciente: Alfredo/);
  assert.match(t, /\[x\] He preguntado: «¿Quiere usted conservar sus dientes\?»/);
  assert.match(t, /Apuntes: Dijo que sí/);
  assert.match(t, /Mensaje enviado: Le escribí/);
  assert.doesNotMatch(t, /Temario completo/);
  const todo = textoParaIA({ visitas: [v, nuevaVisita({ alias: "Otro" })], flujo, temas: [{ titulo: "Tema uno", texto: "Contenido" }] });
  assert.match(todo, /Pregúntame con qué paciente/);
  assert.match(todo, /Temario completo/);
});
