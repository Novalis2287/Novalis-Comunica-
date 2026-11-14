export async function vistaAdministracion({ apiJson, h }) {
  const contenido = h("div", { class: "panel-admin" });
  const aviso = h("p", { role: "status", "aria-live": "polite" });
  let pagina = 0;
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
  await cargar();
  return [h("h1", {}, "Administración"), h("p", { class: "entrada" }, "Gestiona quién puede acceder a Novalis Aprende. Las cuentas nuevas se activan al confirmar el correo."), aviso, contenido];
}
