-- Ejecutar una vez en el editor SQL de Supabase.
create table public.progreso (
  user_id uuid not null references auth.users(id) on delete cascade,
  clave text not null check (clave in ('visitas','resultados','valoracion','caso','visita-borrador')),
  valor jsonb not null,
  revision bigint not null default 1,
  primary key (user_id, clave)
);
alter table public.progreso enable row level security;
revoke all on public.progreso from anon;
grant select, insert, update on public.progreso to authenticated;
create policy "Leer datos propios" on public.progreso for select to authenticated
using ((select auth.uid()) = user_id);
create policy "Insertar datos propios" on public.progreso for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy "Actualizar datos propios" on public.progreso for update to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Comparación atómica: un dispositivo desactualizado no pisa los cambios de otro.
create function public.guardar_progreso(p_clave text, p_valor jsonb, p_revision bigint)
returns bigint language plpgsql security invoker set search_path = '' as $$
declare nueva bigint;
begin
  if auth.uid() is null then raise exception 'Sesión necesaria'; end if;
  insert into public.progreso (user_id, clave, valor, revision)
  select auth.uid(), p_clave, p_valor, 1 where p_revision = 0
  on conflict do nothing returning revision into nueva;
  if nueva is not null then return nueva; end if;
  update public.progreso set valor = p_valor, revision = revision + 1
  where user_id = auth.uid() and clave = p_clave and revision = p_revision
  returning revision into nueva;
  return nueva;
end;
$$;
revoke all on function public.guardar_progreso(text,jsonb,bigint) from public, anon;
grant execute on function public.guardar_progreso(text,jsonb,bigint) to authenticated;
