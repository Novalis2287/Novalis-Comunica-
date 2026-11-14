// Interfaz de Novalis Aprende: temas, examen y profesor con IA.
import { observarProfesor, prepararProfesor, detenerProfesor, peticionProfesor } from "./profesor-local.js";
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
  if (estado.tutorModo === "local" && ["/api/chat", "/api/corregir", "/api/progreso"].includes(ruta)) {
    // Se valida la cuenta antes de cada generación, también si el material ya está en memoria.
    await apiJson("/api/profesor/material");
    return peticionProfesor(ruta, JSON.parse(opciones.body || "{}"), apiJson);
  }
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
      h("div", { class: "fila" }, h("a", { class: "boton", href: `#/tema/${temas[0]?.id || ""}` }, "Empezar a aprender"), h("a", { class: "boton secundario", href: "#/visita" }, "Practicar una visita")),
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
      h("a", { class: "boton secundario", href: `#/profesor/${id}` }, "Preguntar al profesor"),
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
        if (!estado.tutor) {
          notas[i] = null;
          correccion.append(
            h("p", {}, "El profesor con IA no está configurado, así que esta pregunta no puntúa. Compárala con los criterios:"),
            h("p", {}, p.criterios || ""),
          );
          return;
        }
        correccion.append(h("p", {}, "El profesor está corrigiendo tu respuesta…"));
        try {
          const c = await apiJson("/api/corregir", { method: "POST", body: JSON.stringify({ temaId: id, indice: i, respuesta }) });
          notas[i] = c.nota;
          correccion.replaceChildren(
            h("p", {}, h("strong", {}, `Nota orientativa: ${c.nota}/10`)),
            h("p", {}, h("strong", {}, "Aciertos. "), c.aciertos),
            h("p", {}, h("strong", {}, "A mejorar. "), c.mejoras),
            h("p", {}, h("strong", {}, "Respuesta modelo. "), c.respuesta_modelo),
          );
        } catch (error) {
          notas[i] = null;
          correccion.replaceChildren(h("p", { class: "error" }, `No se ha podido corregir: ${error.message} Esta pregunta no puntúa.`));
        }
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
        h("a", { class: "boton secundario", href: `#/profesor/${id}` }, "Repasar con el profesor"),
      ),
    );
    zonaNota.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return [
    h("a", { class: "volver", href: `#/tema/${id}` }, `← ${tema.titulo}`),
    h("h1", {}, "Examen"),
    h("p", { class: "entrada" }, `${preguntas.length} preguntas. Las de desarrollo reciben una corrección orientativa. Prepara primero el modelo en Profesor.`),
    zonaNota,
    h("form", { class: "examen", onsubmit: entregar }, campos, h("div", {}, boton)),
  ];
}

// ---------- vista: profesor ----------
async function vistaProfesor(temaId) {
  const temas = await apiJson("/api/temas");
  let mensajes = almacen.leer("chat", []);
  let ocupado = false;

  const lista = h("div", { class: "chat", "aria-live": "polite" });
  const errorEl = h("p", { class: "error", hidden: true });
  const campo = h("textarea", { id: "mensaje", placeholder: "Escribe al profesor…", "aria-label": "Mensaje para el profesor" });
  const selector = h(
    "select",
    { id: "tema-chat", "aria-label": "Tema de la conversación" },
    h("option", { value: "" }, "Todos los temas"),
    temas.map((t) => h("option", { value: t.id, selected: t.id === temaId }, t.titulo)),
  );
  const enviarBtn = h("button", { class: "boton" }, "Enviar");
  const estadoLocal = h("p", { role: "status" });
  const progresoLocal = h("progress", { max: 1, value: 0, "aria-label": "Preparación del profesor" });
  const preparar = h("button", { class: "boton", type: "button", onclick: async () => {
    try { await prepararProfesor(); } catch { /* El estado muestra el error y permite reintentar. */ }
  } }, "Descargar y preparar profesor");
  const detener = h("button", { class: "boton secundario", type: "button", onclick: () => detenerProfesor() }, "Detener respuesta");
  let listo = estado.tutorModo !== "local";
  let desobservar = () => {};
  if (estado.tutorModo === "local") desobservar = observarProfesor((s) => {
    listo = s.fase === "listo";
    estadoLocal.textContent = s.texto;
    progresoLocal.value = s.progreso;
    progresoLocal.hidden = s.fase !== "cargando";
    preparar.disabled = s.fase === "cargando" || listo;
    preparar.textContent = listo ? "Profesor preparado" : s.fase === "error" ? "Volver a preparar profesor" : "Descargar y preparar profesor";
    enviarBtn.disabled = !listo || ocupado;
  });
  window.addEventListener("hashchange", desobservar, { once: true });
  const sugerencias = h(
    "div",
    { class: "sugerencias" },
    ["Hazme un caso práctico y corrige mi respuesta", "Pregúntame lo más importante de este tema", "Explícame la idea que más cuesta entender"].map((s) =>
      h("button", { type: "button", onclick: () => enviar(s) }, s),
    ),
  );

  function burbuja(m) {
    return m.role === "user"
      ? h("div", { class: "mensaje user" }, m.content)
      : h("div", { class: "mensaje assistant", html: markdownSeguro(m.content) });
  }
  function repintar() {
    lista.replaceChildren(...mensajes.map(burbuja));
    sugerencias.hidden = mensajes.length > 0;
  }

  async function enviar(texto) {
    texto = texto.trim();
    if (!texto || ocupado) return;
    if (!listo) { errorEl.textContent = "Prepara el profesor en este dispositivo antes de enviar una pregunta."; errorEl.hidden = false; return; }
    ocupado = true;
    enviarBtn.disabled = true;
    errorEl.hidden = true;
    mensajes.push({ role: "user", content: texto });
    repintar();
    campo.value = "";
    const respuesta = h("div", { class: "mensaje assistant" }, "…");
    lista.append(respuesta);
    respuesta.scrollIntoView({ block: "end" });
    let acumulado = "";
    try {
      const r = await api("/api/chat", { method: "POST", body: JSON.stringify({ mensajes, temaId: selector.value || null, visitas: visitasParaProfesor() }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Error ${r.status}`);
      const lector = r.body.pipeThrough(new TextDecoderStream()).getReader();
      let resto = "";
      for (;;) {
        const { value, done } = await lector.read();
        if (done) break;
        resto += value;
        const eventos = resto.split("\n\n");
        resto = eventos.pop();
        for (const ev of eventos) {
          if (!ev.startsWith("data: ")) continue;
          const dato = JSON.parse(ev.slice(6));
          if (dato.error) throw new Error(dato.error);
          if (dato.aviso) acumulado += `\n\n_${dato.aviso}_`;
          if (dato.texto) acumulado += dato.texto;
          respuesta.innerHTML = markdownSeguro(acumulado);
        }
      }
      if (!acumulado) throw new Error("El profesor no ha devuelto respuesta.");
      mensajes.push({ role: "assistant", content: acumulado });
    } catch (error) {
      // Se conserva lo que haya llegado; si no llegó nada, se devuelve el texto al campo.
      if (acumulado) mensajes.push({ role: "assistant", content: acumulado });
      else {
        mensajes.pop();
        campo.value = texto;
      }
      errorEl.textContent = error.message;
      errorEl.hidden = false;
    }
    almacen.guardar("chat", mensajes);
    repintar();
    ocupado = false;
    enviarBtn.disabled = !listo;
  }

  campo.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      enviar(campo.value);
    }
  });
  repintar();

  return [
    h("h1", {}, "Profesor"),
    h(
      "p",
      { class: "entrada" },
      estado.tutorModo === "local"
        ? "Estudia el temario con explicaciones, preguntas y casos prácticos. El profesor selecciona fragmentos del curso para responder."
        : estado.fuentes.length
        ? `Conoce las ${estado.fuentes.length} fuentes del curso. Pregunta, debate o pídele que te examine.`
        : "Pregunta, debate o pídele que te examine. Aún no hay fuentes cargadas.",
    ),
    estado.tutorModo === "local" && h("section", { class: "profesor-preparacion", "aria-label": "Profesor en este dispositivo" },
      h("h2", {}, "Profesor en tu dispositivo · Prueba"),
      h("p", {}, "Sin claves de API ni cuentas de otros servicios de IA. El modelo se descarga desde Hugging Face y MLC; las preguntas se procesan en tu dispositivo. Usa Wi-Fi: la descarga es grande. El navegador puede borrar la copia guardada y volver a descargarla."),
      h("p", {}, "Las respuestas y las notas de desarrollo son orientativas. Esta prueba necesita Safari actualizado y memoria disponible; todavía debe validarse en tu iPhone y iPad."),
      estadoLocal, progresoLocal, h("div", { class: "fila" }, preparar, detener)),
    lista,
    sugerencias,
    errorEl,
    h(
      "form",
      {
        class: "redactar",
        onsubmit: (e) => {
          e.preventDefault();
          enviar(campo.value);
        },
      },
      campo,
      h(
        "div",
        { class: "fila" },
        enviarBtn,
        selector,
        h(
          "button",
          {
            class: "boton secundario",
            type: "button",
            onclick: () => {
              if (ocupado) return;
              mensajes = [];
              almacen.guardar("chat", mensajes);
              repintar();
            },
          },
          "Nueva conversación",
        ),
      ),
    ),
  ];
}

// ---------- primera visita: flujo, caso guiado y guía de consulta ----------
const visitasGuardadas = () => almacen.leer("visitas", []);
// Al profesor no se le envía el identificador del paciente.
const visitasParaProfesor = () => visitasGuardadas().map(({ alias, id, ...resto }) => resto);

const RESULTADOS = { acepto: "Aceptó", pensarlo: "Lo tiene que pensar", no: "No aceptó", "sin-plan": "Sin plan en esta visita" };
const OBJECIONES = ["Ninguna", "Precio", "Tiene que pensarlo", "Consultarlo con la pareja o la familia", "Falta de tiempo", "Miedo", "Edad", "Solo quiere arreglar una pieza", "Desconfianza en pagar por adelantado", "Otra"];

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

async function vistaVisita(modo) {
  const [flujo, temas] = await Promise.all([apiJson("/api/flujo"), apiJson("/api/temas")]);
  if (modo === "caso") return vistaCaso(flujo, temas);
  if (modo === "guia") return vistaGuia(flujo, temas);
  return [
    h("h1", {}, "Primera visita"),
    h("p", { class: "entrada" }, "La visita completa, paso a paso, aplicando cada tema en el momento en que aparece con el paciente."),
    h(
      "div",
      { class: "modos" },
      h("a", { class: "modo", href: "#/visita/caso" }, h("strong", {}, "Aprender con un caso"), h("span", {}, "Recorre la visita de Alfredo decidiendo qué haces en cada momento.")),
      h("a", { class: "modo", href: "#/visita/guia" }, h("strong", {}, "Guía para la consulta"), h("span", {}, "Los pasos, las frases y los puntos de control para usar en una visita real y registrarla.")),
    ),
    h("h2", {}, "Los pasos"),
    h(
      "ol",
      { class: "pasos" },
      flujo.pasos.map((paso) =>
        h("li", {}, h("details", {}, h("summary", {}, h("strong", {}, paso.titulo), h("span", {}, paso.objetivo)), fichaDelPaso(paso, temas))),
      ),
    ),
  ];
}

function vistaCaso(flujo, temas) {
  const zona = h("div", { class: "caso" });
  let i = -1;
  let aciertos = 0;

  function pintarPaso() {
    if (i < 0) {
      zona.replaceChildren(
        h("p", { class: "escena" }, flujo.caso.presentacion),
        h("div", {}, h("button", { class: "boton", type: "button", onclick: avanzar }, "Empezar la visita")),
      );
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
          h("a", { class: "boton", href: "#/visita/guia" }, "Usar la guía en una visita real"),
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
  return [h("a", { class: "volver", href: "#/visita" }, "← Primera visita"), h("h1", {}, flujo.caso.titulo), zona];
}

function vistaGuia(flujo, temas) {
  const vacio = () => ({ alias: "", puntos: {}, resultado: "", objecion: "Ninguna", notas: "" });
  let borrador = { ...vacio(), ...almacen.leer("visita-borrador", {}) };
  const guardarBorrador = () => almacen.guardar("visita-borrador", borrador);
  const aviso = h("p", { class: "error", hidden: true });

  const alias = h("input", { id: "alias", type: "text", maxlength: "20", value: borrador.alias, placeholder: "Iniciales o código", autocomplete: "off" });
  alias.addEventListener("input", () => { borrador.alias = alias.value; guardarBorrador(); });

  const secciones = flujo.pasos.map((paso, n) => {
    const contador = h("span", { class: "contador" });
    const actualizar = () => {
      const hechos = paso.puntos.filter((p) => borrador.puntos[p.id]).length;
      contador.textContent = `${hechos}/${paso.puntos.length}`;
      contador.classList.toggle("completo", hechos === paso.puntos.length);
    };
    const casillas = paso.puntos.map((p) => {
      const casilla = h("input", { type: "checkbox", id: `punto-${p.id}`, checked: Boolean(borrador.puntos[p.id]) });
      casilla.addEventListener("change", () => {
        if (casilla.checked) borrador.puntos[p.id] = true;
        else delete borrador.puntos[p.id];
        guardarBorrador();
        actualizar();
      });
      return h("label", { class: "opcion" }, casilla, h("span", {}, p.texto));
    });
    actualizar();
    return h(
      "details",
      { class: "paso-guia", open: n === 0 },
      h("summary", {}, h("strong", {}, `${n + 1}. ${paso.titulo}`), contador),
      h("p", { class: "objetivo" }, paso.objetivo),
      h("ul", { class: "frases" }, paso.frases.map((f) => h("li", {}, `«${f}»`))),
      h("div", { class: "opciones" }, casillas),
      h("p", { class: "evita" }, h("strong", {}, "Evita: "), paso.evita.join(" ")),
      h("div", { class: "datos" }, enlacesATemas(paso.temas, temas)),
    );
  });

  const resultado = h("select", { id: "resultado" }, h("option", { value: "" }, "Elige el resultado…"), Object.entries(RESULTADOS).map(([v, t]) => h("option", { value: v, selected: borrador.resultado === v }, t)));
  resultado.addEventListener("change", () => { borrador.resultado = resultado.value; guardarBorrador(); });
  const objecion = h("select", { id: "objecion" }, OBJECIONES.map((o) => h("option", { value: o, selected: borrador.objecion === o }, o)));
  objecion.addEventListener("change", () => { borrador.objecion = objecion.value; guardarBorrador(); });
  const notas = h("textarea", { id: "notas", placeholder: "Qué salió bien, qué se te resistió, qué dijo el paciente…" }, borrador.notas);
  notas.addEventListener("input", () => { borrador.notas = notas.value; guardarBorrador(); });

  function guardarVisita(e) {
    e.preventDefault();
    if (!borrador.resultado) {
      aviso.textContent = "Elige el resultado de la visita antes de guardarla.";
      aviso.hidden = false;
      return;
    }
    const visitas = visitasGuardadas();
    visitas.push({ id: Date.now().toString(36), fecha: new Date().toISOString(), alias: borrador.alias.trim(), resultado: borrador.resultado, objecion: borrador.objecion === "Ninguna" ? "" : borrador.objecion, notas: borrador.notas.trim(), puntos: borrador.puntos });
    almacen.guardar("visitas", visitas);
    almacen.guardar("visita-borrador", vacio());
    location.hash = "#/seguimiento";
  }

  return [
    h("a", { class: "volver", href: "#/visita" }, "← Primera visita"),
    h("h1", {}, "Guía para la consulta"),
    h("p", { class: "entrada" }, "Abre cada paso para ver las frases y marca lo que vayas cumpliendo. Al terminar, guarda la visita para tu seguimiento."),
    h("p", { class: "aviso" }, "Identifica al paciente con iniciales o un código, nunca con su nombre completo. Todo se guarda solo en este dispositivo."),
    h(
      "form",
      { class: "guia", onsubmit: guardarVisita },
      h("label", { class: "campo", for: "alias" }, "Paciente", alias),
      secciones,
      h("h2", {}, "Cierre de la visita"),
      h("label", { class: "campo", for: "resultado" }, "Resultado", resultado),
      h("label", { class: "campo", for: "objecion" }, "Objeción principal", objecion),
      h("label", { class: "campo", for: "notas" }, "Notas", notas),
      aviso,
      h(
        "div",
        { class: "fila" },
        h("button", { class: "boton" }, "Guardar visita"),
        h("button", { class: "boton secundario", type: "button", onclick: () => { almacen.guardar("visita-borrador", vacio()); pintar(); } }, "Empezar de cero"),
      ),
    ),
  ];
}

// ---------- seguimiento: evaluación continua de las visitas reales ----------
async function vistaSeguimiento() {
  const [flujo, temas] = await Promise.all([apiJson("/api/flujo"), apiJson("/api/temas")]);
  const visitas = visitasGuardadas();
  if (!visitas.length) {
    return [
      h("h1", {}, "Seguimiento"),
      h("p", { class: "entrada" }, "Aquí verás qué puntos de la primera visita cumples y cuáles debes reforzar, a partir de las visitas reales que registres."),
      h("p", { class: "aviso" }, "Todavía no hay ninguna visita registrada."),
      h("div", {}, h("a", { class: "boton", href: "#/visita/guia" }, "Registrar una visita")),
    ];
  }
  const total = visitas.length;
  const ids = flujo.pasos.flatMap((p) => p.puntos.map((x) => x.id));
  const cumplimiento = (v) => Math.round((100 * ids.filter((id) => v.puntos[id]).length) / ids.length);
  const media = Math.round(visitas.reduce((a, v) => a + cumplimiento(v), 0) / total);
  const conPlan = visitas.filter((v) => v.resultado !== "sin-plan");
  const aceptacion = conPlan.length ? Math.round((100 * conPlan.filter((v) => v.resultado === "acepto").length) / conPlan.length) : null;
  const puntos = flujo.pasos.flatMap((paso) => paso.puntos.map((p) => ({ ...p, paso, veces: visitas.filter((v) => v.puntos[p.id]).length })));
  const aReforzar = puntos.filter((p) => p.veces / total < 0.5).sort((a, b) => a.veces - b.veces).slice(0, 6);
  const consolidados = puntos.filter((p) => p.veces / total >= 0.8).length;

  const valoracion = h("div", { class: "valoracion" });
  const guardada = almacen.leer("valoracion", null);
  const pintarValoracion = (v) =>
    valoracion.replaceChildren(h("p", { class: "fecha" }, `Valoración del ${new Date(v.fecha).toLocaleDateString("es-ES")}, con ${v.visitas} visita${v.visitas > 1 ? "s" : ""}`), h("div", { html: markdownSeguro(v.texto) }));
  if (guardada) pintarValoracion(guardada);
  const pedir = h("button", { class: "boton", type: "button", disabled: !estado.tutor }, guardada ? "Pedir una valoración nueva" : "Pedir valoración al profesor");
  pedir.addEventListener("click", async () => {
    pedir.disabled = true;
    pedir.textContent = "El profesor está revisando tus visitas…";
    try {
      const r = await apiJson("/api/progreso", { method: "POST", body: JSON.stringify({ visitas: visitasParaProfesor() }) });
      const v = { fecha: new Date().toISOString(), visitas: total, texto: r.valoracion };
      almacen.guardar("valoracion", v);
      pintarValoracion(v);
    } catch (error) {
      valoracion.replaceChildren(h("p", { class: "error" }, error.message));
    }
    pedir.disabled = false;
    pedir.textContent = "Pedir una valoración nueva";
  });

  function filaVisita(v) {
    const borrar = h("button", { class: "enlace", type: "button" }, "Borrar");
    borrar.addEventListener("click", () => {
      if (borrar.dataset.seguro) {
        almacen.guardar("visitas", visitasGuardadas().filter((x) => x.id !== v.id));
        pintar();
      } else {
        borrar.dataset.seguro = "1";
        borrar.textContent = "¿Borrar? Pulsa otra vez";
      }
    });
    return h(
      "li",
      {},
      h("div", { class: "datos" }, h("strong", {}, new Date(v.fecha).toLocaleDateString("es-ES")), v.alias && h("span", {}, v.alias), h("span", { class: `chip ${v.resultado === "acepto" ? "bien" : "gris"}` }, RESULTADOS[v.resultado]), h("span", { class: "chip" }, `${cumplimiento(v)} % del flujo`), v.objecion && h("span", { class: "chip gris" }, v.objecion)),
      v.notas && h("p", {}, v.notas),
      borrar,
    );
  }

  return [
    h("h1", {}, "Seguimiento"),
    h(
      "div",
      { class: "cifras" },
      h("div", {}, h("strong", {}, total), h("span", {}, total === 1 ? "visita registrada" : "visitas registradas")),
      h("div", {}, h("strong", {}, `${media} %`), h("span", {}, "cumplimiento medio del flujo")),
      h("div", {}, h("strong", {}, aceptacion == null ? "—" : `${aceptacion} %`), h("span", {}, "aceptación con plan presentado")),
    ),
    total < 5 && h("p", { class: "aviso" }, "Con menos de cinco visitas estos datos son solo orientativos."),
    h("h2", {}, "Puntos a reforzar"),
    aReforzar.length
      ? h(
          "ul",
          { class: "reforzar" },
          aReforzar.map((p) => h("li", {}, h("span", {}, p.texto), h("div", { class: "datos" }, h("span", { class: "chip mal" }, `${p.veces} de ${total}`), h("span", { class: "chip gris" }, p.paso.titulo), enlacesATemas(p.paso.temas.slice(0, 1), temas)))),
        )
      : h("p", {}, "No hay ningún punto que cumplas en menos de la mitad de las visitas."),
    h("p", { class: "entrada" }, `${consolidados} de ${puntos.length} puntos consolidados (los cumples en al menos el 80 % de las visitas).`),
    h("h2", {}, "Cumplimiento por paso"),
    h(
      "div",
      { class: "barras" },
      flujo.pasos.map((paso) => {
        const pct = Math.round((100 * paso.puntos.reduce((a, p) => a + visitas.filter((v) => v.puntos[p.id]).length, 0)) / (paso.puntos.length * total));
        return h("div", { class: "barra" }, h("span", {}, paso.titulo), h("span", { class: "pista" }, h("span", { class: "relleno", style: `width:${pct}%` })), h("span", { class: "valor" }, `${pct} %`));
      }),
    ),
    h("h2", {}, "El profesor"),
    estado.tutorModo === "local" && h("p", { class: "aviso" }, "La valoración es orientativa. Prepara primero el modelo desde la sección Profesor en este dispositivo."),
    h("div", {}, pedir),
    valoracion,
    h("h2", {}, "Visitas"),
    h("ul", { class: "visitas" }, visitas.slice().reverse().map(filaVisita)),
    h("div", {}, h("a", { class: "boton secundario", href: "#/visita/guia" }, "Registrar otra visita")),
  ];
}

// ---------- rutas ----------
async function pintar() {
  if (!window.novalisAutorizado) return;
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  const [, seccion = "", id] = location.hash.replace(/^#/, "").split("/");
  document.querySelectorAll("[data-nav]").forEach((a) => {
    const activa = a.dataset.nav === (["profesor", "visita", "seguimiento", "ajustes"].includes(seccion) ? seccion : seccion === "admin" ? "ajustes" : "temas");
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
          : seccion === "profesor"
            ? await vistaProfesor(id)
            : seccion === "visita"
              ? await vistaVisita(id)
              : seccion === "seguimiento"
                ? await vistaSeguimiento()
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
