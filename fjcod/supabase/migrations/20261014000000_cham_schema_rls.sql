-- CHAM initial Supabase schema and deny-by-default RLS baseline.
-- Schema-only: no seed rows, browser-data import, checkout/refund RPCs, or live migration.
-- FJCOD platform operators are separate from store memberships and receive no standing
-- access to store data in this migration. See ../../docs/security/SUPABASE_RLS_PLAN.md.
-- Apply only to a reviewed, disposable/staging project after backup and owner approval.

CREATE SCHEMA cham_private;
REVOKE ALL ON SCHEMA cham_private FROM PUBLIC, anon, authenticated;
-- RLS expressions need to call the narrowly-scoped helper functions in this unexposed schema.
GRANT USAGE ON SCHEMA cham_private TO authenticated;

CREATE TABLE public.cham_stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.cham_memberships (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  store_id uuid NOT NULL REFERENCES public.cham_stores(id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN ('store_owner', 'manager', 'deputy', 'cashier', 'consultant')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, store_id)
);

CREATE TABLE public.cham_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.cham_stores(id) ON DELETE RESTRICT,
  sku text NOT NULL CHECK (length(btrim(sku)) > 0),
  barcode text NOT NULL DEFAULT '',
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  category text NOT NULL DEFAULT '',
  price_toman bigint NOT NULL CHECK (price_toman >= 0),
  cost_toman bigint NOT NULL CHECK (cost_toman >= 0),
  stock numeric(18,3) NOT NULL DEFAULT 0 CHECK (stock >= 0),
  min_stock numeric(18,3) NOT NULL DEFAULT 0 CHECK (min_stock >= 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, store_id),
  UNIQUE (store_id, sku)
);
CREATE UNIQUE INDEX cham_products_store_barcode_unique
  ON public.cham_products (store_id, barcode)
  WHERE barcode <> '';

CREATE TABLE public.cham_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.cham_stores(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  phone text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  points bigint NOT NULL DEFAULT 0 CHECK (points >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_contact_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, store_id)
);
CREATE INDEX cham_customers_store_name_idx ON public.cham_customers (store_id, name);

CREATE TABLE public.cham_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.cham_stores(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  opening_cash_toman bigint NOT NULL DEFAULT 0 CHECK (opening_cash_toman >= 0),
  closed_at timestamptz,
  counted_cash_toman bigint CHECK (counted_cash_toman IS NULL OR counted_cash_toman >= 0),
  expected_cash_toman bigint CHECK (expected_cash_toman IS NULL OR expected_cash_toman >= 0),
  note text NOT NULL DEFAULT '',
  CHECK (closed_at IS NULL OR closed_at >= opened_at),
  CHECK (closed_at IS NULL OR (counted_cash_toman IS NOT NULL AND expected_cash_toman IS NOT NULL)),
  UNIQUE (id, store_id),
  FOREIGN KEY (user_id, store_id)
    REFERENCES public.cham_memberships (user_id, store_id) ON DELETE RESTRICT
);
CREATE INDEX cham_shifts_store_opened_idx ON public.cham_shifts (store_id, opened_at DESC);

CREATE TABLE public.cham_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.cham_stores(id) ON DELETE RESTRICT,
  number bigint NOT NULL CHECK (number > 0),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  cashier_user_id uuid NOT NULL,
  consultant_user_id uuid,
  customer_id uuid,
  shift_id uuid,
  subtotal_toman bigint NOT NULL CHECK (subtotal_toman >= 0),
  discount_toman bigint NOT NULL DEFAULT 0 CHECK (discount_toman >= 0),
  points_redeemed bigint NOT NULL DEFAULT 0 CHECK (points_redeemed >= 0),
  points_value_toman bigint NOT NULL DEFAULT 0 CHECK (points_value_toman >= 0),
  tax_toman bigint NOT NULL DEFAULT 0 CHECK (tax_toman >= 0),
  total_toman bigint NOT NULL CHECK (total_toman >= 0),
  points_earned bigint NOT NULL DEFAULT 0 CHECK (points_earned >= 0),
  idempotency_key uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, store_id),
  UNIQUE (store_id, number),
  UNIQUE (store_id, idempotency_key),
  FOREIGN KEY (cashier_user_id, store_id)
    REFERENCES public.cham_memberships (user_id, store_id) ON DELETE RESTRICT,
  FOREIGN KEY (consultant_user_id, store_id)
    REFERENCES public.cham_memberships (user_id, store_id) ON DELETE RESTRICT,
  FOREIGN KEY (customer_id, store_id)
    REFERENCES public.cham_customers (id, store_id) ON DELETE RESTRICT,
  FOREIGN KEY (shift_id, store_id)
    REFERENCES public.cham_shifts (id, store_id) ON DELETE RESTRICT
);
CREATE INDEX cham_sales_store_time_idx ON public.cham_sales (store_id, occurred_at DESC);
CREATE INDEX cham_sales_cashier_time_idx ON public.cham_sales (store_id, cashier_user_id, occurred_at DESC);
CREATE INDEX cham_sales_consultant_time_idx ON public.cham_sales (store_id, consultant_user_id, occurred_at DESC);

CREATE TABLE public.cham_sale_items (
  store_id uuid NOT NULL,
  sale_id uuid NOT NULL,
  line_no integer NOT NULL CHECK (line_no >= 0),
  product_id uuid NOT NULL,
  product_name_snapshot text NOT NULL,
  quantity numeric(18,3) NOT NULL CHECK (quantity > 0),
  unit_price_toman bigint NOT NULL CHECK (unit_price_toman >= 0),
  unit_cost_toman bigint NOT NULL CHECK (unit_cost_toman >= 0),
  line_total_toman bigint NOT NULL CHECK (line_total_toman >= 0),
  PRIMARY KEY (store_id, sale_id, line_no),
  FOREIGN KEY (sale_id, store_id)
    REFERENCES public.cham_sales (id, store_id) ON DELETE RESTRICT,
  FOREIGN KEY (product_id, store_id)
    REFERENCES public.cham_products (id, store_id) ON DELETE RESTRICT
);

CREATE TABLE public.cham_sale_payments (
  store_id uuid NOT NULL,
  sale_id uuid NOT NULL,
  line_no integer NOT NULL CHECK (line_no >= 0),
  method text NOT NULL CHECK (method IN ('cash', 'card', 'transfer', 'credit')),
  amount_toman bigint NOT NULL CHECK (amount_toman > 0),
  PRIMARY KEY (store_id, sale_id, line_no),
  FOREIGN KEY (sale_id, store_id)
    REFERENCES public.cham_sales (id, store_id) ON DELETE RESTRICT
);

CREATE TABLE public.cham_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.cham_stores(id) ON DELETE RESTRICT,
  sale_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  by_user_id uuid NOT NULL,
  amount_toman bigint NOT NULL CHECK (amount_toman > 0),
  reason text NOT NULL DEFAULT '',
  UNIQUE (id, store_id),
  FOREIGN KEY (sale_id, store_id)
    REFERENCES public.cham_sales (id, store_id) ON DELETE RESTRICT,
  FOREIGN KEY (by_user_id, store_id)
    REFERENCES public.cham_memberships (user_id, store_id) ON DELETE RESTRICT
);
CREATE INDEX cham_refunds_store_time_idx ON public.cham_refunds (store_id, occurred_at DESC);

CREATE TABLE public.cham_refund_items (
  store_id uuid NOT NULL,
  refund_id uuid NOT NULL,
  line_no integer NOT NULL CHECK (line_no >= 0),
  product_id uuid NOT NULL,
  quantity numeric(18,3) NOT NULL CHECK (quantity > 0),
  amount_toman bigint NOT NULL CHECK (amount_toman > 0),
  PRIMARY KEY (store_id, refund_id, line_no),
  FOREIGN KEY (refund_id, store_id)
    REFERENCES public.cham_refunds (id, store_id) ON DELETE RESTRICT,
  FOREIGN KEY (product_id, store_id)
    REFERENCES public.cham_products (id, store_id) ON DELETE RESTRICT
);

CREATE TABLE public.cham_held_carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.cham_stores(id) ON DELETE RESTRICT,
  created_by_user_id uuid NOT NULL,
  label text NOT NULL DEFAULT '',
  customer_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, store_id),
  FOREIGN KEY (created_by_user_id, store_id)
    REFERENCES public.cham_memberships (user_id, store_id) ON DELETE RESTRICT,
  FOREIGN KEY (customer_id, store_id)
    REFERENCES public.cham_customers (id, store_id) ON DELETE RESTRICT
);
CREATE INDEX cham_held_carts_store_created_idx ON public.cham_held_carts (store_id, created_at DESC);

CREATE TABLE public.cham_held_cart_items (
  store_id uuid NOT NULL,
  held_cart_id uuid NOT NULL,
  line_no integer NOT NULL CHECK (line_no >= 0),
  product_id uuid NOT NULL,
  quantity numeric(18,3) NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (store_id, held_cart_id, line_no),
  FOREIGN KEY (held_cart_id, store_id)
    REFERENCES public.cham_held_carts (id, store_id) ON DELETE RESTRICT,
  FOREIGN KEY (product_id, store_id)
    REFERENCES public.cham_products (id, store_id) ON DELETE RESTRICT
);

CREATE TABLE public.cham_stock_moves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.cham_stores(id) ON DELETE RESTRICT,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  product_id uuid NOT NULL,
  delta numeric(18,3) NOT NULL CHECK (delta <> 0),
  reason text NOT NULL CHECK (reason IN ('sale', 'refund', 'adjust', 'receive', 'initial')),
  by_user_id uuid NOT NULL,
  reference text NOT NULL DEFAULT '',
  UNIQUE (id, store_id),
  FOREIGN KEY (product_id, store_id)
    REFERENCES public.cham_products (id, store_id) ON DELETE RESTRICT,
  FOREIGN KEY (by_user_id, store_id)
    REFERENCES public.cham_memberships (user_id, store_id) ON DELETE RESTRICT
);
CREATE INDEX cham_stock_moves_store_time_idx ON public.cham_stock_moves (store_id, occurred_at DESC);

CREATE TABLE public.cham_store_settings (
  store_id uuid PRIMARY KEY REFERENCES public.cham_stores(id) ON DELETE RESTRICT,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(settings) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.cham_store_licenses (
  store_id uuid PRIMARY KEY REFERENCES public.cham_stores(id) ON DELETE RESTRICT,
  licensee text NOT NULL,
  vendor text NOT NULL,
  plan text NOT NULL CHECK (plan IN ('monthly', 'yearly')),
  started_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  grace_days integer NOT NULL DEFAULT 0 CHECK (grace_days >= 0),
  CHECK (expires_at > started_at)
);

CREATE TABLE public.cham_audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES public.cham_stores(id) ON DELETE RESTRICT,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (length(btrim(action)) > 0),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(detail) = 'object')
);
CREATE INDEX cham_audit_log_store_time_idx ON public.cham_audit_log (store_id, occurred_at DESC);

-- Platform identity is separate from store membership. This table is intentionally empty,
-- inaccessible to client roles, and is not consulted by any data-access policy in this migration.
-- A future, time-limited support-grant workflow needs its own reviewed migration and tests.
CREATE TABLE cham_private.cham_platform_operators (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE FUNCTION cham_private.cham_has_role(p_store_id uuid, p_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.cham_memberships AS m
    WHERE m.store_id = p_store_id
      AND m.user_id = (SELECT auth.uid())
      AND m.active
      AND m.role = ANY (p_roles)
  );
$function$;

CREATE FUNCTION cham_private.cham_can_read_sale(p_sale_id uuid, p_store_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.cham_sales AS s
    WHERE s.id = p_sale_id
      AND s.store_id = p_store_id
      AND (
        cham_private.cham_has_role(s.store_id, ARRAY['store_owner', 'manager', 'deputy'])
        OR (
          s.cashier_user_id = (SELECT auth.uid())
          AND cham_private.cham_has_role(s.store_id, ARRAY['cashier'])
        )
        OR (
          s.consultant_user_id = (SELECT auth.uid())
          AND cham_private.cham_has_role(s.store_id, ARRAY['consultant'])
        )
      )
  );
$function$;

CREATE FUNCTION cham_private.cham_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  NEW.updated_at := pg_catalog.now();
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION cham_private.cham_has_role(uuid, text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION cham_private.cham_can_read_sale(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION cham_private.cham_touch_updated_at() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION cham_private.cham_has_role(uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION cham_private.cham_can_read_sale(uuid, uuid) TO authenticated;

CREATE TRIGGER cham_products_touch_updated_at
  BEFORE UPDATE ON public.cham_products
  FOR EACH ROW EXECUTE FUNCTION cham_private.cham_touch_updated_at();
CREATE TRIGGER cham_customers_touch_updated_at
  BEFORE UPDATE ON public.cham_customers
  FOR EACH ROW EXECUTE FUNCTION cham_private.cham_touch_updated_at();
CREATE TRIGGER cham_held_carts_touch_updated_at
  BEFORE UPDATE ON public.cham_held_carts
  FOR EACH ROW EXECUTE FUNCTION cham_private.cham_touch_updated_at();
CREATE TRIGGER cham_store_settings_touch_updated_at
  BEFORE UPDATE ON public.cham_store_settings
  FOR EACH ROW EXECUTE FUNCTION cham_private.cham_touch_updated_at();

ALTER TABLE public.cham_stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cham_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cham_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cham_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cham_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cham_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cham_sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cham_sale_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cham_refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cham_refund_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cham_held_carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cham_held_cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cham_stock_moves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cham_store_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cham_store_licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cham_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE cham_private.cham_platform_operators ENABLE ROW LEVEL SECURITY;

-- Remove any default grants for browser roles; then grant only the needed columns/actions.
REVOKE ALL ON TABLE
  public.cham_stores,
  public.cham_memberships,
  public.cham_products,
  public.cham_customers,
  public.cham_shifts,
  public.cham_sales,
  public.cham_sale_items,
  public.cham_sale_payments,
  public.cham_refunds,
  public.cham_refund_items,
  public.cham_held_carts,
  public.cham_held_cart_items,
  public.cham_stock_moves,
  public.cham_store_settings,
  public.cham_store_licenses,
  public.cham_audit_log
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE cham_private.cham_platform_operators FROM PUBLIC, anon, authenticated;

-- Use column-level SELECT grants so a later-added private column is not exposed by default.
GRANT SELECT (id, name, created_at) ON TABLE public.cham_stores TO authenticated;
GRANT SELECT (user_id, store_id, role, active, created_at)
  ON TABLE public.cham_memberships TO authenticated;
GRANT SELECT (id, store_id, user_id, opened_at, opening_cash_toman, closed_at, counted_cash_toman, expected_cash_toman, note)
  ON TABLE public.cham_shifts TO authenticated;
GRANT SELECT (id, store_id, number, occurred_at, cashier_user_id, consultant_user_id, customer_id, shift_id,
              subtotal_toman, discount_toman, tax_toman, total_toman, created_at)
  ON TABLE public.cham_sales TO authenticated;
GRANT SELECT (store_id, sale_id, line_no, method, amount_toman)
  ON TABLE public.cham_sale_payments TO authenticated;
GRANT SELECT (id, store_id, sale_id, occurred_at, by_user_id, amount_toman, reason)
  ON TABLE public.cham_refunds TO authenticated;
GRANT SELECT (store_id, refund_id, line_no, product_id, quantity, amount_toman)
  ON TABLE public.cham_refund_items TO authenticated;
GRANT SELECT (id, store_id, occurred_at, product_id, delta, reason, by_user_id, reference)
  ON TABLE public.cham_stock_moves TO authenticated;
GRANT SELECT (store_id, licensee, vendor, plan, started_at, expires_at, grace_days)
  ON TABLE public.cham_store_licenses TO authenticated;
GRANT SELECT (id, store_id, occurred_at, actor_user_id, action, detail)
  ON TABLE public.cham_audit_log TO authenticated;

-- Hide product cost, loyalty balances, idempotency keys, and future columns from browser roles;
-- product stock cannot be changed directly.
GRANT SELECT (id, store_id, sku, barcode, name, category, price_toman, stock, min_stock, active, created_at, updated_at)
  ON TABLE public.cham_products TO authenticated;
GRANT INSERT (store_id, sku, barcode, name, category, price_toman, cost_toman, min_stock, active)
  ON TABLE public.cham_products TO authenticated;
GRANT UPDATE (sku, barcode, name, category, price_toman, cost_toman, min_stock, active)
  ON TABLE public.cham_products TO authenticated;

-- Expose only minimal customer fields; notes and loyalty balances need a separate approved API.
GRANT SELECT (id, store_id, name, phone, created_at, last_contact_at)
  ON TABLE public.cham_customers TO authenticated;
GRANT INSERT (store_id, name, phone)
  ON TABLE public.cham_customers TO authenticated;
GRANT UPDATE (name, phone)
  ON TABLE public.cham_customers TO authenticated;

GRANT SELECT (store_id, sale_id, line_no, product_id, product_name_snapshot, quantity, unit_price_toman, line_total_toman)
  ON TABLE public.cham_sale_items TO authenticated;
-- unit_cost_toman remains server-only; there are no direct sale/refund/payment write grants.

GRANT SELECT (id, store_id, created_by_user_id, label, customer_id, created_at, updated_at)
  ON TABLE public.cham_held_carts TO authenticated;
GRANT INSERT (store_id, created_by_user_id, label, customer_id)
  ON TABLE public.cham_held_carts TO authenticated;
GRANT UPDATE (label, customer_id)
  ON TABLE public.cham_held_carts TO authenticated;

GRANT SELECT (store_id, held_cart_id, line_no, product_id, quantity)
  ON TABLE public.cham_held_cart_items TO authenticated;
GRANT INSERT (store_id, held_cart_id, line_no, product_id, quantity)
  ON TABLE public.cham_held_cart_items TO authenticated;
GRANT UPDATE (product_id, quantity)
  ON TABLE public.cham_held_cart_items TO authenticated;

GRANT SELECT (store_id, settings), UPDATE (settings)
  ON TABLE public.cham_store_settings TO authenticated;

CREATE POLICY cham_stores_member_select ON public.cham_stores
  FOR SELECT TO authenticated
  USING (cham_private.cham_has_role(id, ARRAY['store_owner', 'manager', 'deputy', 'cashier', 'consultant']));

CREATE POLICY cham_memberships_self_or_manager_select ON public.cham_memberships
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR cham_private.cham_has_role(store_id, ARRAY['store_owner', 'manager'])
  );

CREATE POLICY cham_products_member_select ON public.cham_products
  FOR SELECT TO authenticated
  USING (cham_private.cham_has_role(store_id, ARRAY['store_owner', 'manager', 'deputy', 'cashier', 'consultant']));
CREATE POLICY cham_products_manager_insert ON public.cham_products
  FOR INSERT TO authenticated
  WITH CHECK (cham_private.cham_has_role(store_id, ARRAY['store_owner', 'manager', 'deputy']));
CREATE POLICY cham_products_manager_update ON public.cham_products
  FOR UPDATE TO authenticated
  USING (cham_private.cham_has_role(store_id, ARRAY['store_owner', 'manager', 'deputy']))
  WITH CHECK (cham_private.cham_has_role(store_id, ARRAY['store_owner', 'manager', 'deputy']));

-- Cashiers receive only the approved basic customer columns. Consultants receive no direct
-- customer-table access until a narrower privacy-reviewed lookup API is defined.
CREATE POLICY cham_customers_basic_staff_select ON public.cham_customers
  FOR SELECT TO authenticated
  USING (cham_private.cham_has_role(store_id, ARRAY['store_owner', 'manager', 'deputy', 'cashier']));
CREATE POLICY cham_customers_basic_staff_insert ON public.cham_customers
  FOR INSERT TO authenticated
  WITH CHECK (cham_private.cham_has_role(store_id, ARRAY['store_owner', 'manager', 'deputy', 'cashier']));
CREATE POLICY cham_customers_basic_staff_update ON public.cham_customers
  FOR UPDATE TO authenticated
  USING (cham_private.cham_has_role(store_id, ARRAY['store_owner', 'manager', 'deputy', 'cashier']))
  WITH CHECK (cham_private.cham_has_role(store_id, ARRAY['store_owner', 'manager', 'deputy', 'cashier']));

CREATE POLICY cham_sales_authorized_select ON public.cham_sales
  FOR SELECT TO authenticated
  USING (cham_private.cham_can_read_sale(id, store_id));
CREATE POLICY cham_sale_items_authorized_select ON public.cham_sale_items
  FOR SELECT TO authenticated
  USING (cham_private.cham_can_read_sale(sale_id, store_id));
CREATE POLICY cham_sale_payments_authorized_select ON public.cham_sale_payments
  FOR SELECT TO authenticated
  USING (cham_private.cham_can_read_sale(sale_id, store_id));

CREATE POLICY cham_refunds_manager_select ON public.cham_refunds
  FOR SELECT TO authenticated
  USING (cham_private.cham_has_role(store_id, ARRAY['store_owner', 'manager', 'deputy']));
CREATE POLICY cham_refund_items_manager_select ON public.cham_refund_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.cham_refunds AS r
      WHERE r.id = cham_refund_items.refund_id
        AND r.store_id = cham_refund_items.store_id
        AND cham_private.cham_has_role(r.store_id, ARRAY['store_owner', 'manager', 'deputy'])
    )
  );

CREATE POLICY cham_shifts_manager_or_self_select ON public.cham_shifts
  FOR SELECT TO authenticated
  USING (
    cham_private.cham_has_role(store_id, ARRAY['store_owner', 'manager', 'deputy'])
    OR (user_id = (SELECT auth.uid()) AND cham_private.cham_has_role(store_id, ARRAY['cashier']))
  );

CREATE POLICY cham_held_carts_member_select ON public.cham_held_carts
  FOR SELECT TO authenticated
  USING (
    cham_private.cham_has_role(store_id, ARRAY['store_owner', 'manager', 'deputy'])
    OR (
      created_by_user_id = (SELECT auth.uid())
      AND cham_private.cham_has_role(store_id, ARRAY['cashier', 'consultant'])
    )
  );
CREATE POLICY cham_held_carts_member_insert ON public.cham_held_carts
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by_user_id = (SELECT auth.uid())
    AND cham_private.cham_has_role(store_id, ARRAY['store_owner', 'manager', 'deputy', 'cashier', 'consultant'])
    AND (
      customer_id IS NULL
      OR cham_private.cham_has_role(store_id, ARRAY['store_owner', 'manager', 'deputy', 'cashier'])
    )
  );
CREATE POLICY cham_held_carts_member_update ON public.cham_held_carts
  FOR UPDATE TO authenticated
  USING (
    cham_private.cham_has_role(store_id, ARRAY['store_owner', 'manager', 'deputy'])
    OR (
      created_by_user_id = (SELECT auth.uid())
      AND cham_private.cham_has_role(store_id, ARRAY['cashier', 'consultant'])
    )
  )
  WITH CHECK (
    (
      cham_private.cham_has_role(store_id, ARRAY['store_owner', 'manager', 'deputy'])
      OR (
        created_by_user_id = (SELECT auth.uid())
        AND cham_private.cham_has_role(store_id, ARRAY['cashier', 'consultant'])
      )
    )
    AND (
      customer_id IS NULL
      OR cham_private.cham_has_role(store_id, ARRAY['store_owner', 'manager', 'deputy', 'cashier'])
    )
  );

CREATE POLICY cham_held_cart_items_member_select ON public.cham_held_cart_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.cham_held_carts AS c
      WHERE c.id = cham_held_cart_items.held_cart_id
        AND c.store_id = cham_held_cart_items.store_id
        AND (
          cham_private.cham_has_role(c.store_id, ARRAY['store_owner', 'manager', 'deputy'])
          OR (
            c.created_by_user_id = (SELECT auth.uid())
            AND cham_private.cham_has_role(c.store_id, ARRAY['cashier', 'consultant'])
          )
        )
    )
  );
CREATE POLICY cham_held_cart_items_member_insert ON public.cham_held_cart_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.cham_held_carts AS c
      WHERE c.id = cham_held_cart_items.held_cart_id
        AND c.store_id = cham_held_cart_items.store_id
        AND (
          cham_private.cham_has_role(c.store_id, ARRAY['store_owner', 'manager', 'deputy'])
          OR (
            c.created_by_user_id = (SELECT auth.uid())
            AND cham_private.cham_has_role(c.store_id, ARRAY['cashier', 'consultant'])
          )
        )
    )
  );
CREATE POLICY cham_held_cart_items_member_update ON public.cham_held_cart_items
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.cham_held_carts AS c
      WHERE c.id = cham_held_cart_items.held_cart_id
        AND c.store_id = cham_held_cart_items.store_id
        AND (
          cham_private.cham_has_role(c.store_id, ARRAY['store_owner', 'manager', 'deputy'])
          OR (
            c.created_by_user_id = (SELECT auth.uid())
            AND cham_private.cham_has_role(c.store_id, ARRAY['cashier', 'consultant'])
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.cham_held_carts AS c
      WHERE c.id = cham_held_cart_items.held_cart_id
        AND c.store_id = cham_held_cart_items.store_id
        AND (
          cham_private.cham_has_role(c.store_id, ARRAY['store_owner', 'manager', 'deputy'])
          OR (
            c.created_by_user_id = (SELECT auth.uid())
            AND cham_private.cham_has_role(c.store_id, ARRAY['cashier', 'consultant'])
          )
        )
    )
  );

CREATE POLICY cham_stock_moves_manager_select ON public.cham_stock_moves
  FOR SELECT TO authenticated
  USING (cham_private.cham_has_role(store_id, ARRAY['store_owner', 'manager', 'deputy']));

CREATE POLICY cham_store_settings_manager_select ON public.cham_store_settings
  FOR SELECT TO authenticated
  USING (cham_private.cham_has_role(store_id, ARRAY['store_owner', 'manager', 'deputy']));
CREATE POLICY cham_store_settings_manager_update ON public.cham_store_settings
  FOR UPDATE TO authenticated
  USING (cham_private.cham_has_role(store_id, ARRAY['store_owner', 'manager']))
  WITH CHECK (cham_private.cham_has_role(store_id, ARRAY['store_owner', 'manager']));

CREATE POLICY cham_store_licenses_store_owner_select ON public.cham_store_licenses
  FOR SELECT TO authenticated
  USING (cham_private.cham_has_role(store_id, ARRAY['store_owner']));

CREATE POLICY cham_audit_log_manager_select ON public.cham_audit_log
  FOR SELECT TO authenticated
  USING (cham_private.cham_has_role(store_id, ARRAY['store_owner', 'manager']));

-- No DELETE grants/policies are defined. Financial writes (checkout, refunds, payments,
-- stock moves, shifts and audit entries) remain denied until separately-reviewed RPCs exist.
COMMENT ON SCHEMA cham_private IS 'CHAM non-exposed helper/support schema; keep out of Supabase API exposed schemas.';
COMMENT ON COLUMN public.cham_memberships.role IS 'Store-scoped operational role only; platform admins are separate and gain no store access from this membership table.';
COMMENT ON COLUMN public.cham_products.cost_toman IS 'Not selectable by authenticated browser roles; write access is still limited by product RLS.';
COMMENT ON COLUMN public.cham_store_settings.settings IS 'Store configuration only; never store credentials, tokens, or other secrets here.';
COMMENT ON TABLE cham_private.cham_platform_operators IS 'Separate platform-admin identity registry only; no store-data access is granted by this migration.';
