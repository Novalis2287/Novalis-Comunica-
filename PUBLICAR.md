# Publicar Novalis Aprende

La aplicación está preparada para usar Supabase como cuenta y base de datos y
Render como alojamiento del servidor web. No hay ninguna cuenta ni proyecto externo
creado por esta entrega. Hace falta configurar ambos servicios para obtener la URL pública.

## 1. Crear el proyecto de Supabase

1. Abre https://supabase.com/dashboard y pulsa **New project**.
2. Elige tu organización, llama al proyecto **Novalis Aprende**, establece una
   contraseña de base de datos y elige una región europea. Guarda esa contraseña
   en tu gestor de contraseñas; no hace falta compartirla.
3. En **SQL Editor**, abre una consulta nueva, pega el contenido de
   `supabase/migrations/202611140001_progreso.sql` y ejecútalo una vez.
4. Busca en la configuración o en el diálogo **Connect** la **Project URL** y
   la **Publishable key** (en proyectos antiguos, la clave **anon**).
   Son los valores de `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY`.
   No uses la clave **secret** ni **service_role** en esta aplicación.

La tabla aplica seguridad por fila: cada usuario autenticado accede a sus propios
datos. La función de guardado comprueba la revisión para detectar cambios simultáneos.

## 2. Publicar el servidor

1. Sube esta versión del código a tu repositorio de GitHub.
2. En https://dashboard.render.com, conecta GitHub y crea un **Blueprint**
   seleccionando el repositorio. Render leerá `render.yaml`. También puedes crear
   un **Web Service** Node con `npm ci` para construir y `npm start` para arrancar.
3. Configura `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY` con los valores del paso 1.
4. El profesor web utiliza un modelo local mediante WebLLM. No configures ninguna clave de IA. Cada dispositivo descarga el modelo desde la sección Profesor; consulta los requisitos y las limitaciones de la prueba en README.md.
5. Ejecuta las tres migraciones y configura el administrador siguiendo README.md.
6. Espera a que Render te dé una dirección `https://...onrender.com`.

El Blueprint selecciona el plan Free para una primera prueba. Este plan se duerme
tras 15 minutos sin tráfico y puede tardar aproximadamente un minuto en volver a
arrancar. Revisa los límites y precios antes de pasar a uso habitual:
https://render.com/docs/free. No guarda el progreso en disco: este se almacena en Supabase.

## 3. Activar el acceso por correo

1. En Supabase, **Authentication > URL Configuration**, configura como **Site URL**
   la dirección de Render y añádela a las direcciones de redirección permitidas.
2. Habilita el proveedor de correo electrónico y el registro de usuarios si quieres
   permitir nuevas cuentas. Para una app privada puedes invitar usuarios desde el
   panel y desactivar los registros públicos.
3. El envío de prueba de Supabase tiene restricciones. Si el correo no llega a tu
   dirección, revisa los destinatarios permitidos y configura SMTP propio antes de
   utilizar la aplicación con más personas. Consulta:
   https://supabase.com/docs/guides/auth/auth-smtp.
4. Abre la web, pulsa **Crear cuenta**, introduce correo y contraseña y confirma
   el correo. Entra con el mismo correo y contraseña desde el móvil y el iPad.
5. Completa un test o registra una visita. Comprueba «Todo guardado en tu cuenta».
   En el otro dispositivo pulsa «Sincronizar ahora» y verifica el resultado.

En Safari puedes añadir la web a la pantalla de inicio desde **Compartir**.
La aplicación requiere conexión para cargar sus contenidos y usar la IA; no incluye
un modo completo sin conexión. Evita escribir nombres u otros datos identificativos
de pacientes en las notas libres.

## Comprobación antes de darla por publicada

- Inicio de sesión real por correo en móvil y iPad.
- Sincronización real de visitas y notas, incluido borrado de visitas.
- Una segunda cuenta no puede leer ni modificar los datos de la primera.
- Conflicto resuelto al cambiar la misma sección desde dos dispositivos.
- El profesor responde y corrige con una clave y un modelo válidos.

Las pruebas locales no sustituyen estas comprobaciones contra tu proyecto real.
