// Interfaz de Novalis Aprende: temas, guía de primera visita e historial.
import { RESULTADOS, TIPOS_SEGUIMIENTO, nuevaVisita, normalizarVisitas, cumplimiento, recordatoriosPendientes, resumenHistorial, textoParaIA } from "./practica.js";
import { puedeGrabar, empezarGrabacion, guardarAudio, leerAudio, borrarAudio, duracionLegible, extensionDe } from "./grabacion.js";
import { iniciarCuenta } from "./cuenta.js";
window.novalisAutorizado = await iniciarCuenta();
const vista = document.getElementById("vista");

// ---------- utilidades ----------
function h(etiqueta, attrs = {}, ...hijos) {
  const el = document.createElement(etiqueta);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "html") el.innerHTML = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const hijo of hijos.flat()) {
    if (hijo == null || hijo === false) continue;
    el.append(hijo.nodeType ? hijo : document.createTextNode(String(hijo)));
  }
  return el;
}

const almacen = {
  leer(clave, defecto) {
    try {
      return JSON.parse(localStorage.getItem(window.novalisClave?.(clave) || clave)) ?? defecto;
    } catch {
      return defecto;
    }
  },
  guardar(clave, valor) {
    try {
      localStorage.setItem(window.novalisClave?.(clave) || clave, JSON.stringify(valor));
    } catch {
      /* sin almacenamiento: la app sigue funcionando */
    }
    // Permite que la versión de una sola página copie el dato a su base de datos.
    window.dispatchEvent(new CustomEvent("novalis:guardado", { detail: { clave, valor } }));
  },
};

function barajar(lista) {
  for (let i = lista.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [lista[i], lista[j]] = [lista[j], lista[i]];
  }
  return lista;
}

function markdownSeguro(texto) {
  if (window.marked && window.DOMPurify) return DOMPurify.sanitize(marked.parse(texto));
  // Sin las librerías de formato se muestra el texto tal cual, escapado.
  const caja = document.createElement("div");
  caja.textContent = texto;
  return caja.innerHTML.replace(/\n/g, "<br>");
}

// Pide el código de acceso cuando el servidor lo exige.
function pedirCodigo() {
  const dialogo = document.getElementById("dialogo-codigo");
  const campo = document.getElementById("campo-codigo");
  return new Promise((resolver) => {
    campo.value = "";
    let enviado = false;
    document.getElementById("form-codigo").onsubmit = () => (enviado = true);
    document.getElementById("cancelar-codigo").onclick = () => dialogo.close();
    dialogo.onclose = () => resolver(enviado ? campo.value : null);
    dialogo.showModal();
  });
}

async function api(ruta, opciones = {}) {
  for (;;) {
    const token = await window.novalisToken?.();
    const r = await fetch(ruta, {
      ...opciones,
      headers: {
        ...(opciones.body ? { "Content-Type": "application/json" } : {}),
        "x-codigo-acceso": almacen.leer("codigo", ""),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (r.status === 401) {
      const causa = await r.clone().json().catch(() => ({}));
      if (causa.requiereSesion || !causa.pideCodigo) {
        window.novalisAutorizado = false;
        location.reload();
        throw new Error("Inicia sesión para continuar.");
      }
      const codigo = await pedirCodigo();
      if (codigo == null) throw new Error("Hace falta el código de acceso.");
      almacen.guardar("codigo", codigo);
      continue;
    }
    return r;
  }
}

async function apiJson(ruta, opciones) {
  const r = await api(ruta, opciones);
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(datos.error || `Error ${r.status}`);
  return datos;
}

let estado = { tutor: false, fuentes: [] };
const resultados = () => almacen.leer("resultados", {});

function chipNota(nota) {
  return h("span", { class: `chip ${nota >= 5 ? "bien" : "mal"}` }, `Última nota: ${nota.toFixed(1)}`);
}

// ---------- vista: lista de temas ----------
async function vistaTemas() {
  const temas = await apiJson("/api/temas");
  const res = resultados();
  return [
    h("section", { class: "bienvenida" },
      h("p", { class: "sobrelinea" }, "NOVALIS · FORMACIÓN EN COMUNICACIÓN"),
      h("h1", {}, "Conecta mejor con tus pacientes."),
      h("p", {}, "Escucha, aprende y lleva cada conversación a la práctica. A tu ritmo, desde donde estés."),
      h("div", { class: "fila" }, h("a", { class: "boton", href: `#/tema/${temas[0]?.id || ""}` }, "Empezar a aprender"), h("a", { class: "boton secundario", href: "#/guia" }, "Guiar una primera visita")),
    ),
    h("div", { class: "cabecera-temas" }, h("div", {}, h("p", { class: "sobrelinea" }, "TU ITINERARIO"), h("h2", {}, "Un paso más en tu comunicación")), h("span", { class: "chip gris" }, `${temas.length} temas · texto y audio`)),
    estado.fuentes.length === 0 &&
      h("p", { class: "aviso" }, "Todavía no hay fuentes cargadas. Lo que ves es un tema de muestra."),
    h(
      "ul",
      { class: "temas" },
      temas.map((t, indice) => {
        const ultimo = res[t.id]?.at(-1);
        return h(
          "li",
          { class: "tema-tarjeta" },
          h("span", { class: "numero-tema", "aria-hidden": "true" }, String(indice + 1).padStart(2, "0")),
          h("h2", {}, h("a", { href: `#/tema/${t.id}` }, t.titulo)),
          t.resumen && h("p", {}, t.resumen),
          h(
            "div",
            { class: "datos" },
            h("span", { class: "chip gris" }, t.tieneAudio ? "Con audio" : "Audio pendiente"),
            h("span", { class: "chip gris" }, `${t.numPreguntas} preguntas`),
            ultimo && chipNota(ultimo.nota),
          ),
        );
      }),
    ),
  ];
}

// ---------- vista: tema ----------
function reproductor(tema, contenedorTexto) {
  if (tema.tieneAudio) {
    const audio = h("audio", { controls: true, preload: "metadata", src: `/api/temas/${tema.id}/audio` });
    const velocidad = h(
      "select",
      { id: "velocidad", onchange: (e) => (audio.playbackRate = Number(e.target.value)) },
      ["0.85", "1", "1.15", "1.3", "1.5"].map((v) => h("option", { value: v, selected: v === "1" }, `${v}×`)),
    );
    return h("div", { class: "reproductor" }, audio, h("label", {}, "Velocidad ", velocidad));
  }
  // Sin audio grabado: voz del navegador como recurso provisional.
  if (!("speechSynthesis" in window)) return null;
  let hablando = false;
  const boton = h(
    "button",
    {
      class: "boton secundario",
      type: "button",
      onclick: () => {
        speechSynthesis.cancel();
        hablando = !hablando;
        boton.textContent = hablando ? "Detener" : "Escuchar con la voz del navegador";
        if (!hablando) return;
        const locucion = new SpeechSynthesisUtterance(contenedorTexto.innerText);
        locucion.lang = "es-ES";
        locucion.voice = speechSynthesis.getVoices().find((v) => v.lang === "es-ES") || null;
        locucion.rate = 0.95;
        locucion.onend = () => {
          hablando = false;
          boton.textContent = "Escuchar con la voz del navegador";
        };
        speechSynthesis.speak(locucion);
      },
    },
    "Escuchar con la voz del navegador",
  );
  return h(
    "div",
    { class: "reproductor" },
    h("label", {}, "El audio con la voz del profesor aún no se ha generado para este tema."),
    h("div", {}, boton),
  );
}

async function vistaTema(id) {
  const tema = await apiJson(`/api/temas/${id}`);
  const texto = h("article", { class: "texto", html: tema.html });
  const ultimo = resultados()[id]?.at(-1);
  return [
    h("a", { class: "volver", href: "#/" }, "← Temas"),
    h("h1", {}, tema.titulo),
    reproductor(tema, texto),
    texto,
    h(
      "div",
      { class: "fila" },
      tema.preguntas.length > 0 && h("a", { class: "boton", href: `#/examen/${id}` }, "Hacer el examen"),
      ultimo && chipNota(ultimo.nota),
    ),
  ];
}

// ---------- vista: examen ----------
async function vistaExamen(id) {
  const tema = await apiJson(`/api/temas/${id}`);
  const preguntas = tema.preguntas;
  const zonaNota = h("div", {});
  const boton = h("button", { class: "boton" }, "Entregar examen");

  const campos = preguntas.map((p, i) => {
    const cuerpo =
      p.tipo === "test"
        ? h(
            "div",
            { class: "opciones" },
            // Las opciones se barajan en cada intento para que no se memorice la posición.
            barajar(p.opciones.map((o, j) => [o, j])).map(([o, j]) =>
              h("label", { class: "opcion", "data-opcion": j }, h("input", { type: "radio", name: `p${i}`, value: j, id: `p${i}o${j}` }), h("span", {}, o)),
            ),
          )
        : h("textarea", { id: `p${i}`, name: `p${i}`, placeholder: "Escribe tu respuesta…", "aria-label": `Respuesta a la pregunta ${i + 1}` });
    const correccion = h("div", { class: "correccion", hidden: true });
    return h("fieldset", { class: "pregunta" }, h("legend", {}, h("span", { class: "num" }, `${i + 1}. `), p.enunciado), cuerpo, correccion);
  });

  async function entregar(e) {
    e.preventDefault();
    boton.disabled = true;
    boton.textContent = "Corrigiendo…";
    const notas = [];
    const corregirPregunta = async (p, i) => {
        const campo = campos[i];
        const correccion = campo.querySelector(".correccion");
        correccion.hidden = false;
        campo.querySelectorAll("input, textarea").forEach((c) => (c.disabled = true));
        if (p.tipo === "test") {
          const marcada = campo.querySelector("input:checked");
          const elegida = marcada ? Number(marcada.value) : -1;
          const opcion = (j) => campo.querySelector(`.opcion[data-opcion="${j}"]`);
          opcion(p.correcta).classList.add("correcta");
          if (elegida !== p.correcta && elegida >= 0) opcion(elegida).classList.add("fallada");
          notas[i] = elegida === p.correcta ? 10 : 0;
          correccion.append(
            h("p", {}, h("strong", {}, elegida === p.correcta ? "Correcta. " : elegida < 0 ? "Sin responder. " : "Incorrecta. "), p.explicacion || ""),
          );
          return;
        }
        const respuesta = campo.querySelector("textarea").value.trim();
        if (!respuesta) {
          notas[i] = 0;
          correccion.append(h("p", {}, h("strong", {}, "Sin responder.")));
          return;
        }
        // Las preguntas de desarrollo se autocorrigen con los criterios del tema.
        notas[i] = null;
        correccion.append(
          h("p", {}, h("strong", {}, "Compara tu respuesta con los criterios. "), "Esta pregunta no puntúa."),
          h("p", {}, p.criterios || ""),
        );
      };
    for (let i = 0; i < preguntas.length; i++) await corregirPregunta(preguntas[i], i);
    const puntuadas = notas.filter((n) => n != null);
    const nota = puntuadas.length ? puntuadas.reduce((a, b) => a + b, 0) / puntuadas.length : 0;
    const res = resultados();
    (res[id] ??= []).push({ fecha: new Date().toISOString(), nota });
    almacen.guardar("resultados", res);
    const sinPuntuar = notas.length - puntuadas.length;
    zonaNota.replaceChildren(
      h(
        "div",
        { class: "nota-final" },
        h("strong", {}, nota.toFixed(1)),
        h("span", {}, `sobre 10 · ${nota >= 5 ? "aprobado" : "suspenso"}`),
        sinPuntuar > 0 && h("span", {}, `(${sinPuntuar} pregunta${sinPuntuar > 1 ? "s" : ""} sin puntuar)`),
      ),
    );
    boton.replaceWith(
      h(
        "div",
        { class: "fila" },
        h("button", { class: "boton", type: "button", onclick: () => pintar() }, "Repetir el examen"),
        h("a", { class: "boton secundario", href: `#/tema/${id}` }, "Volver al tema"),
      ),
    );
    zonaNota.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return [
    h("a", { class: "volver", href: `#/tema/${id}` }, `← ${tema.titulo}`),
    h("h1", {}, "Examen"),
    h("p", { class: "entrada" }, `${preguntas.length} preguntas. Las de desarrollo no puntúan: al entregar verás los criterios para corregirte.`),
    zonaNota,
    h("form", { class: "examen", onsubmit: entregar }, campos, h("div", {}, boton)),
  ];
}

// ---------- primeras visitas: datos ----------
const OBJECIONES = ["Ninguna", "Precio", "Tiene que pensarlo", "Consultarlo con la pareja o la familia", "Falta de tiempo", "Miedo", "Edad", "Solo quiere arreglar una pieza", "Desconfianza en pagar por adelantado", "Otra"];
const ORIGENES = ["", "Recomendado por otro paciente", "Redes sociales", "Web o buscador", "Pasaba por la clínica", "Otro"];

const leerVisitas = () => normalizarVisitas(almacen.leer("visitas", []));
const guardarVisitas = (lista) => almacen.guardar("visitas", lista);
function cambiarVisita(id, cambio) {
  const lista = leerVisitas();
  const visita = lista.find((v) => v.id === id);
  if (!visita) return null;
  cambio(visita);
  guardarVisitas(lista);
  return visita;
}
const hoy = () => new Date().toISOString().slice(0, 10);
const fechaCorta = (iso) => (iso ? new Date(String(iso).length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("es-ES") : "");
const campo = (etiqueta, control) => h("label", { class: "campo" }, etiqueta, control);

function enlacesATemas(ids, temas) {
  return ids
    .map((id) => temas.find((t) => t.id === id))
    .filter(Boolean)
    .map((t) => h("a", { class: "chip", href: `#/tema/${t.id}` }, t.titulo));
}

function fichaDelPaso(paso, temas) {
  return [
    h("h3", {}, "Puntos de control"),
    h("ul", {}, paso.puntos.map((p) => h("li", {}, p.texto))),
    h("h3", {}, "Frases"),
    h("ul", { class: "frases" }, paso.frases.map((f) => h("li", {}, `«${f}»`))),
    h("h3", {}, "Evita"),
    h("ul", {}, paso.evita.map((e) => h("li", {}, e))),
    h("div", { class: "datos" }, enlacesATemas(paso.temas, temas)),
  ];
}

// Guarda un archivo de texto; en la página de Claude lo hace la propia página.
async function descargarTexto(nombre, texto) {
  if (window.novalisDescargar) return window.novalisDescargar(nombre, texto);
  const url = URL.createObjectURL(new Blob([texto], { type: "text/markdown;charset=utf-8" }));
  const enlace = h("a", { href: url, download: nombre });
  document.body.append(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// Botones para llevarse el material de práctica: descargarlo o copiarlo.
function botonesDePractica({ nombre, generar }) {
  const estadoEl = h("p", { class: "entrada", hidden: true });
  const salida = h("textarea", { class: "copia-manual", readonly: true, hidden: true, "aria-label": "Material para copiar" });
  const avisar = (texto) => {
    estadoEl.textContent = texto;
    estadoEl.hidden = false;
  };
  return h(
    "div",
    { class: "practica" },
    h(
      "div",
      { class: "fila" },
      h("button", { class: "boton", type: "button", onclick: async () => {
        try {
          await descargarTexto(nombre, await generar());
          avisar("Archivo preparado. Adjúntalo a una conversación con tu IA y escribe «empezamos».");
        } catch {
          avisar("No se ha podido descargar aquí. Usa «Copiar» y pégalo en la conversación.");
        }
      } }, "Descargar"),
      h("button", { class: "boton secundario", type: "button", onclick: async () => {
        const texto = await generar();
        try {
          await navigator.clipboard.writeText(texto);
          avisar("Copiado. Pégalo en una conversación con tu IA y escribe «empezamos».");
        } catch {
          salida.value = texto;
          salida.hidden = false;
          salida.select();
          avisar("Selecciona el texto de abajo y cópialo.");
        }
      } }, "Copiar"),
    ),
    estadoEl,
    salida,
  );
}

// ---------- grabación de la visita ----------
let grabacionActiva = null; // { visitaId, mandos, marcas, reloj }

async function terminarGrabacion() {
  const activa = grabacionActiva;
  if (!activa) return;
  grabacionActiva = null;
  clearInterval(activa.reloj);
  const { blob, duracion, tipo } = await activa.mandos.detener();
  if (!blob.size) return;
  await guardarAudio(activa.visitaId, blob);
  cambiarVisita(activa.visitaId, (v) => (v.audio = { fecha: new Date().toISOString(), duracion: Math.round(duracion), tipo, marcas: activa.marcas }));
}

function barraDeGrabacion(visitaId, leerVisita, marcarPaso) {
  const barra = h("div", { class: "grabacion" });
  if (!puedeGrabar()) {
    barra.append(h("p", {}, window.novalisSinMicrofono ? "La grabación de audio solo está disponible en la versión web de Novalis Aprende, no dentro de Claude." : "Este navegador no permite grabar audio."));
    return barra;
  }
  function pintarBarra() {
    const activa = grabacionActiva?.visitaId === visitaId ? grabacionActiva : null;
    if (activa) {
      const tiempo = h("strong", { class: "tiempo" }, duracionLegible(activa.mandos.segundos()));
      clearInterval(activa.reloj);
      activa.reloj = setInterval(() => (tiempo.textContent = duracionLegible(activa.mandos.segundos())), 1000);
      const pausa = h("button", { class: "boton secundario", type: "button" }, activa.mandos.estaPausada() ? "Reanudar" : "Pausar");
      pausa.addEventListener("click", () => {
        if (activa.mandos.estaPausada()) activa.mandos.reanudar();
        else activa.mandos.pausar();
        pintarBarra();
      });
      barra.replaceChildren(
        h("span", { class: `punto-rojo${activa.mandos.estaPausada() ? " pausado" : ""}`, "aria-hidden": "true" }),
        h("span", {}, activa.mandos.estaPausada() ? "Grabación en pausa" : "Grabando"),
        tiempo,
        pausa,
        h("button", { class: "boton", type: "button", onclick: async () => { await terminarGrabacion(); pintarBarra(); } }, "Detener y guardar"),
      );
      return;
    }
    const audio = leerVisita().audio;
    const permiso = h("input", { type: "checkbox", id: "consentimiento" });
    const empezar = h("button", { class: "boton secundario", type: "button", disabled: true }, audio ? "Grabar de nuevo" : "Grabar la visita");
    const error = h("p", { class: "error", hidden: true });
    permiso.addEventListener("change", () => (empezar.disabled = !permiso.checked));
    empezar.addEventListener("click", async () => {
      try {
        if (grabacionActiva) await terminarGrabacion();
        const mandos = await empezarGrabacion();
        grabacionActiva = { visitaId, mandos, marcas: [], reloj: null };
        marcarPaso();
        pintarBarra();
      } catch {
        error.textContent = "No se ha podido usar el micrófono. Revisa el permiso del navegador para esta página.";
        error.hidden = false;
      }
    });
    barra.replaceChildren(
      h("label", { class: "opcion" }, permiso, h("span", {}, "El paciente sabe que se va a grabar la visita y ha dado su consentimiento.")),
      h("div", { class: "fila" }, empezar, audio && h("span", { class: "chip gris" }, `Hay una grabación de ${duracionLegible(audio.duracion)}; grabar de nuevo la sustituye`)),
      error,
    );
  }
  pintarBarra();
  return barra;
}

// Revisión de la grabación: se escucha cada paso, se marca lo cumplido y se anota la corrección.
async function vistaRevision(id, visitas, flujo, temas) {
  let visita = visitas.find((v) => v.id === id);
  if (!visita) return [h("p", { class: "error" }, "No se ha encontrado este paciente."), h("a", { href: "#/historial" }, "Volver al historial")];
  const blob = visita.audio ? await leerAudio(id) : null;
  const guardar = (cambio) => (visita = cambiarVisita(id, cambio) || visita);
  const cabecera = [h("a", { class: "volver", href: `#/historial/${id}` }, `← ${visita.alias || "Paciente"}`), h("h1", {}, "Revisar la grabación")];
  if (!blob) {
    return [
      ...cabecera,
      h("p", { class: "aviso" }, visita.audio ? "La grabación de esta visita está guardada en el dispositivo donde se grabó. Ábrela allí para escucharla." : "Esta visita no tiene grabación."),
    ];
  }
  const reproductorAudio = h("audio", { controls: true, preload: "metadata", src: URL.createObjectURL(blob) });
  const marcas = visita.audio.marcas || [];
  const porcentaje = h("span", { class: "chip" }, `${cumplimiento(visita, flujo)} % del flujo`);
  return [
    ...cabecera,
    h("p", { class: "entrada" }, "Escucha cada paso, marca lo que de verdad hiciste y anota cómo lo dirías la próxima vez."),
    h("div", { class: "reproductor revision-audio" }, reproductorAudio, h("div", { class: "datos" }, h("span", { class: "chip gris" }, duracionLegible(visita.audio.duracion)), porcentaje)),
    ...flujo.pasos.map((paso, n) => {
      const marca = marcas.find((m) => m.paso === paso.id);
      const correccion = h("textarea", { id: `correccion-${paso.id}`, placeholder: "Qué fallé aquí y cómo lo diría la próxima vez" }, visita.correcciones[paso.id] || "");
      correccion.addEventListener("input", () => guardar((v) => (v.correcciones[paso.id] = correccion.value)));
      return h(
        "section",
        { class: "paso-guia revision-paso" },
        h("h2", {}, `${n + 1}. ${paso.titulo}`),
        marca
          ? h("div", {}, h("button", { class: "boton secundario", type: "button", onclick: () => { reproductorAudio.currentTime = marca.t; reproductorAudio.play(); } }, `Escuchar desde ${duracionLegible(marca.t)}`))
          : h("p", { class: "objetivo" }, "No pasaste por este paso mientras grababas."),
        h(
          "div",
          { class: "opciones" },
          paso.puntos.map((p) => {
            const casilla = h("input", { type: "checkbox", id: `revision-${p.id}`, checked: Boolean(visita.puntos[p.id]) });
            casilla.addEventListener("change", () => {
              guardar((v) => {
                if (casilla.checked) v.puntos[p.id] = true;
                else delete v.puntos[p.id];
              });
              porcentaje.textContent = `${cumplimiento(visita, flujo)} % del flujo`;
            });
            return h("label", { class: "opcion" }, casilla, h("span", {}, p.texto));
          }),
        ),
        h("p", { class: "evita" }, h("strong", {}, "Errores que vigilar: "), paso.evita.join(" ")),
        campo("Corrección", correccion),
        h("div", { class: "datos" }, enlacesATemas(paso.temas, temas)),
      );
    }),
    h("div", {}, h("a", { class: "boton", href: `#/historial/${id}` }, "Terminar la revisión")),
    h("div", { class: "hueco-audio", "aria-hidden": "true" }),
  ];
}

// Bloque de la ficha del paciente con la grabación de su visita.
function seccionGrabacion(visita) {
  if (!visita.audio) return [];
  const estadoEl = h("p", { class: "entrada", hidden: true });
  const borrar = h("button", { class: "enlace", type: "button" }, "Borrar la grabación");
  borrar.addEventListener("click", async () => {
    if (!borrar.dataset.seguro) {
      borrar.dataset.seguro = "1";
      borrar.textContent = "¿Borrar el audio? Pulsa otra vez";
      return;
    }
    await borrarAudio(visita.id);
    cambiarVisita(visita.id, (v) => (v.audio = null));
    pintar();
  });
  return [
    h("h2", {}, "Grabación de la visita"),
    h("div", { class: "datos" }, h("span", { class: "chip gris" }, `${duracionLegible(visita.audio.duracion)} · ${fechaCorta(visita.audio.fecha)}`), h("span", { class: "chip gris" }, "Guardada solo en el dispositivo donde se grabó")),
    h(
      "div",
      { class: "fila" },
      h("a", { class: "boton", href: `#/historial/${visita.id}/revision` }, "Revisar la grabación"),
      h("button", { class: "boton secundario", type: "button", onclick: async () => {
        const blob = await leerAudio(visita.id);
        if (!blob) {
          estadoEl.textContent = "El audio no está en este dispositivo.";
          estadoEl.hidden = false;
          return;
        }
        const url = URL.createObjectURL(blob);
        const enlace = h("a", { href: url, download: `visita-${(visita.alias || "paciente").toLowerCase().replace(/[^a-z0-9áéíóúñ]+/gi, "-")}.${extensionDe(visita.audio.tipo)}` });
        document.body.append(enlace);
        enlace.click();
        enlace.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      } }, "Descargar el audio"),
    ),
    h("p", { class: "entrada" }, "Para que una IA la analice, descarga el audio y el archivo de práctica de abajo y adjunta los dos a la conversación."),
    estadoEl,
    h("div", {}, borrar),
  ];
}

// ---------- guía de primera visita ----------
async function vistaGuia(id) {
  const [flujo, temas] = await Promise.all([apiJson("/api/flujo"), apiJson("/api/temas")]);
  if (id === "caso") return vistaCaso(flujo, temas);
  if (id === "nuevo") return vistaNuevoPaciente();
  if (id) return vistaPlantilla(id, flujo, temas);
  const enCurso = leerVisitas().filter((v) => v.estado === "en-curso").reverse();
  return [
    h("h1", {}, "Guía de primera visita"),
    h("p", { class: "entrada" }, "Añade al paciente y la plantilla te lleva paso a paso por la visita: qué decir, qué comprobar y qué evitar."),
    h("div", { class: "fila" }, h("a", { class: "boton", href: "#/guia/nuevo" }, "Nuevo paciente"), h("a", { class: "boton secundario", href: "#/guia/caso" }, "Practicar con un caso de ejemplo")),
    enCurso.length > 0 && h("h2", {}, "Visitas en curso"),
    enCurso.length > 0 &&
      h(
        "ul",
        { class: "visitas" },
        enCurso.map((v) =>
          h(
            "li",
            {},
            h("div", { class: "datos" }, h("strong", {}, v.alias || "Sin identificar"), h("span", { class: "chip" }, `Paso ${Math.min(v.pasoActual + 1, flujo.pasos.length)} de ${flujo.pasos.length}`), h("span", { class: "chip gris" }, fechaCorta(v.creado))),
            h("div", {}, h("a", { class: "boton secundario", href: `#/guia/${v.id}` }, "Continuar")),
          ),
        ),
      ),
    h("h2", {}, "Los pasos de la visita"),
    h(
      "ol",
      { class: "pasos" },
      flujo.pasos.map((paso) => h("li", {}, h("details", {}, h("summary", {}, h("strong", {}, paso.titulo), h("span", {}, paso.objetivo)), fichaDelPaso(paso, temas)))),
    ),
  ];
}

function vistaNuevoPaciente() {
  const alias = h("input", { id: "alias", type: "text", maxlength: "30", required: true, autocomplete: "off", placeholder: "Nombre de pila o iniciales" });
  const motivo = h("textarea", { id: "motivo", placeholder: "Con sus palabras: por qué viene hoy" });
  const origen = h("select", { id: "origen" }, ORIGENES.map((o) => h("option", { value: o }, o || "Sin indicar")));
  const acompanante = h("input", { id: "acompanante", type: "text", maxlength: "60", autocomplete: "off", placeholder: "Quién viene con él, si viene alguien" });
  const previas = h("textarea", { id: "previas", placeholder: "Lo que te ha contado recepción, a qué distancia llega…" });
  return [
    h("a", { class: "volver", href: "#/guia" }, "← Guía de primera visita"),
    h("h1", {}, "Nuevo paciente"),
    h("p", { class: "aviso" }, "Identifícalo con el nombre de pila o unas iniciales. No anotes apellidos ni datos clínicos que permitan reconocerlo."),
    h(
      "form",
      {
        class: "guia",
        onsubmit: (e) => {
          e.preventDefault();
          const visita = nuevaVisita({ alias: alias.value.trim(), motivo: motivo.value.trim(), origen: origen.value, acompanante: acompanante.value.trim(), previas: previas.value.trim() });
          guardarVisitas([...leerVisitas(), visita]);
          location.hash = `#/guia/${visita.id}`;
        },
      },
      campo("Paciente", alias),
      campo("Motivo de consulta", motivo),
      campo("Cómo nos ha conocido", origen),
      campo("Acompañante", acompanante),
      campo("Notas previas", previas),
      h("div", {}, h("button", { class: "boton" }, "Empezar la visita")),
    ),
  ];
}

// La plantilla: un paso en pantalla cada vez, con sus puntos, frases y apuntes.
function vistaPlantilla(id, flujo, temas) {
  let visita = leerVisitas().find((v) => v.id === id);
  if (!visita) return [h("p", { class: "error" }, "No se ha encontrado esta visita."), h("a", { href: "#/guia" }, "Volver a la guía")];
  const total = flujo.pasos.length;
  const zona = h("div", { class: "plantilla" });
  const guardar = (cambio) => (visita = cambiarVisita(id, cambio) || visita);

  function irA(n) {
    guardar((v) => (v.pasoActual = Math.max(0, Math.min(total, n))));
    // Cada cambio de paso deja una marca en la grabación para encontrarlo al revisarla.
    if (grabacionActiva?.visitaId === id) grabacionActiva.marcas.push({ paso: flujo.pasos[visita.pasoActual]?.id || "cierre", t: Math.round(grabacionActiva.mandos.segundos()) });
    pintarPaso();
    window.scrollTo(0, 0);
  }

  function cabeceraDePaso(n) {
    const selector = h(
      "select",
      { id: "ir-a-paso", "aria-label": "Ir a un paso", onchange: (e) => irA(Number(e.target.value)) },
      flujo.pasos.map((p, i) => h("option", { value: i, selected: i === n }, `${i + 1}. ${p.titulo}`)),
      h("option", { value: total, selected: n === total }, "Cierre de la visita"),
    );
    return h(
      "div",
      { class: "avance" },
      h("span", { class: "pista", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": String(total), "aria-valuenow": String(n) }, h("span", { class: "relleno", style: `width:${Math.round((100 * n) / total)}%` })),
      selector,
    );
  }

  function pintarPaso() {
    const n = visita.pasoActual;
    if (n >= total) return pintarCierre();
    const paso = flujo.pasos[n];
    const apuntes = h("textarea", { id: "apuntes", placeholder: "Qué ha dicho el paciente, qué has notado…" }, visita.notasPaso[paso.id] || "");
    apuntes.addEventListener("input", () => guardar((v) => (v.notasPaso[paso.id] = apuntes.value)));
    zona.replaceChildren(
      cabeceraDePaso(n),
      h("p", { class: "progreso-caso" }, `Paso ${n + 1} de ${total}`),
      h("h2", {}, paso.titulo),
      h("p", { class: "objetivo" }, paso.objetivo),
      h("h3", {}, "Di"),
      h("ul", { class: "frases" }, paso.frases.map((f) => h("li", {}, `«${f}»`))),
      h("h3", {}, "Comprueba"),
      h(
        "div",
        { class: "opciones" },
        paso.puntos.map((p) => {
          const casilla = h("input", { type: "checkbox", id: `punto-${p.id}`, checked: Boolean(visita.puntos[p.id]) });
          casilla.addEventListener("change", () =>
            guardar((v) => {
              if (casilla.checked) v.puntos[p.id] = true;
              else delete v.puntos[p.id];
            }),
          );
          return h("label", { class: "opcion" }, casilla, h("span", {}, p.texto));
        }),
      ),
      h("h3", {}, "Evita"),
      h("ul", {}, paso.evita.map((e) => h("li", {}, e))),
      campo("Apuntes de este paso", apuntes),
      h("div", { class: "datos" }, enlacesATemas(paso.temas, temas)),
      h(
        "div",
        { class: "fila" },
        n > 0 && h("button", { class: "boton secundario", type: "button", onclick: () => irA(n - 1) }, "Anterior"),
        h("button", { class: "boton", type: "button", onclick: () => irA(n + 1) }, n === total - 1 ? "Cerrar la visita" : "Siguiente paso"),
      ),
    );
  }

  function pintarCierre() {
    const aviso = h("p", { class: "error", hidden: true });
    const resultado = h("select", { id: "resultado" }, h("option", { value: "" }, "Elige el resultado…"), Object.entries(RESULTADOS).map(([v, t]) => h("option", { value: v, selected: visita.resultado === v }, t)));
    const objecion = h("select", { id: "objecion" }, OBJECIONES.map((o) => h("option", { value: o, selected: (visita.objecion || "Ninguna") === o }, o)));
    const importe = h("input", { id: "importe", type: "number", min: "0", step: "1", inputmode: "numeric", value: visita.importe, placeholder: "Opcional" });
    const notas = h("textarea", { id: "notas", placeholder: "Qué salió bien, qué se te resistió, cómo se fue el paciente…" }, visita.notas);
    const fecha = h("input", { id: "recordatorio-fecha", type: "date", min: hoy() });
    const texto = h("input", { id: "recordatorio-texto", type: "text", maxlength: "140", placeholder: "Por ejemplo: llamarle para concretar el pago" });
    zona.replaceChildren(
      cabeceraDePaso(total),
      h("h2", {}, "Cierre de la visita"),
      h("p", { class: "objetivo" }, `Has marcado el ${cumplimiento(visita, flujo)} % de los puntos de control.`),
      h(
        "form",
        {
          class: "guia",
          onsubmit: (e) => {
            e.preventDefault();
            if (!resultado.value) {
              aviso.textContent = "Elige el resultado de la visita.";
              aviso.hidden = false;
              return;
            }
            if (fecha.value && !texto.value.trim()) {
              aviso.textContent = "Escribe qué hay que hacer en el recordatorio.";
              aviso.hidden = false;
              return;
            }
            guardar((v) => {
              v.estado = "terminada";
              v.fechaVisita = v.fechaVisita || new Date().toISOString();
              v.resultado = resultado.value;
              v.objecion = objecion.value === "Ninguna" ? "" : objecion.value;
              v.importe = importe.value;
              v.notas = notas.value.trim();
              if (fecha.value) v.recordatorios.push({ id: Date.now().toString(36), fecha: fecha.value, texto: texto.value.trim(), hecho: false });
            });
            location.hash = `#/historial/${id}`;
          },
        },
        campo("Resultado", resultado),
        campo("Objeción principal", objecion),
        campo("Importe del plan (€)", importe),
        campo("Notas", notas),
        h("h3", {}, "Recordatorio"),
        campo("Fecha", fecha),
        campo("Qué hay que hacer", texto),
        aviso,
        h("div", { class: "fila" }, h("button", { class: "boton secundario", type: "button", onclick: () => irA(total - 1) }, "Anterior"), h("button", { class: "boton" }, "Terminar y guardar")),
      ),
    );
  }

  pintarPaso();
  const marcarPaso = () => grabacionActiva?.visitaId === id && grabacionActiva.marcas.push({ paso: flujo.pasos[visita.pasoActual]?.id || "cierre", t: Math.round(grabacionActiva.mandos.segundos()) });
  return [
    h("a", { class: "volver", href: "#/guia" }, "← Guía de primera visita"),
    h("h1", {}, visita.alias || "Primera visita"),
    barraDeGrabacion(id, () => visita, marcarPaso),
    (visita.motivo || visita.acompanante) &&
      h("div", { class: "datos" }, visita.motivo && h("span", { class: "chip gris" }, visita.motivo), visita.acompanante && h("span", { class: "chip gris" }, `Con ${visita.acompanante}`)),
    zona,
  ];
}

function vistaCaso(flujo, temas) {
  const zona = h("div", { class: "caso" });
  let i = -1;
  let aciertos = 0;

  function pintarPaso() {
    if (i < 0) {
      zona.replaceChildren(h("p", { class: "escena" }, flujo.caso.presentacion), h("div", {}, h("button", { class: "boton", type: "button", onclick: avanzar }, "Empezar la visita")));
      return;
    }
    if (i >= flujo.pasos.length) {
      almacen.guardar("caso", { fecha: new Date().toISOString(), aciertos, total: flujo.pasos.length });
      zona.replaceChildren(
        h("div", { class: "nota-final" }, h("strong", {}, `${aciertos}/${flujo.pasos.length}`), h("span", {}, "decisiones acertadas a la primera")),
        h(
          "div",
          { class: "fila" },
          h("button", { class: "boton secundario", type: "button", onclick: () => { i = -1; aciertos = 0; pintarPaso(); } }, "Repetir el caso"),
          h("a", { class: "boton", href: "#/guia/nuevo" }, "Guiar una visita real"),
        ),
      );
      return;
    }
    const paso = flujo.pasos[i];
    const resultado = h("div", { class: "resultado-paso", hidden: true });
    let respondido = false;
    const botones = barajar(paso.escena.opciones.map((o) => o)).map((opcion) => {
      const boton = h("button", { class: "eleccion", type: "button" }, opcion.texto);
      boton.addEventListener("click", () => {
        if (respondido) return;
        respondido = true;
        if (opcion.correcta) aciertos++;
        botones.forEach((b) => (b.el.disabled = true));
        boton.classList.add(opcion.correcta ? "correcta" : "fallada");
        const buena = botones.find((b) => b.opcion.correcta);
        buena.el.classList.add("correcta");
        resultado.hidden = false;
        resultado.replaceChildren(
          h("p", {}, h("strong", {}, opcion.correcta ? "Bien. " : "No es la mejor opción. "), opcion.feedback),
          !opcion.correcta && h("p", {}, h("strong", {}, "La adecuada. "), buena.opcion.feedback),
          ...fichaDelPaso(paso, temas),
          h("div", {}, h("button", { class: "boton", type: "button", onclick: avanzar }, i === flujo.pasos.length - 1 ? "Ver el resultado" : "Siguiente paso")),
        );
      });
      return { el: boton, opcion };
    });
    zona.replaceChildren(
      h("p", { class: "progreso-caso" }, `Paso ${i + 1} de ${flujo.pasos.length}`),
      h("h2", {}, paso.titulo),
      h("p", { class: "escena" }, paso.escena.texto),
      h("p", {}, h("strong", {}, paso.escena.pregunta)),
      h("div", { class: "elecciones" }, botones.map((b) => b.el)),
      resultado,
    );
  }
  function avanzar() {
    i++;
    pintarPaso();
    window.scrollTo(0, 0);
  }
  pintarPaso();
  return [h("a", { class: "volver", href: "#/guia" }, "← Guía de primera visita"), h("h1", {}, flujo.caso.titulo), zona];
}

// ---------- historial de primeras visitas ----------
function filaRecordatorio(r, { conPaciente }) {
  const vencido = r.fecha && r.fecha < hoy();
  return h(
    "li",
    {},
    h(
      "div",
      { class: "datos" },
      h("span", { class: `chip ${vencido ? "mal" : r.fecha === hoy() ? "bien" : "gris"}` }, vencido ? `Vencido · ${fechaCorta(r.fecha)}` : r.fecha === hoy() ? "Hoy" : fechaCorta(r.fecha)),
      conPaciente && h("a", { class: "chip", href: `#/historial/${r.visitaId}` }, r.alias || "Sin identificar"),
    ),
    h("span", {}, r.texto),
    h(
      "div",
      { class: "fila" },
      h("button", { class: "enlace", type: "button", onclick: () => { cambiarVisita(r.visitaId, (v) => { const x = v.recordatorios.find((y) => y.id === r.id); if (x) x.hecho = true; }); pintar(); } }, "Marcar como hecho"),
    ),
  );
}

async function vistaHistorial(id, extra) {
  const [flujo, temas] = await Promise.all([apiJson("/api/flujo"), apiJson("/api/temas")]);
  const visitas = leerVisitas();
  if (id && extra === "revision") return vistaRevision(id, visitas, flujo, temas);
  if (id) return vistaPaciente(id, visitas, flujo, temas);
  if (!visitas.length) {
    return [
      h("h1", {}, "Historial de primeras visitas"),
      h("p", { class: "entrada" }, "Aquí quedará cada primera visita con su resultado, tus mensajes de seguimiento y los recordatorios."),
      h("p", { class: "aviso" }, "Todavía no hay ninguna visita."),
      h("div", {}, h("a", { class: "boton", href: "#/guia/nuevo" }, "Añadir el primer paciente")),
    ];
  }
  const resumen = resumenHistorial(visitas, flujo);
  const pendientes = recordatoriosPendientes(visitas);
  return [
    h("h1", {}, "Historial de primeras visitas"),
    h(
      "div",
      { class: "cifras" },
      h("div", {}, h("strong", {}, resumen.terminadas), h("span", {}, resumen.terminadas === 1 ? "visita terminada" : "visitas terminadas")),
      h("div", {}, h("strong", {}, resumen.aceptacion == null ? "—" : `${resumen.aceptacion} %`), h("span", {}, "aceptación con plan presentado")),
      h("div", {}, h("strong", {}, resumen.cumplimientoMedio == null ? "—" : `${resumen.cumplimientoMedio} %`), h("span", {}, "puntos de control cumplidos")),
    ),
    h("h2", {}, "Recordatorios pendientes"),
    pendientes.length ? h("ul", { class: "reforzar" }, pendientes.map((r) => filaRecordatorio(r, { conPaciente: true }))) : h("p", { class: "entrada" }, "No tienes recordatorios pendientes."),
    h("h2", {}, "Pacientes"),
    h(
      "ul",
      { class: "visitas" },
      visitas
        .slice()
        .reverse()
        .map((v) => {
          const sinHacer = v.recordatorios.filter((r) => !r.hecho).length;
          return h(
            "li",
            {},
            h(
              "div",
              { class: "datos" },
              h("a", { class: "nombre-paciente", href: `#/historial/${v.id}` }, v.alias || "Sin identificar"),
              h("span", { class: "chip gris" }, fechaCorta(v.fechaVisita || v.creado)),
              v.estado === "en-curso" ? h("span", { class: "chip" }, "En curso") : h("span", { class: `chip ${v.resultado === "acepto" ? "bien" : "gris"}` }, RESULTADOS[v.resultado] || "Sin resultado"),
              h("span", { class: "chip gris" }, `${cumplimiento(v, flujo)} % del flujo`),
              sinHacer > 0 && h("span", { class: "chip mal" }, `${sinHacer} recordatorio${sinHacer > 1 ? "s" : ""}`),
            ),
            v.motivo && h("p", {}, v.motivo),
          );
        }),
    ),
    resumen.aReforzar.length > 0 &&
      h(
        "details",
        { class: "paso-guia" },
        h("summary", {}, h("strong", {}, "Puntos que más se te resisten")),
        h(
          "ul",
          { class: "reforzar" },
          resumen.aReforzar.slice(0, 6).map((p) => h("li", {}, h("span", {}, p.texto), h("div", { class: "datos" }, h("span", { class: "chip mal" }, `${p.veces} de ${resumen.terminadas}`), h("span", { class: "chip gris" }, p.paso.titulo), enlacesATemas(p.paso.temas.slice(0, 1), temas)))),
        ),
      ),
    h("h2", {}, "Practicar con una IA"),
    h("p", { class: "entrada" }, "Llévate el método, tu historial y el temario en un archivo. Adjúntalo a una conversación con una IA y te hará de paciente y te corregirá."),
    botonesDePractica({
      nombre: "novalis-aprende-practica.md",
      generar: async () => textoParaIA({ visitas, flujo, temas: (await apiJson("/api/material")).temas }),
    }),
  ];
}

function vistaPaciente(id, visitas, flujo, temas) {
  const visita = visitas.find((v) => v.id === id);
  if (!visita) return [h("p", { class: "error" }, "No se ha encontrado este paciente."), h("a", { href: "#/historial" }, "Volver al historial")];
  const guardar = (cambio) => {
    cambiarVisita(id, cambio);
    pintar();
  };

  const resultado = h("select", { id: "resultado" }, h("option", { value: "" }, "Sin resultado"), Object.entries(RESULTADOS).map(([v, t]) => h("option", { value: v, selected: visita.resultado === v }, t)));
  resultado.addEventListener("change", () => guardar((v) => (v.resultado = resultado.value)));

  // Seguimiento: mensajes, llamadas y notas después de la visita.
  const tipo = h("select", { id: "seguimiento-tipo" }, Object.entries(TIPOS_SEGUIMIENTO).map(([v, t]) => h("option", { value: v }, t)));
  const texto = h("textarea", { id: "seguimiento-texto", placeholder: "Qué le has escrito o qué habéis hablado" });
  const plantilla = () =>
    (texto.value = `Buenas tardes, ${visita.alias || ""}. Te escribo porque me preocupa que tu problema haya empeorado, ya que no hemos podido volver a hablar desde tu visita. Me comentaste que querías solucionarlo, así que te he reservado una cita el [día] a las [hora] para organizarlo todo. ¿Te viene bien? Si no, dime cuándo prefieres y te llamo.`);

  const fecha = h("input", { id: "recordatorio-fecha", type: "date", required: true, value: hoy() });
  const tarea = h("input", { id: "recordatorio-texto", type: "text", maxlength: "140", required: true, placeholder: "Qué hay que hacer" });

  const borrar = h("button", { class: "enlace", type: "button" }, "Borrar paciente");
  borrar.addEventListener("click", () => {
    if (!borrar.dataset.seguro) {
      borrar.dataset.seguro = "1";
      borrar.textContent = "¿Borrar todo lo de este paciente? Pulsa otra vez";
      return;
    }
    guardarVisitas(leerVisitas().filter((v) => v.id !== id));
    location.hash = "#/historial";
  });

  const pendientes = visita.recordatorios.filter((r) => !r.hecho).sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  const hechos = visita.recordatorios.filter((r) => r.hecho);

  return [
    h("a", { class: "volver", href: "#/historial" }, "← Historial"),
    h("h1", {}, visita.alias || "Sin identificar"),
    h(
      "div",
      { class: "datos" },
      h("span", { class: "chip gris" }, fechaCorta(visita.fechaVisita || visita.creado)),
      visita.estado === "en-curso" && h("span", { class: "chip" }, "Visita en curso"),
      h("span", { class: "chip gris" }, `${cumplimiento(visita, flujo)} % del flujo`),
      visita.origen && h("span", { class: "chip gris" }, visita.origen),
      visita.acompanante && h("span", { class: "chip gris" }, `Con ${visita.acompanante}`),
      visita.importe && h("span", { class: "chip gris" }, `${visita.importe} €`),
      visita.objecion && h("span", { class: "chip gris" }, `Objeción: ${visita.objecion}`),
    ),
    visita.motivo && h("p", {}, h("strong", {}, "Motivo de consulta. "), visita.motivo),
    visita.previas && h("p", {}, h("strong", {}, "Notas previas. "), visita.previas),
    visita.notas && h("p", {}, h("strong", {}, "Notas de cierre. "), visita.notas),
    visita.estado === "en-curso" && h("div", {}, h("a", { class: "boton", href: `#/guia/${id}` }, "Continuar la guía")),
    h("div", { class: "guia" }, campo("Resultado", resultado)),
    ...seccionGrabacion(visita),

    h("h2", {}, "Recordatorios"),
    pendientes.length > 0 && h("ul", { class: "reforzar" }, pendientes.map((r) => filaRecordatorio({ ...r, visitaId: id }, { conPaciente: false }))),
    hechos.length > 0 && h("p", { class: "entrada" }, `Hechos: ${hechos.map((r) => `${r.texto} (${fechaCorta(r.fecha)})`).join(" · ")}`),
    h(
      "form",
      {
        class: "guia",
        onsubmit: (e) => {
          e.preventDefault();
          guardar((v) => v.recordatorios.push({ id: Date.now().toString(36), fecha: fecha.value, texto: tarea.value.trim(), hecho: false }));
        },
      },
      campo("Fecha", fecha),
      campo("Recordatorio", tarea),
      h("div", {}, h("button", { class: "boton secundario" }, "Añadir recordatorio")),
    ),

    h("h2", {}, "Mensajes y seguimiento"),
    visita.seguimiento.length > 0 &&
      h(
        "ul",
        { class: "visitas" },
        visita.seguimiento
          .slice()
          .reverse()
          .map((s) =>
            h(
              "li",
              {},
              h("div", { class: "datos" }, h("strong", {}, fechaCorta(s.fecha)), h("span", { class: "chip gris" }, TIPOS_SEGUIMIENTO[s.tipo] || "Nota")),
              h("p", {}, s.texto),
              h("button", { class: "enlace", type: "button", onclick: () => guardar((v) => (v.seguimiento = v.seguimiento.filter((x) => x.id !== s.id))) }, "Borrar"),
            ),
          ),
      ),
    h(
      "form",
      {
        class: "guia",
        onsubmit: (e) => {
          e.preventDefault();
          if (!texto.value.trim()) return;
          guardar((v) => v.seguimiento.push({ id: Date.now().toString(36), fecha: new Date().toISOString(), tipo: tipo.value, texto: texto.value.trim() }));
        },
      },
      campo("Tipo", tipo),
      campo("Texto", texto),
      h("div", { class: "fila" }, h("button", { class: "boton secundario" }, "Guardar en el historial"), h("button", { class: "enlace", type: "button", onclick: plantilla }, "Usar plantilla de mensaje de seguimiento")),
    ),

    h("h2", {}, "La visita, paso a paso"),
    h(
      "ol",
      { class: "pasos" },
      flujo.pasos.map((paso) => {
        const hechosPaso = paso.puntos.filter((p) => visita.puntos[p.id]).length;
        return h(
          "li",
          {},
          h(
            "details",
            {},
            h("summary", {}, h("strong", {}, paso.titulo), h("span", {}, `${hechosPaso} de ${paso.puntos.length} puntos${visita.notasPaso[paso.id] ? " · con apuntes" : ""}`)),
            h("ul", {}, paso.puntos.map((p) => h("li", {}, `${visita.puntos[p.id] ? "✓" : "✗"} ${p.texto}`))),
            visita.notasPaso[paso.id] && h("p", {}, h("strong", {}, "Apuntes. "), visita.notasPaso[paso.id]),
            h("div", { class: "datos" }, enlacesATemas(paso.temas, temas)),
          ),
        );
      }),
    ),

    h("h2", {}, "Practicar esta visita con una IA"),
    h("p", { class: "entrada" }, "El archivo lleva el método y esta visita. Adjúntalo a una conversación con una IA: hará de este paciente y después te corregirá."),
    botonesDePractica({ nombre: `practica-${(visita.alias || "paciente").toLowerCase().replace(/[^a-z0-9áéíóúñ]+/gi, "-")}.md`, generar: async () => textoParaIA({ visitas: [visita], flujo }) }),
    h("div", {}, borrar),
  ];
}

// ---------- rutas ----------
async function pintar() {
  if (!window.novalisAutorizado) return;
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  let [, seccion = "", id, extra] = location.hash.replace(/^#/, "").split("/");
  // Si se sale de la plantilla con la grabación en marcha, se guarda lo grabado.
  if (grabacionActiva && !(seccion === "guia" && id === grabacionActiva.visitaId)) await terminarGrabacion();
  // Enlaces de versiones anteriores.
  if (seccion === "visita") seccion = "guia";
  if (seccion === "seguimiento" || seccion === "profesor") seccion = "historial";
  if (seccion === "guia" && id === "guia") id = "nuevo";
  // Avisa en el menú de los recordatorios que ya tocan.
  const vencidos = recordatoriosPendientes(leerVisitas()).filter((r) => r.fecha <= hoy()).length;
  const enlaceHistorial = document.querySelector('[data-nav="historial"]');
  if (enlaceHistorial) enlaceHistorial.textContent = vencidos ? `Historial (${vencidos})` : "Historial";
  document.querySelectorAll("[data-nav]").forEach((a) => {
    const activa = a.dataset.nav === (["guia", "historial", "ajustes"].includes(seccion) ? seccion : seccion === "admin" ? "ajustes" : "temas");
    if (activa) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  try {
    estado = await apiJson("/api/estado");
    const contenido =
      ["admin", "ajustes"].includes(seccion)
        ? window.novalisPerfil?.rol === "admin"
          ? await (await import("./administracion.js")).vistaAdministracion({ apiJson, h })
          : [h("h1", {}, "Ajustes"), h("p", {}, `Tu cuenta: ${window.novalisPerfil?.email || ""}`), h("p", {}, "Tu progreso se guarda en tu cuenta. Puedes sincronizar o cerrar la sesión desde la sección de cuenta.")]
        : seccion === "tema" && id
        ? await vistaTema(id)
        : seccion === "examen" && id
          ? await vistaExamen(id)
          : seccion === "guia"
            ? await vistaGuia(id)
            : seccion === "historial"
              ? await vistaHistorial(id, extra)
              : await vistaTemas();
    vista.replaceChildren(...contenido.filter(Boolean));
  } catch (error) {
    vista.replaceChildren(h("p", { class: "error" }, error.message), h("a", { href: "#/" }, "Volver a los temas"));
  }
  window.scrollTo(0, 0);
}

window.addEventListener("hashchange", pintar);
window.addEventListener("novalis:sincronizado", pintar);
pintar();
