#!/usr/bin/env node
// Genera una versión de la app en una sola página, sin servidor: temas, audios
// exámenes, flujo de visita y seguimiento. Publicada como página de Claude,
// el profesor usa la cuenta de quien la abre y los datos se guardan en su base de datos.
//
//   node scripts/exportar-pagina.mjs <carpeta-de-salida>
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listarTemas, temaComoHtml, listarFuentes, obtenerFlujo } from "../lib/contenido.js";
import { INSTRUCCIONES } from "../lib/tutor.js";

const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const salida = path.resolve(process.argv[2] || "pagina");
fs.mkdirSync(path.join(salida, "audio"), { recursive: true });

fs.copyFileSync(path.join(raiz, "public/novalis.png"), path.join(salida, "novalis.png"));

const temas = listarTemas().map((t) => {
  if (t.tieneAudio) fs.copyFileSync(path.join(t.dir, "audio.mp3"), path.join(salida, "audio", `${t.id}.mp3`));
  return {
    id: t.id, titulo: t.titulo, resumen: t.resumen, ejemplo: t.ejemplo, tieneAudio: t.tieneAudio,
    numPreguntas: t.preguntas.length, html: temaComoHtml(t), preguntas: t.preguntas, texto: t.markdown,
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
  .replace(/import \{ iniciarCuenta \} from "\.\/cuenta\.js";\r?\nwindow\.novalisAutorizado = await iniciarCuenta\(\);/, 'window.novalisAutorizado = true; document.body.classList.remove("sin-sesion");')
  .replace("src: `/api/temas/${tema.id}/audio`", "src: `audio/${tema.id}.mp3`");

// El profesor y el guardado en la nube usan las capacidades de la página (ver pagina-sin-servidor.js).
const progreso = fs.readFileSync(path.join(raiz, "lib/progreso.js"), "utf8").replace(/^export /gm, "");
const sinServidor = fs
  .readFileSync(path.join(raiz, "scripts/pagina-sin-servidor.js"), "utf8")
  .replace("__DATOS__", () => JSON.stringify(datos).replace(/</g, "\\u003c"))
  .replace("__INSTRUCCIONES__", () => JSON.stringify(INSTRUCCIONES).replace(/</g, "\\u003c"))
  .replace("__PROGRESO__", () => progreso);

const cuerpo = fs.readFileSync(path.join(raiz, "public/index.html"), "utf8").match(/<body[^>]*>([\s\S]*?)<script/)[1];
const pagina = `<title>Novalis Aprende</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap">
<style>
${css}
</style>
${cuerpo}
<script src="https://cdnjs.cloudflare.com/ajax/libs/marked/12.0.2/marked.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.1.6/purify.min.js"></script>
<script>
(() => {
${sinServidor}
})();
(() => {
${app}
})();
</script>
`;
fs.writeFileSync(path.join(salida, "novalis-comunica.html"), pagina);
console.log(`${temas.length} temas exportados a ${salida}`);
