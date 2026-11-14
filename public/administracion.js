export async function vistaAdministracion({ apiJson, h }) {
  const contenido = h("div", { class: "panel-admin" });
  const aviso = h("p", { role: "status", "aria-live": "polite" });
  let pagina = 0;
  let paginaCorreos = 0;
  const autorizados = h("div", { class: "panel-admin" });
  async function cargarCorreos() {
    const datos = await apiJson(`/api/admin/correos?pagina=${paginaCorreos}`);
    const ir = async (n) => { paginaCorreos = n; try { await cargarCorreos(); } catch (error) { aviso.textContent = error.message; } };
    const lista = h("ul", { class: "usuarios-admin" }, datos.correos.map((c) => {
      const retirar = h("button", { type: "button", class: "boton secundario", disabled: c.registrado, onclick: async () => {
        retirar.disabled = true;
        try {
          await apiJson(`/api/admin/correos/${encodeURIComponent(c.email)}`, { method: "DELETE" });
          aviso.textContent = "Autorización retirada. Este correo ya no puede crear una cuenta.";
          await cargarCorreos();
        } catch (error) { aviso.textContent = error.message; retirar.disabled = false; }
      } }, c.registrado ? "Cuenta ya creada" : "Retirar autorización");
      return h("li", {}, h("strong", {}, c.email), h("span", { class: "chip gris" }, c.registrado ? "Registrado" : "Pendiente de registrarse"), retirar);
    }));
    autorizados.replaceChildren(h("p", {}, `${datos.total} correos autorizados`), lista,
      h("div", { class: "fila" }, h("button", { class: "boton secundario", disabled: paginaCorreos === 0, onclick: () => ir(paginaCorreos - 1) }, "Correos anteriores"),
        h("button", { class: "boton secundario", disabled: (paginaCorreos + 1) * 50 >= datos.total, onclick: () => ir(paginaCorreos + 1) }, "Más correos")));
  }
  const email = h("input", { type: "email", required: true, autocomplete: "off", maxlength: "254", placeholder: "Correo que quieres autorizar", "aria-label": "Correo que quieres autorizar" });
  const permitir = h("button", { type: "submit", class: "boton" }, "Autorizar correo");
  const form = h("form", { class: "form-cuenta", onsubmit: async (e) => {
    e.preventDefault(); permitir.disabled = true;
    try {
      await apiJson("/api/admin/correos", { method: "POST", body: JSON.stringify({ email: email.value.trim() }) });
      email.value = "";
      aviso.textContent = "Correo autorizado. Esa persona ya puede pulsar «Crear cuenta» y elegir su contraseña.";
      paginaCorreos = 0; await cargarCorreos();
    } catch (error) { aviso.textContent = error.message; }
    finally { permitir.disabled = false; }
  } }, email, permitir);
  async function cargar() {
    const datos = await apiJson(`/api/admin/usuarios?pagina=${pagina}`);
    const buscar = h("input", { type: "search", placeholder: "Filtrar esta página por correo…", "aria-label": "Filtrar usuarios" });
    const lista = h("ul", { class: "usuarios-admin" });
    const pintar = () => {
      const filtro = buscar.value?.trim().toLowerCase() || "";
      lista.replaceChildren(...datos.usuarios.filter((u) => u.email.toLowerCase().includes(filtro)).map((u) => {
        const cambiar = h("button", { class: "boton secundario", type: "button", disabled: u.rol === "admin", onclick: async () => {
          cambiar.disabled = true;
          try {
            await apiJson(`/api/admin/usuarios/${u.id}`, { method: "PATCH", body: JSON.stringify({ activo: !u.activo }) });
            aviso.textContent = u.activo ? "Cuenta desactivada. Se ha bloqueado el acceso a sus contenidos y progreso en la nube." : "Cuenta activada.";
            await cargar();
          } catch (error) { aviso.textContent = error.message; cambiar.disabled = false; }
        } }, u.rol === "admin" ? "Administrador" : u.activo ? "Desactivar acceso" : "Activar acceso");
        return h("li", {}, h("strong", {}, u.email), h("div", { class: "datos" },
          h("span", { class: `chip ${u.activo ? "bien" : "mal"}` }, u.activo ? "Activa" : "Desactivada"),
          h("span", { class: "chip gris" }, u.rol === "admin" ? "Administrador" : "Usuario")), cambiar);
      }));
      if (!lista.children.length) lista.append(h("li", {}, "No hay usuarios que coincidan."));
    };
    buscar.oninput = pintar;
    pintar();
    const navegar = async (n) => { pagina = n; try { await cargar(); } catch (error) { aviso.textContent = error.message; } };
    contenido.replaceChildren(h("p", {}, `${datos.total} cuentas registradas · Página ${pagina + 1}`), buscar, lista,
      h("div", { class: "fila" }, h("button", { class: "boton secundario", disabled: pagina === 0, onclick: () => navegar(pagina - 1) }, "Anterior"),
        h("button", { class: "boton secundario", disabled: (pagina + 1) * 50 >= datos.total, onclick: () => navegar(pagina + 1) }, "Siguiente")));
  }
  await Promise.all([cargar(), cargarCorreos()]);
  return [h("h1", {}, "Ajustes"), h("h2", {}, "Usuarios y permisos"),
    h("p", { class: "entrada" }, "Autoriza primero el correo de cada persona. Después podrá crear su cuenta y elegir una contraseña. Las cuentas registradas se pueden activar o desactivar desde aquí."),
    aviso, h("h2", {}, "Autorizar un correo"), form, autorizados, h("h2", {}, "Cuentas registradas"), contenido];
}
