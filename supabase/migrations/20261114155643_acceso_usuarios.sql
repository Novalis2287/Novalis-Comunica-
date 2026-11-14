begin;
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
create table private.ajustes_acceso (
  unico boolean primary key default true check(unico),
  email_admin text not null default ''
);
alter table private.ajustes_acceso enable row level security;
revoke all on private.ajustes_acceso from public, anon, authenticated;
insert into private.ajustes_acceso(unico) values(true);

create table public.perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  rol text not null default 'usuario' check (rol in ('usuario','admin')),
  activo boolean not null default true,
  creado timestamptz not null default now()
);
alter table public.perfiles enable row level security;
revoke all on public.perfiles from public, anon, authenticated;
grant select on public.perfiles to authenticated;
grant update (activo) on public.perfiles to authenticated;

-- Funciones internas: no reciben un usuario arbitrario y no exponen datos.
-- SECURITY DEFINER evita recursión al consultar los perfiles desde sus propias políticas.
create function private.es_administrador() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.perfiles where id = (select auth.uid()) and rol='admin' and activo);
$$;
create function private.cuenta_activa() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.perfiles where id = (select auth.uid()) and activo);
$$;
revoke all on function private.es_administrador(), private.cuenta_activa() from public, anon;
grant execute on function private.es_administrador(), private.cuenta_activa() to authenticated;

create policy "Cuenta propia o administrador" on public.perfiles for select to authenticated
using (id = (select auth.uid()) or (select private.es_administrador()));
create policy "Administrador gestiona acceso" on public.perfiles for update to authenticated
using ((select private.es_administrador()) and rol='usuario' and id <> (select auth.uid()))
with check ((select private.es_administrador()) and rol='usuario' and id <> (select auth.uid()));

create function private.crear_perfil() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.perfiles(id,email,rol)
  values(new.id, lower(coalesce(new.email,'')),
    case when lower(new.email)=(select email_admin from private.ajustes_acceso where unico) then 'admin' else 'usuario' end);
  return new;
end;
$$;
revoke all on function private.crear_perfil() from public, anon, authenticated;
create trigger novalis_crear_perfil after insert on auth.users
for each row execute function private.crear_perfil();

-- También se incorporan cuentas creadas antes de instalar el acceso.
insert into public.perfiles(id,email,rol)
select id, lower(coalesce(email,'')),
case when lower(email)=(select email_admin from private.ajustes_acceso where unico) then 'admin' else 'usuario' end
from auth.users on conflict(id) do nothing;

drop policy "Leer datos propios" on public.progreso;
drop policy "Insertar datos propios" on public.progreso;
drop policy "Actualizar datos propios" on public.progreso;
create policy "Leer datos propios" on public.progreso for select to authenticated
using ((select auth.uid())=user_id and (select private.cuenta_activa()));
create policy "Insertar datos propios" on public.progreso for insert to authenticated
with check ((select auth.uid())=user_id and (select private.cuenta_activa()));
create policy "Actualizar datos propios" on public.progreso for update to authenticated
using ((select auth.uid())=user_id and (select private.cuenta_activa()))
with check ((select auth.uid())=user_id and (select private.cuenta_activa()));
commit;
