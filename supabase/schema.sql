-- Cola isto no SQL Editor do Supabase e carrega em RUN.
create table if not exists family_state (
  id text primary key,
  state jsonb not null,
  rev int not null default 0,
  updated_at timestamptz not null default now()
);
alter table family_state enable row level security;   -- sem políticas: só se acede pelas funções abaixo

create or replace function get_state(fid text)
returns table(state jsonb, rev int) language sql security definer set search_path = public as $$
  select f.state, f.rev from family_state f where f.id = fid;
$$;

create or replace function set_state(fid text, new_state jsonb, expected_rev int)
returns table(ok boolean, state jsonb, rev int) language plpgsql security definer set search_path = public as $$
declare cur family_state%rowtype;
begin
  if length(fid) < 24 then raise exception 'codigo invalido'; end if;
  select * into cur from family_state where id = fid for update;
  if not found then
    insert into family_state(id, state, rev) values (fid, new_state, 1);
    return query select true, new_state, 1;
  elsif cur.rev = expected_rev then
    update family_state set state = new_state, rev = cur.rev + 1, updated_at = now() where id = fid;
    return query select true, new_state, cur.rev + 1;
  else
    return query select false, cur.state, cur.rev;
  end if;
end $$;

grant execute on function get_state(text) to anon;
grant execute on function set_state(text, jsonb, int) to anon;

-- Receitas do livro (ficam privadas na tua base de dados, nunca no GitHub)
create table if not exists family_book (id text primary key, book jsonb not null);
alter table family_book enable row level security;
create or replace function get_book(fid text) returns table(book jsonb) language sql security definer set search_path = public as $$
  select b.book from family_book b where b.id = fid;
$$;
create or replace function set_book(fid text, new_book jsonb) returns void language plpgsql security definer set search_path = public as $$
begin
  if length(fid) < 24 then raise exception 'codigo invalido'; end if;
  insert into family_book(id, book) values (fid, new_book) on conflict (id) do update set book = excluded.book;
end $$;
grant execute on function get_book(text) to anon;
grant execute on function set_book(text, jsonb) to anon;
