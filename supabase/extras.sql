-- Weekly "extras" page: spare meals sold at /extras for Stoke delivery.
-- Service-role only (RLS on, no policies), like trade_enquiries.

create table if not exists extras_drops (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Extra meals',
  note text,
  active boolean not null default true,
  delivery_fee numeric(6,2) not null default 2.99,
  created_at timestamptz not null default now()
);

create table if not exists extras_items (
  id uuid primary key default gen_random_uuid(),
  drop_id uuid not null references extras_drops(id) on delete cascade,
  menu_item_id uuid,
  name text not null,
  price numeric(6,2) not null default 6.40,
  qty_total integer not null default 0 check (qty_total >= 0),
  sort integer not null default 0
);
create index if not exists extras_items_drop_idx on extras_items(drop_id);

create table if not exists extras_orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigint generated always as identity,
  drop_id uuid not null references extras_drops(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','paid','expired')),
  full_name text not null,
  email text not null,
  phone text not null,
  house text not null,
  street text,
  postcode text not null,
  notes text,
  items jsonb not null default '[]'::jsonb,
  subtotal numeric(8,2) not null default 0,
  delivery_fee numeric(6,2) not null default 0,
  total numeric(8,2) not null default 0,
  stripe_session_id text unique,
  reserved_until timestamptz not null default (now() + interval '35 minutes'),
  is_new_customer boolean not null default true,
  delivered boolean not null default false,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists extras_orders_drop_idx on extras_orders(drop_id);

create table if not exists extras_order_lines (
  order_id uuid not null references extras_orders(id) on delete cascade,
  item_id uuid not null references extras_items(id) on delete cascade,
  qty integer not null check (qty > 0),
  primary key (order_id, item_id)
);

alter table extras_drops enable row level security;
alter table extras_items enable row level security;
alter table extras_orders enable row level security;
alter table extras_order_lines enable row level security;

-- Units taken per item: paid orders, plus pending ones whose 35-minute hold
-- hasn't run out. Abandoned checkouts free their stock automatically.
create or replace function extras_available(p_drop uuid)
returns table(item_id uuid, available integer)
language sql stable as $$
  select i.id,
         greatest(0, i.qty_total - coalesce((
           select sum(l.qty)::int
           from extras_order_lines l
           join extras_orders o on o.id = l.order_id
           where l.item_id = i.id
             and (o.status = 'paid' or (o.status = 'pending' and o.reserved_until > now()))
         ), 0))
  from extras_items i
  where i.drop_id = p_drop;
$$;

-- Reserves stock and creates the pending order in one locked step, so two
-- people can never buy the last portion at the same time.
-- p_lines: [{"item_id": "...", "qty": 2}, ...]
create or replace function extras_reserve_order(
  p_drop uuid, p_lines jsonb,
  p_name text, p_email text, p_phone text, p_house text, p_street text,
  p_postcode text, p_notes text, p_is_new boolean
) returns uuid
language plpgsql as $$
declare
  v_order uuid;
  v_fee numeric(6,2);
  v_subtotal numeric(8,2) := 0;
  v_items jsonb := '[]'::jsonb;
  r record;
  v_avail integer;
begin
  select delivery_fee into v_fee from extras_drops where id = p_drop and active;
  if v_fee is null then raise exception 'closed'; end if;

  -- lock this drop's items for the rest of the transaction
  perform 1 from extras_items where drop_id = p_drop for update;

  insert into extras_orders (drop_id, full_name, email, phone, house, street, postcode, notes, is_new_customer, delivery_fee)
  values (p_drop, p_name, p_email, p_phone, p_house, p_street, p_postcode, p_notes, p_is_new, v_fee)
  returning id into v_order;

  for r in
    select (x->>'item_id')::uuid as item_id, (x->>'qty')::int as qty
    from jsonb_array_elements(p_lines) x
  loop
    if r.qty <= 0 then continue; end if;
    select a.available into v_avail from extras_available(p_drop) a where a.item_id = r.item_id;
    if v_avail is null then raise exception 'unknown_item'; end if;
    if v_avail < r.qty then
      raise exception 'sold_out:%', (select name from extras_items where id = r.item_id);
    end if;
    insert into extras_order_lines (order_id, item_id, qty) values (v_order, r.item_id, r.qty);
    v_subtotal := v_subtotal + r.qty * (select price from extras_items where id = r.item_id);
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'qty', r.qty,
      'name', (select name from extras_items where id = r.item_id),
      'price', (select price from extras_items where id = r.item_id)
    ));
  end loop;

  if jsonb_array_length(v_items) = 0 then raise exception 'empty'; end if;

  update extras_orders
     set items = v_items, subtotal = v_subtotal, total = v_subtotal + v_fee
   where id = v_order;
  return v_order;
end;
$$;

-- Private link: /extras/<share_token>. A new drop gets a new token, so last
-- week's link stops working.
alter table extras_drops add column if not exists share_token text unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
update extras_drops set share_token = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') where share_token is null;
alter table extras_drops alter column share_token set not null;

-- Cash orders added by hand: counted as sold stock straight away, but money
-- only counts as taken once cash_collected is ticked.
alter table extras_orders add column if not exists cash boolean not null default false;
alter table extras_orders add column if not exists cash_collected boolean not null default false;

-- Items added to a hand-made order only (e.g. a spare from the shop): kept for
-- stock and order records but not shown on the public page.
alter table extras_items add column if not exists hidden boolean not null default false;

-- Creators we send free meals to (names only).
create table if not exists creators (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);
alter table creators enable row level security;

-- Creators tracking: when meals were last sent (3-month cycle) and whether they posted.
alter table creators add column if not exists last_sent_date date;
alter table creators add column if not exists story_posted boolean not null default false;
alter table creators add column if not exists video_posted boolean not null default false;
