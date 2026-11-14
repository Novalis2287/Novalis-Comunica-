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
  panel.hidden = false;
  document.body?.classList.add("sin-sesion");
  let config;
  try {
    const r = await fetch("/api/configuracion", { signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error();
    config = await r.json();
  } catch {
    panel.append(elemento("p", "No se pudo conectar con Novalis Aprende. Recarga la página para volver a intentarlo.", { role: "alert" }));
    return false;
  }
  if (!config.supabaseUrl || !config.supabaseKey || !window.supabase) {
    panel.append(elemento("p", "El acceso aún no está configurado. Contacta con el administrador.", { role: "alert" }));
    return false;
  }
  const cliente = window.supabase.createClient(config.supabaseUrl, config.supabaseKey, {
    global: { fetch: (url, opciones) => fetch(url, { ...opciones, signal: opciones?.signal || AbortSignal.timeout(15000) }) },
  });
  panel.hidden = false;
  const titulo = elemento("h2", "Bienvenido a Novalis Aprende");
  const estado = elemento("p", "", { role: "status", "aria-live": "polite" });
  panel.append(titulo, estado);
  const { data, error: errorSesion } = await cliente.auth.getSession();
  if (errorSesion) estado.textContent = "No se pudo recuperar la sesión. Vuelve a entrar.";
  const usuario = data?.session?.user;
  const recuperando = new URLSearchParams(location.search).has("recuperar");
  if (usuario && recuperando) {
    titulo.textContent = "Elige una nueva contraseña";
    const form = elemento("form", "", { class: "form-acceso" });
    const clave = elemento("input", "", { type: "password", autocomplete: "new-password", minlength: "12", required: "", "aria-label": "Nueva contraseña", placeholder: "Nueva contraseña (mínimo 12 caracteres)" });
    const confirmar = elemento("input", "", { type: "password", autocomplete: "new-password", required: "", "aria-label": "Repetir nueva contraseña", placeholder: "Repite la nueva contraseña" });
    const boton = elemento("button", "Guardar contraseña", { class: "boton", type: "submit" });
    form.append(clave, confirmar, boton); panel.append(form);
    form.onsubmit = async (e) => {
      e.preventDefault();
      if (clave.value !== confirmar.value) { estado.textContent = "Las contraseñas no coinciden."; return; }
      boton.disabled = true;
      try {
        const { error } = await cliente.auth.updateUser({ password: clave.value });
        if (error) throw error;
        location.replace(location.origin + location.pathname);
      } catch { estado.textContent = "No se pudo actualizar la contraseña. Solicita un enlace nuevo e inténtalo de nuevo."; }
      finally { boton.disabled = false; }
    };
    return false;
  }
  if (!usuario) {
    estado.textContent = "Entra con tu correo y contraseña para acceder a tu formación y compartir tus avances entre dispositivos.";
    const modos = elemento("div", "", { class: "fila modos-acceso" });
    const contenido = elemento("div");
    const login = elemento("button", "Iniciar sesión", { type: "button", class: "boton" });
    const registro = elemento("button", "Crear cuenta", { type: "button", class: "boton secundario" });
    modos.append(login, registro); panel.append(modos, contenido);
    function formulario(modo) {
      const alta = modo === "registro", recuperar = modo === "recuperar";
      login.setAttribute("aria-pressed", String(!alta)); registro.setAttribute("aria-pressed", String(alta));
      const form = elemento("form", "", { class: "form-acceso" });
      const correo = elemento("input", "", { type: "email", autocomplete: "email", required: "", placeholder: "Tu correo electrónico", "aria-label": "Correo electrónico" });
      const clave = elemento("input", "", { type: "password", autocomplete: alta ? "new-password" : "current-password", required: "", "aria-label": "Contraseña", placeholder: alta ? "Contraseña (mínimo 12 caracteres)" : "Tu contraseña" });
      if (alta) clave.setAttribute("minlength", "12");
      const repetir = elemento("input", "", { type: "password", autocomplete: "new-password", required: "", "aria-label": "Repetir contraseña", placeholder: "Repite tu contraseña" });
      const entrar = elemento("button", recuperar ? "Enviar enlace de recuperación" : alta ? "Crear mi cuenta" : "Entrar", { class: "boton", type: "submit" });
      const olvide = elemento("button", "He olvidado mi contraseña", { class: "enlace", type: "button" });
      olvide.onclick = () => formulario("recuperar");
      form.append(correo);
      if (!recuperar) form.append(clave);
      if (alta) form.append(repetir, elemento("p", "Solo puedes registrarte si el administrador ha autorizado antes tu correo. Usa al menos 12 caracteres y confirma el correo para activar la cuenta.", { class: "ayuda-acceso" }));
      form.append(entrar);
      if (!alta && !recuperar) form.append(olvide);
      form.onsubmit = async (e) => {
        e.preventDefault();
        if (alta && clave.value !== repetir.value) { estado.textContent = "Las contraseñas no coinciden."; return; }
        entrar.disabled = true;
        try {
          let resultado;
          if (recuperar) resultado = await cliente.auth.resetPasswordForEmail(correo.value.trim(), { redirectTo: location.origin + location.pathname + "?recuperar=1" });
          else if (alta) resultado = await cliente.auth.signUp({ email: correo.value.trim(), password: clave.value, options: { emailRedirectTo: location.origin + location.pathname } });
          else resultado = await cliente.auth.signInWithPassword({ email: correo.value.trim(), password: clave.value });
          if (resultado.error) throw resultado.error;
          clave.value = ""; repetir.value = "";
          if (recuperar) estado.textContent = "Si existe una cuenta con ese correo, recibirás un enlace para recuperar la contraseña.";
          else if (alta && !resultado.data?.session) estado.textContent = "Revisa tu correo y confirma la cuenta antes de iniciar sesión. Si ya tienes cuenta, entra o recupera tu contraseña.";
          else location.reload();
        } catch (error) {
          estado.textContent = error.code === "email_not_confirmed" ? "Confirma primero tu correo electrónico." : error.code === "over_email_send_rate_limit" ? "Espera unos minutos antes de solicitar otro correo." : alta ? "No se pudo crear la cuenta. Comprueba que el administrador haya autorizado tu correo y usa al menos 12 caracteres en la contraseña." : recuperar ? "No se pudo enviar el enlace. Inténtalo más tarde." : "No se pudo entrar. Comprueba el correo y la contraseña.";
        } finally { entrar.disabled = false; }
      };
      contenido.replaceChildren(form);
    }
    login.onclick = () => formulario("login"); registro.onclick = () => formulario("registro"); formulario("login");
    cliente.auth.onAuthStateChange((evento, sesion) => {
      if (evento === "SIGNED_IN" && sesion) location.reload();
    });
    return false;
  }

  async function validarServidor() {
    const { data } = await cliente.auth.getSession();
    if (!data?.session?.access_token) throw new Error("La sesión ha caducado. Vuelve a entrar.");
    const respuesta = await fetch("/api/sesion", { method: "POST", headers: { Authorization: `Bearer ${data.session.access_token}` } });
    const datos = await respuesta.json();
    if (!respuesta.ok) throw new Error(datos.error || "No se pudo comprobar tu cuenta.");
    window.novalisPerfil = datos.perfil;
    return datos.perfil;
  }
  try { await validarServidor(); }
  catch (error) {
    estado.textContent = error.message;
    const salir = elemento("button", "Salir y volver al acceso", { class: "boton secundario", type: "button" });
    salir.onclick = async () => { await fetch("/api/sesion", { method: "DELETE" }); await cliente.auth.signOut(); location.reload(); };
    panel.append(salir); return false;
  }
  window.novalisToken = async () => (await cliente.auth.getSession()).data.session?.access_token || "";
  document.body?.classList.remove("sin-sesion");
  titulo.textContent = "Tu cuenta de Novalis Aprende";

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
    await fetch("/api/sesion", { method: "DELETE" });
    location.reload();
  };
  window.addEventListener("online", sincronizar);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) sincronizar(); });
  cliente.auth.onAuthStateChange((evento) => {
    if (evento === "SIGNED_OUT") {
      window.novalisAutorizado = false;
      document.body?.classList.add("sin-sesion");
      document.getElementById("vista")?.replaceChildren();
      fetch("/api/sesion", { method: "DELETE" }).finally(() => location.reload());
    }
    if (evento === "TOKEN_REFRESHED") queueMicrotask(() => validarServidor().catch(() => location.reload()));
  });
  await sincronizar();
  return true;
}
