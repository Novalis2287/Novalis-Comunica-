#!/usr/bin/env node
// Genera una versión de la app en una sola página, sin servidor: temas, audios
// y exámenes tipo test. El profesor con IA no está disponible en ella.
//
//   node scripts/exportar-pagina.mjs <carpeta-de-salida>
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listarTemas, temaComoHtml, listarFuentes, obtenerFlujo } from "../lib/contenido.js";

const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const salida = path.resolve(process.argv[2] || "pagina");
fs.mkdirSync(path.join(salida, "audio"), { recursive: true });

const temas = listarTemas().map((t) => {
  if (t.tieneAudio) fs.copyFileSync(path.join(t.dir, "audio.mp3"), path.join(salida, "audio", `${t.id}.mp3`));
  return {
    id: t.id, titulo: t.titulo, resumen: t.resumen, ejemplo: t.ejemplo, tieneAudio: t.tieneAudio,
    numPreguntas: t.preguntas.length, html: temaComoHtml(t), preguntas: t.preguntas,
  };
});
const datos = { temas, fuentes: listarFuentes().map((f) => f.nombre), flujo: obtenerFlujo() };

// El tema oscuro debe obedecer también al selector de tema de la página que la aloja.
let css = fs.readFileSync(path.join(raiz, "public/estilos.css"), "utf8");
const oscuro = css.match(/@media \(prefers-color-scheme: dark\) \{\s*:root \{([\s\S]*?)\}\s*\}/);
css = css.replace(oscuro[0], `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {${oscuro[1]}} }\n:root[data-theme="dark"] {${oscuro[1]}}`);
css = css.replace(".cabecera { ", ".cabecera { top: env(safe-area-inset-top, 0px); ").replace("position: sticky; top: 0;", "position: sticky;");

const app = fs
  .readFileSync(path.join(raiz, "public/app.js"), "utf8")
  .replace("src: `/api/temas/${tema.id}/audio`", "src: `audio/${tema.id}.mp3`");

// Sustituye las llamadas al servidor por los datos incluidos en la página.
const sinServidor = `
const DATOS = ${JSON.stringify(datos).replace(/</g, "\\u003c")};
const responder = (cuerpo, estado = 200) => new Response(JSON.stringify(cuerpo), { status: estado, headers: { "Content-Type": "application/json" } });
window.fetch = async (ruta) => {
  if (ruta === "/api/estado") return responder({ tutor: false, pideCodigo: false, fuentes: DATOS.fuentes });
  if (ruta === "/api/flujo") return responder(DATOS.flujo);
  if (ruta === "/api/temas") return responder(DATOS.temas.map(({ html, preguntas, ...resto }) => resto));
  const tema = DATOS.temas.find((t) => ruta === "/api/temas/" + t.id);
  if (tema) return responder(tema);
  return responder({ error: "El profesor con IA no está disponible en esta versión de prueba." }, 503);
};`;

const cuerpo = fs.readFileSync(path.join(raiz, "public/index.html"), "utf8").match(/<body>([\s\S]*?)<script/)[1];
const pagina = `<title>Novalis Comunica</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap">
<style>
${css}
</style>
${cuerpo}
<script src="https://cdnjs.cloudflare.com/ajax/libs/marked/12.0.2/marked.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.1.6/purify.min.js"></script>
<script>
(() => {
${sinServidor}
${app}
})();
</script>
`;
fs.writeFileSync(path.join(salida, "novalis-comunica.html"), pagina);
console.log(`${temas.length} temas exportados a ${salida}`);
