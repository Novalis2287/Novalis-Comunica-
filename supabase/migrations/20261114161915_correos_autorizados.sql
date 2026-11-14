begin;
create table public.correos_autorizados (
  email text primary key check(email=lower(trim(email)) and length(email)<=254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  autorizado_por uuid references auth.users(id) on delete set null default auth.uid(),
  autorizado_el timestamptz not null default now()
);
alter table public.correos_autorizados enable row level security;
revoke all on public.correos_autorizados from public, anon, authenticated;
grant select, insert, delete on public.correos_autorizados to authenticated;
create policy "Administrador consulta autorizaciones" on public.correos_autorizados for select to authenticated
using ((select private.es_administrador()));
create policy "Administrador autoriza correos" on public.correos_autorizados for insert to authenticated
with check ((select private.es_administrador()) and autorizado_por=(select auth.uid()));
create policy "Administrador retira correos sin cuenta" on public.correos_autorizados for delete to authenticated
using ((select private.es_administrador()) and not exists(select 1 from public.perfiles p where p.email=correos_autorizados.email));

create or replace function private.crear_perfil() returns trigger
language plpgsql security definer set search_path = '' as $$
declare correo text := lower(coalesce(new.email,'')); es_admin boolean;
begin
  es_admin := coalesce(correo=(select email_admin from private.ajustes_acceso where unico),false);
  if not es_admin and not exists(select 1 from public.correos_autorizados where email=correo) then
    raise exception 'El administrador debe autorizar este correo antes del registro' using errcode='42501';
  end if;
  insert into public.perfiles(id,email,rol) values(new.id,correo,case when es_admin then 'admin' else 'usuario' end);
  return new;
end;
$$;
revoke all on function private.crear_perfil() from public, anon, authenticated;
commit;
