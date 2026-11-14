const CLAVES = ["visitas", "resultados", "valoracion", "caso", "visita-borrador"];
const NOMBRES = { visitas: "visitas", resultados: "notas de examen", valoracion: "valoración del profesor", caso: "caso práctico", "visita-borrador": "borrador de visita" };

function elemento(tag, texto, atributos = {}) {
  const el = document.createElement(tag);
  if (texto) el.textContent = texto;
  for (const [clave, valor] of Object.entries(atributos)) el.setAttribute(clave, valor);
  return el;
}

export async function iniciarCuenta() {
  const panel = document.getElementById("cuenta");
  let config;
  try {
    const r = await fetch("/api/configuracion", { signal: AbortSignal.timeout(10000) });
    if (!r.ok) return;
    config = await r.json();
  } catch { return; }
  if (!config.supabaseUrl || !config.supabaseKey || !window.supabase) return;
  const cliente = window.supabase.createClient(config.supabaseUrl, config.supabaseKey, {
    global: { fetch: (url, opciones) => fetch(url, { ...opciones, signal: opciones?.signal || AbortSignal.timeout(15000) }) },
  });
  panel.hidden = false;
  const titulo = elemento("h2", "Tu progreso, contigo");
  const estado = elemento("p", "", { role: "status", "aria-live": "polite" });
  panel.append(titulo, estado);
  const { data, error: errorSesion } = await cliente.auth.getSession();
  if (errorSesion) estado.textContent = "No se pudo recuperar la sesión. Vuelve a entrar.";
  const usuario = data?.session?.user;
  if (!usuario) {
    estado.textContent = "Entra con el mismo correo en el móvil y en el iPad para compartir tus avances.";
    const form = elemento("form", "", { class: "form-cuenta" });
    const correo = elemento("input", "", { type: "email", autocomplete: "email", required: "", placeholder: "Tu correo electrónico", "aria-label": "Correo electrónico" });
    const entrar = elemento("button", "Recibir enlace de acceso", { class: "boton", type: "submit" });
    form.append(correo, entrar);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      entrar.disabled = true;
      try {
        const { error } = await cliente.auth.signInWithOtp({ email: correo.value.trim(), options: { emailRedirectTo: location.origin + location.pathname } });
        if (error) throw error;
        estado.textContent = "Revisa tu correo y abre el enlace en este dispositivo para entrar.";
      } catch { estado.textContent = "No se pudo enviar el enlace. Revisa el correo e inténtalo de nuevo."; }
      finally { entrar.disabled = false; }
    });
    panel.append(form);
    cliente.auth.onAuthStateChange((evento, sesion) => {
      if (evento === "SIGNED_IN" && sesion) location.reload();
    });
    return;
  }

  // Espacio local independiente por cuenta; nunca se suben datos de un invitado
  // o de otro usuario sin una importación expresa.
  const prefijo = `novalis:${usuario.id}:`;
  window.novalisClave = (clave) => clave === "codigo" ? clave : prefijo + clave;
  const metaClave = prefijo + "sincronizacion";
  let meta;
  try { meta = JSON.parse(localStorage.getItem(metaClave)) || {}; } catch { meta = {}; }
  const pendientes = new Set(CLAVES.filter((clave) => meta[clave]?.pendiente));
  const conflictos = new Map();
  let ocupado = false;
  let solicitada = false;
  const guardarMeta = () => localStorage.setItem(metaClave, JSON.stringify(meta));
  const local = (clave) => localStorage.getItem(prefijo + clave);
  const repintar = () => window.dispatchEvent(new Event("novalis:sincronizado"));
  const acciones = elemento("div", "", { class: "fila" });
  const reintentar = elemento("button", "Sincronizar ahora", { class: "boton secundario", type: "button" });
  const salir = elemento("button", "Cerrar sesión", { class: "boton secundario", type: "button" });
  acciones.append(reintentar, salir);
  const conflictosUI = elemento("div");
  panel.append(elemento("p", usuario.email), acciones, conflictosUI);

  function mostrarConflictos() {
    conflictosUI.replaceChildren();
    for (const [clave, remoto] of conflictos) {
      const caja = elemento("div", "", { class: "aviso" });
      caja.append(elemento("p", `Hay cambios de ${NOMBRES[clave]} en ambos dispositivos. Elige qué versión conservar.`));
      const nube = elemento("button", "Usar la versión de la nube", { class: "boton secundario", type: "button" });
      const este = elemento("button", "Conservar la de este dispositivo", { class: "boton secundario", type: "button" });
      nube.onclick = () => {
        localStorage.setItem(prefijo + clave, JSON.stringify(remoto.valor));
        meta[clave] = { revision: remoto.revision, pendiente: false };
        pendientes.delete(clave);
        conflictos.delete(clave);
        guardarMeta(); mostrarConflictos(); repintar(); sincronizar();
      };
      este.onclick = () => {
        meta[clave] = { revision: remoto.revision, pendiente: true };
        conflictos.delete(clave);
        pendientes.add(clave);
        guardarMeta(); mostrarConflictos(); sincronizar();
      };
      caja.append(nube, " ", este);
      conflictosUI.append(caja);
    }
  }

  async function sincronizar() {
    if (ocupado) { solicitada = true; return; }
    ocupado = true;
    estado.textContent = "Sincronizando…";
    try {
      const { data: filas, error } = await cliente.from("progreso").select("clave,valor,revision");
      if (error) throw error;
      let cambios = false;
      for (const fila of filas) {
        const clave = fila.clave;
        if (!CLAVES.includes(clave)) continue;
        if (pendientes.has(clave)) {
          if ((meta[clave]?.revision || 0) !== fila.revision) conflictos.set(clave, fila);
          continue;
        }
        if (local(clave) !== JSON.stringify(fila.valor)) {
          localStorage.setItem(prefijo + clave, JSON.stringify(fila.valor));
          cambios = true;
        }
        meta[clave] = { revision: fila.revision, pendiente: false };
      }
      if (cambios) repintar();
      for (const clave of pendientes) {
        if (conflictos.has(clave)) continue;
        const valor = local(clave);
        if (valor == null) continue;
        const { data: revision, error } = await cliente.rpc("guardar_progreso", {
          p_clave: clave, p_valor: JSON.parse(valor), p_revision: meta[clave]?.revision || 0,
        });
        if (error) throw error;
        // Otra pestaña/dispositivo pudo escribir entre la lectura y el guardado.
        if (revision == null) throw new Error("conflicto");
        const siguePendiente = local(clave) !== valor;
        meta[clave] = { revision, pendiente: siguePendiente };
        if (!siguePendiente) pendientes.delete(clave);
      }
      guardarMeta(); mostrarConflictos();
      estado.textContent = conflictos.size ? "Hay cambios que necesitan tu elección." : pendientes.size ? "Hay cambios pendientes de subir." : "Todo guardado en tu cuenta.";
    } catch {
      estado.textContent = "No se ha sincronizado. Tus cambios siguen en este dispositivo. Pulsa «Sincronizar ahora» para reintentar.";
    } finally {
      ocupado = false;
      if (solicitada) { solicitada = false; queueMicrotask(sincronizar); }
    }
  }
  window.addEventListener("novalis:guardado", ({ detail: { clave } }) => {
    if (!CLAVES.includes(clave)) return;
    pendientes.add(clave);
    meta[clave] = { revision: meta[clave]?.revision || 0, pendiente: true };
    guardarMeta();
    sincronizar();
  });
  reintentar.onclick = sincronizar;
  salir.onclick = async () => {
    if (ocupado || pendientes.size) {
      estado.textContent = "Sincroniza los cambios pendientes antes de cerrar sesión.";
      return;
    }
    const { error } = await cliente.auth.signOut();
    if (error) { estado.textContent = "No se pudo cerrar la sesión. Inténtalo de nuevo."; return; }
    location.reload();
  };
  window.addEventListener("online", sincronizar);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) sincronizar(); });
  cliente.auth.onAuthStateChange((evento) => { if (evento === "SIGNED_OUT") location.reload(); });
  await sincronizar();
}
