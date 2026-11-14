import test from "node:test";
import assert from "node:assert/strict";
import { seleccionarMaterial, validarCorreccion } from "../public/material-profesor.js";

test("la recuperación prioriza la pregunta y respeta el presupuesto de contexto", () => {
  const temas = [
    { id: "precio", titulo: "Precio", texto: "Presupuesto y precio del tratamiento. ".repeat(150) },
    { id: "escucha", titulo: "Escucha", texto: "Escucha activa y preguntas abiertas para comprender al paciente. ".repeat(100) },
  ];
  const contexto = seleccionarMaterial(temas, "Cómo practicar la escucha activa", "escucha", 2500);
  assert.ok(contexto.startsWith("\n[Tema: Escucha]"));
  assert.ok(contexto.length <= 2500);
});
test("una nota fuera de rango o una corrección incompleta no puntúan", () => {
  assert.throws(() => validarCorreccion('{"nota":99,"aciertos":"a","mejoras":"m","respuesta_modelo":"r"}'));
  assert.throws(() => validarCorreccion('{"nota":5}'));
  assert.throws(() => validarCorreccion('No puedo corregirlo'));
  assert.deepEqual(validarCorreccion('```json\n{"nota":7.2,"aciertos":"a","mejoras":"m","respuesta_modelo":"r"}\n```'), { nota: 7, aciertos: "a", mejoras: "m", respuesta_modelo: "r" });
});
