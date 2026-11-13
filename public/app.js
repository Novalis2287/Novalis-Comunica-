// Interfaz de Novalis Comunica: temas, examen y profesor con IA.
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
      return JSON.parse(localStorage.getItem(clave)) ?? defecto;
    } catch {
      return defecto;
    }
  },
  guardar(clave, valor) {
    try {
      localStorage.setItem(clave, JSON.stringify(valor));
    } catch {
      /* sin almacenamiento: la app sigue funcionando */
    }
  },
};

function markdownSeguro(texto) {
  return DOMPurify.sanitize(marked.parse(texto));
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
    const r = await fetch(ruta, {
      ...opciones,
      headers: {
        ...(opciones.body ? { "Content-Type": "application/json" } : {}),
        "x-codigo-acceso": almacen.leer("codigo", ""),
      },
    });
    if (r.status === 401) {
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
    h("h1", {}, "Temas"),
    h(
      "p",
      { class: "entrada" },
      "Lee o escucha cada tema, entrénalo con un examen y coméntalo con el profesor.",
    ),
    estado.fuentes.length === 0 &&
      h("p", { class: "aviso" }, "Todavía no hay fuentes cargadas. Lo que ves es un tema de muestra."),
    h(
      "ul",
      { class: "temas" },
      temas.map((t) => {
        const ultimo = res[t.id]?.at(-1);
        return h(
          "li",
          { class: "tema-tarjeta" },
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
            p.opciones.map((o, j) =>
              h("label", { class: "opcion" }, h("input", { type: "radio", name: `p${i}`, value: j, id: `p${i}o${j}` }), h("span", {}, o)),
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
    await Promise.all(
      preguntas.map(async (p, i) => {
        const campo = campos[i];
        const correccion = campo.querySelector(".correccion");
        correccion.hidden = false;
        campo.querySelectorAll("input, textarea").forEach((c) => (c.disabled = true));
        if (p.tipo === "test") {
          const marcada = campo.querySelector("input:checked");
          const elegida = marcada ? Number(marcada.value) : -1;
          const opciones = campo.querySelectorAll(".opcion");
          opciones[p.correcta].classList.add("correcta");
          if (elegida !== p.correcta && elegida >= 0) opciones[elegida].classList.add("fallada");
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
            h("p", {}, h("strong", {}, `Nota: ${c.nota}/10`)),
            h("p", {}, h("strong", {}, "Aciertos. "), c.aciertos),
            h("p", {}, h("strong", {}, "A mejorar. "), c.mejoras),
            h("p", {}, h("strong", {}, "Respuesta modelo. "), c.respuesta_modelo),
          );
        } catch (error) {
          notas[i] = null;
          correccion.replaceChildren(h("p", { class: "error" }, `No se ha podido corregir: ${error.message} Esta pregunta no puntúa.`));
        }
      }),
    );
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
    h("p", { class: "entrada" }, `${preguntas.length} preguntas. Las de desarrollo las corrige el profesor con IA.`),
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
      const r = await api("/api/chat", { method: "POST", body: JSON.stringify({ mensajes, temaId: selector.value || null }) });
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
    enviarBtn.disabled = false;
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
      estado.fuentes.length
        ? `Conoce las ${estado.fuentes.length} fuentes del curso. Pregunta, debate o pídele que te examine.`
        : "Pregunta, debate o pídele que te examine. Aún no hay fuentes cargadas.",
    ),
    !estado.tutor && h("p", { class: "aviso" }, "El profesor con IA aún no está configurado en el servidor (falta la clave de IA)."),
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

// ---------- rutas ----------
async function pintar() {
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  const [, seccion = "", id] = location.hash.replace(/^#/, "").split("/");
  document.querySelectorAll("[data-nav]").forEach((a) => {
    const activa = a.dataset.nav === (seccion === "profesor" ? "profesor" : "temas");
    if (activa) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  try {
    estado = await apiJson("/api/estado");
    const contenido =
      seccion === "tema" && id
        ? await vistaTema(id)
        : seccion === "examen" && id
          ? await vistaExamen(id)
          : seccion === "profesor"
            ? await vistaProfesor(id)
            : await vistaTemas();
    vista.replaceChildren(...contenido.filter(Boolean));
  } catch (error) {
    vista.replaceChildren(h("p", { class: "error" }, error.message), h("a", { href: "#/" }, "Volver a los temas"));
  }
  window.scrollTo(0, 0);
}

window.addEventListener("hashchange", pintar);
pintar();
