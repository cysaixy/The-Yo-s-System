--
-- PostgreSQL database dump
--

\restrict sAYQYtdItx6mkC9pCBrK2eCo2LccjUpIwDlty80dvI2z9NLJPEZ97rFg98FwpWo

-- Dumped from database version 18.4
-- Dumped by pg_dump version 18.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: add_ons; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.add_ons (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    price numeric(10,2) DEFAULT 0 NOT NULL,
    cost numeric(10,2) DEFAULT 0,
    category character varying(100),
    status character varying(50) DEFAULT 'available'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.add_ons OWNER TO postgres;

--
-- Name: add_ons_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.add_ons_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.add_ons_id_seq OWNER TO postgres;

--
-- Name: add_ons_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.add_ons_id_seq OWNED BY public.add_ons.id;


--
-- Name: addon_inventory; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.addon_inventory (
    id integer NOT NULL,
    addon_id integer,
    inventory_id integer,
    quantity numeric(10,2) DEFAULT 1 NOT NULL,
    unit character varying(50)
);


ALTER TABLE public.addon_inventory OWNER TO postgres;

--
-- Name: addon_inventory_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.addon_inventory_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.addon_inventory_id_seq OWNER TO postgres;

--
-- Name: addon_inventory_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.addon_inventory_id_seq OWNED BY public.addon_inventory.id;


--
-- Name: addon_products; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.addon_products (
    id integer NOT NULL,
    addon_id integer,
    menu_id integer
);


ALTER TABLE public.addon_products OWNER TO postgres;

--
-- Name: addon_products_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.addon_products_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.addon_products_id_seq OWNER TO postgres;

--
-- Name: addon_products_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.addon_products_id_seq OWNED BY public.addon_products.id;


--
-- Name: app_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.app_settings (
    key text NOT NULL,
    value text NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.app_settings OWNER TO postgres;

--
-- Name: budgets; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.budgets (
    id integer NOT NULL,
    category character varying(50) NOT NULL,
    budget_month date NOT NULL,
    planned_amount numeric(10,2) NOT NULL,
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT budgets_planned_amount_check CHECK ((planned_amount >= (0)::numeric))
);


ALTER TABLE public.budgets OWNER TO postgres;

--
-- Name: budgets_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.budgets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.budgets_id_seq OWNER TO postgres;

--
-- Name: budgets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.budgets_id_seq OWNED BY public.budgets.id;


--
-- Name: bundle_products; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.bundle_products (
    id integer NOT NULL,
    bundle_id integer,
    menu_id integer,
    quantity integer DEFAULT 1 NOT NULL
);


ALTER TABLE public.bundle_products OWNER TO postgres;

--
-- Name: bundle_products_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.bundle_products_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.bundle_products_id_seq OWNER TO postgres;

--
-- Name: bundle_products_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.bundle_products_id_seq OWNED BY public.bundle_products.id;


--
-- Name: bundles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.bundles (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    bundle_price numeric(10,2) DEFAULT 0 NOT NULL,
    discount_percent numeric(5,2) DEFAULT 0,
    image_url text,
    status character varying(50) DEFAULT 'available'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.bundles OWNER TO postgres;

--
-- Name: bundles_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.bundles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.bundles_id_seq OWNER TO postgres;

--
-- Name: bundles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.bundles_id_seq OWNED BY public.bundles.id;


--
-- Name: cash_accounts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.cash_accounts (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    account_type character varying(20) NOT NULL,
    balance numeric(10,2) DEFAULT 0 NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT cash_accounts_account_type_check CHECK (((account_type)::text = ANY (ARRAY['cash'::text, 'bank'::text, 'ewallet'::text]))),
    CONSTRAINT cash_accounts_status_check CHECK (((status)::text = ANY (ARRAY['active'::text, 'archived'::text])))
);


ALTER TABLE public.cash_accounts OWNER TO postgres;

--
-- Name: cash_accounts_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.cash_accounts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.cash_accounts_id_seq OWNER TO postgres;

--
-- Name: cash_accounts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.cash_accounts_id_seq OWNED BY public.cash_accounts.id;


--
-- Name: cash_transactions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.cash_transactions (
    id integer NOT NULL,
    cash_account_id integer NOT NULL,
    staff_id integer,
    transaction_type character varying(10) NOT NULL,
    category character varying(50),
    amount numeric(10,2) NOT NULL,
    description text,
    transaction_date timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT cash_transactions_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT cash_transactions_transaction_type_check CHECK (((transaction_type)::text = ANY (ARRAY['in'::text, 'out'::text])))
);


ALTER TABLE public.cash_transactions OWNER TO postgres;

--
-- Name: cash_transactions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.cash_transactions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.cash_transactions_id_seq OWNER TO postgres;

--
-- Name: cash_transactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.cash_transactions_id_seq OWNED BY public.cash_transactions.id;


--
-- Name: categories; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.categories (
    id integer NOT NULL,
    name character varying(100) NOT NULL
);


ALTER TABLE public.categories OWNER TO postgres;

--
-- Name: categories_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.categories_id_seq OWNER TO postgres;

--
-- Name: categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.categories_id_seq OWNED BY public.categories.id;


--
-- Name: customers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.customers (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    email character varying(150) NOT NULL,
    phone character varying(20),
    password character varying(255),
    address character varying(255),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    firebase_uid character varying(128)
);


ALTER TABLE public.customers OWNER TO postgres;

--
-- Name: customers_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.customers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.customers_id_seq OWNER TO postgres;

--
-- Name: customers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.customers_id_seq OWNED BY public.customers.id;


--
-- Name: inventory_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.inventory_items (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    category character varying(100) NOT NULL,
    sku character varying(100),
    stock_quantity numeric(10,2) DEFAULT 0 NOT NULL,
    unit character varying(50) DEFAULT 'pcs'::character varying,
    unit_cost numeric(10,2) DEFAULT 0 NOT NULL,
    reorder_level numeric(10,2) DEFAULT 5,
    supplier character varying(255),
    status character varying(50) DEFAULT 'in_stock'::character varying,
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.inventory_items OWNER TO postgres;

--
-- Name: inventory_items_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.inventory_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.inventory_items_id_seq OWNER TO postgres;

--
-- Name: inventory_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.inventory_items_id_seq OWNED BY public.inventory_items.id;


--
-- Name: inventory_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.inventory_log (
    id integer NOT NULL,
    menu_id integer NOT NULL,
    staff_id integer NOT NULL,
    stock_in_id integer,
    transaction_type character varying(20) NOT NULL,
    quantity_change integer NOT NULL,
    log_date timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    remarks text,
    CONSTRAINT inventory_log_transaction_type_check CHECK (((transaction_type)::text = ANY ((ARRAY['stock_in'::character varying, 'stock_out'::character varying, 'adjustment'::character varying, 'sale'::character varying])::text[])))
);


ALTER TABLE public.inventory_log OWNER TO postgres;

--
-- Name: inventory_log_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.inventory_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.inventory_log_id_seq OWNER TO postgres;

--
-- Name: inventory_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.inventory_log_id_seq OWNED BY public.inventory_log.id;


--
-- Name: menu_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.menu_items (
    id integer NOT NULL,
    category_id integer NOT NULL,
    name character varying(150) NOT NULL,
    description text,
    price numeric(10,2) NOT NULL,
    image_url character varying(255),
    stock_quantity integer DEFAULT 0 NOT NULL,
    status character varying(20) DEFAULT 'available'::character varying NOT NULL,
    cost numeric(10,2) DEFAULT 0 NOT NULL,
    CONSTRAINT menu_items_price_check CHECK ((price >= (0)::numeric)),
    CONSTRAINT menu_items_status_check CHECK (((status)::text = ANY ((ARRAY['available'::character varying, 'unavailable'::character varying])::text[]))),
    CONSTRAINT menu_items_stock_quantity_check CHECK ((stock_quantity >= 0))
);


ALTER TABLE public.menu_items OWNER TO postgres;

--
-- Name: menu_items_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.menu_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.menu_items_id_seq OWNER TO postgres;

--
-- Name: menu_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.menu_items_id_seq OWNED BY public.menu_items.id;


--
-- Name: order_item_add_ons; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.order_item_add_ons (
    id integer NOT NULL,
    order_item_id integer,
    addon_id integer,
    name character varying(255) NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    price numeric(10,2) DEFAULT 0 NOT NULL,
    cost numeric(10,2) DEFAULT 0 NOT NULL,
    subtotal numeric(10,2) DEFAULT 0 NOT NULL
);


ALTER TABLE public.order_item_add_ons OWNER TO postgres;

--
-- Name: order_item_add_ons_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.order_item_add_ons_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.order_item_add_ons_id_seq OWNER TO postgres;

--
-- Name: order_item_add_ons_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.order_item_add_ons_id_seq OWNED BY public.order_item_add_ons.id;


--
-- Name: order_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.order_items (
    id integer NOT NULL,
    order_id integer NOT NULL,
    menu_id integer NOT NULL,
    quantity integer NOT NULL,
    price numeric(10,2) NOT NULL,
    subtotal numeric(10,2) NOT NULL,
    notes text,
    cost numeric(10,2) DEFAULT 0 NOT NULL,
    CONSTRAINT order_items_price_check CHECK ((price >= (0)::numeric)),
    CONSTRAINT order_items_quantity_check CHECK ((quantity > 0)),
    CONSTRAINT order_items_subtotal_check CHECK ((subtotal >= (0)::numeric))
);


ALTER TABLE public.order_items OWNER TO postgres;

--
-- Name: order_items_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.order_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.order_items_id_seq OWNER TO postgres;

--
-- Name: order_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.order_items_id_seq OWNED BY public.order_items.id;


--
-- Name: orders; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.orders (
    id integer NOT NULL,
    customer_id integer NOT NULL,
    staff_id integer,
    reservation_id integer,
    order_type character varying(20) NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    total_amount numeric(10,2) DEFAULT 0 NOT NULL,
    datetime_ordered timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    notes text,
    delivery_fee numeric(10,2) DEFAULT 0 NOT NULL,
    delivery_address text,
    customer_name text,
    customer_phone text,
    table_time text,
    payment_method character varying(50),
    delivery_fee_status character varying(20),
    delivery_fee_assigned_by integer,
    delivery_fee_assigned_at timestamp without time zone,
    delivery_barangay text,
    delivery_city text,
    delivery_landmark text,
    CONSTRAINT orders_order_type_check CHECK (((order_type)::text = ANY ((ARRAY['online'::character varying, 'dine_in'::character varying, 'pickup'::character varying])::text[]))),
    CONSTRAINT orders_status_check CHECK (((status)::text = ANY (ARRAY['pending'::text, 'confirmed'::text, 'preparing'::text, 'ready'::text, 'completed'::text, 'cancelled'::text]))),
    CONSTRAINT orders_total_amount_check CHECK ((total_amount >= (0)::numeric))
);


ALTER TABLE public.orders OWNER TO postgres;

--
-- Name: orders_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.orders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.orders_id_seq OWNER TO postgres;

--
-- Name: orders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.orders_id_seq OWNED BY public.orders.id;


--
-- Name: payments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.payments (
    id integer NOT NULL,
    order_id integer NOT NULL,
    payment_method character varying(30) NOT NULL,
    amount numeric(10,2) NOT NULL,
    datetime_paid timestamp without time zone,
    reference_number character varying(100),
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    CONSTRAINT payments_amount_check CHECK ((amount >= (0)::numeric)),
    CONSTRAINT payments_payment_method_check CHECK (((payment_method)::text = ANY ((ARRAY['cash'::character varying, 'gcash'::character varying, 'card'::character varying, 'bank_transfer'::character varying])::text[]))),
    CONSTRAINT payments_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'paid'::character varying, 'failed'::character varying, 'refunded'::character varying])::text[])))
);


ALTER TABLE public.payments OWNER TO postgres;

--
-- Name: payments_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.payments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.payments_id_seq OWNER TO postgres;

--
-- Name: payments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.payments_id_seq OWNED BY public.payments.id;


--
-- Name: reservations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.reservations (
    id integer NOT NULL,
    customer_id integer NOT NULL,
    table_no character varying(50),
    reservation_date date NOT NULL,
    reservation_time time without time zone NOT NULL,
    guests integer NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    notes text,
    datetime_reserved timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT reservations_guests_check CHECK ((guests > 0)),
    CONSTRAINT reservations_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'confirmed'::character varying, 'cancelled'::character varying, 'completed'::character varying])::text[])))
);


ALTER TABLE public.reservations OWNER TO postgres;

--
-- Name: reservations_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.reservations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.reservations_id_seq OWNER TO postgres;

--
-- Name: reservations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.reservations_id_seq OWNED BY public.reservations.id;


--
-- Name: staff; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.staff (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    email character varying(150) NOT NULL,
    password character varying(255) NOT NULL,
    role character varying(20) DEFAULT 'Cashier'::character varying NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT staff_role_check CHECK (((role)::text = ANY ((ARRAY['Admin'::character varying, 'Cashier'::character varying])::text[]))),
    CONSTRAINT staff_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'inactive'::character varying])::text[])))
);


ALTER TABLE public.staff OWNER TO postgres;

--
-- Name: staff_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.staff_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.staff_id_seq OWNER TO postgres;

--
-- Name: staff_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.staff_id_seq OWNED BY public.staff.id;


--
-- Name: staff_permissions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.staff_permissions (
    staff_id integer NOT NULL,
    can_access_inventory boolean DEFAULT false NOT NULL,
    can_access_stock_in boolean DEFAULT false NOT NULL,
    can_access_reports boolean DEFAULT false NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.staff_permissions OWNER TO postgres;

--
-- Name: stock_in; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.stock_in (
    id integer NOT NULL,
    menu_id integer NOT NULL,
    staff_id integer NOT NULL,
    quantity integer NOT NULL,
    expiration_date date,
    stockin_date timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    remarks text,
    CONSTRAINT stock_in_quantity_check CHECK ((quantity > 0))
);


ALTER TABLE public.stock_in OWNER TO postgres;

--
-- Name: stock_in_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.stock_in_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.stock_in_id_seq OWNER TO postgres;

--
-- Name: stock_in_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.stock_in_id_seq OWNED BY public.stock_in.id;


--
-- Name: tables; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tables (
    id integer NOT NULL,
    table_no character varying(50) NOT NULL,
    capacity integer NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT tables_capacity_check CHECK ((capacity > 0))
);


ALTER TABLE public.tables OWNER TO postgres;

--
-- Name: tables_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.tables_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.tables_id_seq OWNER TO postgres;

--
-- Name: tables_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.tables_id_seq OWNED BY public.tables.id;


--
-- Name: add_ons id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.add_ons ALTER COLUMN id SET DEFAULT nextval('public.add_ons_id_seq'::regclass);


--
-- Name: addon_inventory id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.addon_inventory ALTER COLUMN id SET DEFAULT nextval('public.addon_inventory_id_seq'::regclass);


--
-- Name: addon_products id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.addon_products ALTER COLUMN id SET DEFAULT nextval('public.addon_products_id_seq'::regclass);


--
-- Name: budgets id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.budgets ALTER COLUMN id SET DEFAULT nextval('public.budgets_id_seq'::regclass);


--
-- Name: bundle_products id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bundle_products ALTER COLUMN id SET DEFAULT nextval('public.bundle_products_id_seq'::regclass);


--
-- Name: bundles id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bundles ALTER COLUMN id SET DEFAULT nextval('public.bundles_id_seq'::regclass);


--
-- Name: cash_accounts id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cash_accounts ALTER COLUMN id SET DEFAULT nextval('public.cash_accounts_id_seq'::regclass);


--
-- Name: cash_transactions id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cash_transactions ALTER COLUMN id SET DEFAULT nextval('public.cash_transactions_id_seq'::regclass);


--
-- Name: categories id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.categories ALTER COLUMN id SET DEFAULT nextval('public.categories_id_seq'::regclass);


--
-- Name: customers id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customers ALTER COLUMN id SET DEFAULT nextval('public.customers_id_seq'::regclass);


--
-- Name: inventory_items id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_items ALTER COLUMN id SET DEFAULT nextval('public.inventory_items_id_seq'::regclass);


--
-- Name: inventory_log id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_log ALTER COLUMN id SET DEFAULT nextval('public.inventory_log_id_seq'::regclass);


--
-- Name: menu_items id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.menu_items ALTER COLUMN id SET DEFAULT nextval('public.menu_items_id_seq'::regclass);


--
-- Name: order_item_add_ons id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_item_add_ons ALTER COLUMN id SET DEFAULT nextval('public.order_item_add_ons_id_seq'::regclass);


--
-- Name: order_items id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_items ALTER COLUMN id SET DEFAULT nextval('public.order_items_id_seq'::regclass);


--
-- Name: orders id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders ALTER COLUMN id SET DEFAULT nextval('public.orders_id_seq'::regclass);


--
-- Name: payments id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments ALTER COLUMN id SET DEFAULT nextval('public.payments_id_seq'::regclass);


--
-- Name: reservations id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reservations ALTER COLUMN id SET DEFAULT nextval('public.reservations_id_seq'::regclass);


--
-- Name: staff id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.staff ALTER COLUMN id SET DEFAULT nextval('public.staff_id_seq'::regclass);


--
-- Name: stock_in id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stock_in ALTER COLUMN id SET DEFAULT nextval('public.stock_in_id_seq'::regclass);


--
-- Name: tables id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tables ALTER COLUMN id SET DEFAULT nextval('public.tables_id_seq'::regclass);


--
-- Data for Name: add_ons; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.add_ons (id, name, description, price, cost, category, status, created_at) FROM stdin;
1	Extra Shot	Additional espresso shot	30.00	12.00	Coffee Add-On	available	2026-08-12 01:05:11.516437
2	Oat Milk	Substitute with barista oat milk	30.00	20.00	Dairy Alternative	available	2026-08-12 01:05:11.520317
3	Caramel Drizzle	Extra caramel drizzle topping	20.00	5.00	Toppings	available	2026-08-12 01:05:11.521432
\.


--
-- Data for Name: addon_inventory; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.addon_inventory (id, addon_id, inventory_id, quantity, unit) FROM stdin;
\.


--
-- Data for Name: addon_products; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.addon_products (id, addon_id, menu_id) FROM stdin;
\.


--
-- Data for Name: app_settings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.app_settings (key, value, updated_at) FROM stdin;
\.


--
-- Data for Name: budgets; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.budgets (id, category, budget_month, planned_amount, notes, created_at) FROM stdin;
\.


--
-- Data for Name: bundle_products; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.bundle_products (id, bundle_id, menu_id, quantity) FROM stdin;
\.


--
-- Data for Name: bundles; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.bundles (id, name, description, bundle_price, discount_percent, image_url, status, created_at) FROM stdin;
\.


--
-- Data for Name: cash_accounts; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.cash_accounts (id, name, account_type, balance, status, created_at) FROM stdin;
1	GCash	ewallet	0.00	active	2026-08-09 13:07:31.94697
2	Cash Drawer	cash	0.00	active	2026-08-09 13:07:31.94697
\.


--
-- Data for Name: cash_transactions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.cash_transactions (id, cash_account_id, staff_id, transaction_type, category, amount, description, transaction_date) FROM stdin;
\.


--
-- Data for Name: categories; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.categories (id, name) FROM stdin;
2	Rice Meals & Bowls
3	Wings, Noodles & Snacks
4	Espresso & Coffee
5	Specialty Beverages
\.


--
-- Data for Name: customers; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.customers (id, name, email, phone, password, address, created_at, firebase_uid) FROM stdin;
1	Maria Santos	maria@example.com	09171234567	$2b$10$OqiYBdOu8y5bCpEhpP4/EeJ6AvBOmGKGRqWo9pl2hY5DB1U5dIR2u	Tarlac City	2026-08-05 08:42:47.62518	\N
2	Test Customer	customer1@theyos.com	09171234567	$2b$10$RrBiOhn4BiI9W.Cq6AJhA.KU8IanRgZtLryB5GdHolmoXBKLtGHTi	123 Sample St, Baggao	2026-08-05 09:11:10.068189	\N
3	Second Customer	customer2@theyos.com	09179876543	$2b$10$AZkEm4aOFkC9htw/3FoISeCI8CaRrGP4Dtzqi73/uGmKmMHv55z2W	456 Other St, Baggao	2026-08-05 09:11:10.068189	\N
6	Jane Doe	testcustomer1@example.com	09123456789	\N	123 Main St	2026-08-07 11:00:38.978968	test_firebase_uid_123
8	Cas	hh1014911@gmail.com	0922384199	\N	\N	2026-08-08 03:36:32.309395	zyJHEaf7SFhlKjK32F032idJRhn1
9	Angela Natifay Gammad	angelanatifay@gmail.com	09123712311	\N	\N	2026-08-08 11:41:11.65862	hEwkVz2togR10Wm3SySQOVikgND2
10	JC Domingo	domingojohnchristian1@gmail.com	09821778591	\N	tigangburat	2026-08-08 21:29:10.968909	an6ZZqUkVMRB0LgTGq5kA3N7kBB3
14	Jade De Leon	jadedeleon690@gmail.com	09222222222	\N	\N	2026-08-12 12:21:54.265076	AQhXBSUqD4SNMakYbtlSLdhAiSG3
15	New Customer	mjellaso23@gmail.com	\N	\N	\N	2026-08-13 13:03:40.967664	KCIco3BjPDMRoG9P59l7U2RHu6D3
7	Cyrus de Leon	deleoncyrus764@gmail.com	\N	\N	\N	2026-08-07 14:25:03.769364	EJ8zLwVG3rbsYNvsGfkGm0kexWX2
11	New Customer	cyrusdeleon1804@gmail.com	\N	\N	\N	2026-08-10 03:40:17.387244	CwVXbE9HAVcJPVeOThkNJQqgtIv2
13	Walk-in Customer	walkin@theyos.pos	\N	\N	\N	2026-08-10 19:15:49.041487	\N
\.


--
-- Data for Name: inventory_items; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.inventory_items (id, name, category, sku, stock_quantity, unit, unit_cost, reorder_level, supplier, status, notes, created_at) FROM stdin;
1	Espresso Beans	Coffee & Espresso	COF-001	15.00	kg	850.00	3.00	ABC Coffee Supplier	in_stock	Premium Arabica espresso beans	2026-08-12 01:05:11.530966
2	Fresh Milk	Milk & Dairy	MLK-001	24.00	L	95.00	5.00	Dairy Fresh Co.	in_stock	Whole fresh milk	2026-08-12 01:05:11.530966
3	Oat Milk	Non-Dairy & Plant-Based	MLK-002	12.00	L	150.00	4.00	OatLy Inc.	in_stock	Barista edition oat milk	2026-08-12 01:05:11.530966
4	Matcha Powder	Tea & Matcha	TEA-001	2.50	kg	1200.00	1.00	Uji Tea Imports	in_stock	Ceremonial grade matcha	2026-08-12 01:05:11.530966
5	Vanilla Syrup	Syrups & Flavorings	SYR-001	8.00	bottle	380.00	2.00	Monin Philippines	in_stock	750ml vanilla syrup	2026-08-12 01:05:11.530966
6	Caramel Sauce	Sauces & Toppings	SAU-001	5.00	bottle	420.00	2.00	Torani Sauces	in_stock	Drizzle sauce	2026-08-12 01:05:11.530966
7	Brown Sugar	Sweeteners	SWT-001	20.00	kg	65.00	5.00	Local Sugar Mill	in_stock	Raw brown sugar	2026-08-12 01:05:11.530966
8	Paper Cups 16oz	Packaging	PKG-001	500.00	pcs	4.50	100.00	EcoPack Corp	in_stock	Double wall hot cups	2026-08-12 01:05:11.530966
9	Plastic Lids	Packaging	PKG-002	450.00	pcs	1.80	100.00	EcoPack Corp	in_stock	Sip lids for 16oz	2026-08-12 01:05:11.530966
\.


--
-- Data for Name: inventory_log; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.inventory_log (id, menu_id, staff_id, stock_in_id, transaction_type, quantity_change, log_date, remarks) FROM stdin;
1	2	1	\N	sale	-2	2026-08-05 09:11:10.068189	Seed test order
2	2	1	1	stock_in	20	2026-08-05 09:11:10.068189	Weekly restock — seed data
4	39	6	\N	sale	-1	2026-08-08 23:01:09.604105	Order #6
5	40	6	\N	sale	-1	2026-08-08 23:01:09.604105	Order #6
6	39	6	\N	sale	-1	2026-08-09 19:41:12.131513	Order #10
7	54	6	\N	sale	-1	2026-08-09 19:41:20.943274	Order #11
8	48	6	\N	sale	-1	2026-08-09 19:41:35.835651	Order #13
9	8	5	\N	sale	-1	2026-08-10 19:15:49.041487	Order #16
10	39	5	\N	sale	-1	2026-08-10 19:20:40.545883	Order #17
11	39	5	\N	sale	-1	2026-08-10 19:29:39.738166	Order #18
12	39	1	\N	sale	-2	2026-08-12 01:52:28.895831	POS Order #21
13	39	1	\N	sale	-2	2026-08-12 01:54:24.526137	POS Order #22
\.


--
-- Data for Name: menu_items; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.menu_items (id, category_id, name, description, price, image_url, stock_quantity, status, cost) FROM stdin;
8	2	Barbeque Pork Rib Platter	\N	180.00	\N	48	available	0.00
16	2	Honey Soy Poppers Bowl	\N	100.00	\N	49	available	0.00
2	2	Pork Sisig Rice Meal	\N	100.00	\N	69	available	0.00
3	2	Burger Steak Rice Meal	\N	100.00	\N	50	available	0.00
4	2	Chicken Katsu Rice Meal	\N	120.00	\N	50	available	0.00
5	2	Cordon Blue Rice Meal	\N	120.00	\N	50	available	0.00
6	2	Chicken Mushroom Rice Meal	\N	130.00	\N	50	available	0.00
7	2	Kare Kare Rice Meal	\N	150.00	\N	50	available	0.00
9	2	Chicken Inasal Platter	\N	165.00	\N	50	available	0.00
10	2	Braised Pork Rice Meal	\N	120.00	\N	50	available	0.00
11	2	Beef Tapa Bowl	\N	100.00	\N	50	available	0.00
12	2	Pork Tocino Bowl	\N	100.00	\N	50	available	0.00
13	2	Hungarian Sausage Bowl	\N	120.00	\N	50	available	0.00
14	2	Garlic Longganisa Bowl	\N	120.00	\N	50	available	0.00
15	2	Sweet & Sour Poppers Bowl	\N	100.00	\N	50	available	0.00
17	3	Dubai Chocolate Truffles	Premium crunch item	150.00	\N	50	available	0.00
18	3	Chicken Wings (2 Pcs with Rice & Fries)	\N	125.00	\N	50	available	0.00
19	3	Chicken Wings (4 Pcs)	\N	145.00	\N	50	available	0.00
20	3	Chicken Wings (6 Pcs)	Flavors: Buffalo, Cheesy Garlic, Garlic Parm, Honey Glaze, Korean BBQ, Salted Egg, Thai Sweet Chili	180.00	\N	50	available	0.00
21	3	Spaghetti Pasta	\N	120.00	\N	50	available	0.00
22	3	Carbonara Pasta	\N	120.00	\N	50	available	0.00
23	3	Lomi (Regular)	\N	70.00	\N	50	available	0.00
25	3	Pansit Batil Patung (Balor 100)	\N	100.00	\N	50	available	0.00
26	3	Pansit Batil Patung (Balor 120)	\N	120.00	\N	50	available	0.00
28	3	Pansit Batil Patung Bilao (Small)	\N	300.00	\N	50	available	0.00
29	3	Pansit Batil Patung Bilao (Large)	\N	500.00	\N	50	available	0.00
31	3	Fries (Overload)	\N	200.00	\N	50	available	0.00
32	3	Nachos (Regular)	\N	90.00	\N	50	available	0.00
33	3	Nachos (Overload)	\N	200.00	\N	50	available	0.00
34	3	Chic & Fries Basket	\N	100.00	\N	50	available	0.00
35	3	Classic Burger (Regular)	\N	60.00	\N	50	available	0.00
36	3	Cheesy Burger	\N	75.00	\N	50	available	0.00
37	3	Corndog (Classic)	\N	55.00	\N	50	available	0.00
38	3	Corndog (Mozzarella)	\N	75.00	\N	50	available	0.00
41	4	Cafe Latte	\N	100.00	\N	50	available	0.00
42	4	Vanilla Latte	\N	110.00	\N	50	available	0.00
43	4	Hazelnut Latte	\N	110.00	\N	50	available	0.00
44	4	Spanish Latte	\N	110.00	\N	50	available	0.00
45	4	Dark Mocha Craft	\N	120.00	\N	50	available	0.00
46	4	White Mocha Craft	\N	120.00	\N	50	available	0.00
47	4	Caramel Macchiato	\N	120.00	\N	50	available	0.00
49	4	Nutty Caramel Blend	\N	120.00	\N	50	available	0.00
50	4	Sea Salt Latte Signature	\N	120.00	\N	50	available	0.00
51	4	Biscoff Latte Special	\N	140.00	\N	50	available	0.00
52	4	Oreo Latte Cream	\N	110.00	\N	50	available	0.00
53	4	Java Chip Coffee Frappe	\N	165.00	\N	50	available	0.00
55	4	Biscoffee Premium Frappe	\N	180.00	\N	50	available	0.00
56	5	Milky Strawberry Drink	\N	100.00	\N	50	available	0.00
57	5	Blueberry Fresh Milk	\N	100.00	\N	50	available	0.00
58	5	Dark Chocolate Luxury	\N	100.00	\N	50	available	0.00
59	5	Choco Berry Fusion	\N	110.00	\N	50	available	0.00
60	5	Oreo Cookies Milkshake	\N	100.00	\N	50	available	0.00
61	5	Matcha Latte (Classic)	\N	100.00	\N	50	available	0.00
63	5	Oreo Matcha Fusion	\N	120.00	\N	50	available	0.00
64	5	Caramel Matcha Fusion	\N	120.00	\N	50	available	0.00
65	5	Biscoff Matcha Delight	\N	130.00	\N	50	available	0.00
66	5	Sea Salt Matcha Signature	\N	120.00	\N	50	available	0.00
67	5	Espresso Matcha Layered	\N	120.00	\N	50	available	0.00
68	5	Wildberry Fruit Tea	\N	120.00	\N	50	available	0.00
69	5	Four-Red Fruits Tea	\N	120.00	\N	50	available	0.00
70	5	Lemon Ginger Tea Infusion	\N	120.00	\N	50	available	0.00
71	5	Green Tea Wellness Mix	\N	120.00	\N	50	available	0.00
72	5	Fruit Soda (Blueberry / Strawberry / Raspberry)	\N	80.00	\N	50	available	0.00
73	5	Fruit Soda (Green Apple / Kiwi / Peach / Orange)	\N	80.00	\N	50	available	0.00
74	5	Non-Coffee Frappe (Matcha / Strawberry / Blueberry)	\N	140.00	\N	50	available	0.00
75	5	Non-Coffee Frappe (Cookies & Cream / Double Choc Chip)	\N	140.00	\N	50	available	0.00
76	5	Biscoff Non-Coffee Frappe	\N	160.00	\N	50	available	0.00
62	5	Berry Matcha Blend	\N	100.00	\N	49	available	0.00
40	4	Americano with Cold Foam	\N	100.00	\N	47	available	0.00
48	4	Nutty Mocha Blend	\N	120.00	\N	49	available	0.00
27	3	Pansit Batil Patung (Balor 150)	\N	150.00	\N	49	available	0.00
39	4	Americano Coffee	\N	90.00	\N	37	available	0.00
30	3	Fries (Regular)	\N	70.00	\N	49	available	0.00
24	3	Lomi (Overload)	\N	100.00	\N	49	available	0.00
54	4	Coffee Caramel Frappe	\N	165.00	\N	48	available	0.00
\.


--
-- Data for Name: order_item_add_ons; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.order_item_add_ons (id, order_item_id, addon_id, name, quantity, price, cost, subtotal) FROM stdin;
1	18	3	Caramel Drizzle	1	20.00	5.00	20.00
2	19	3	Caramel Drizzle	1	20.00	5.00	20.00
4	26	2	Oat Milk	1	30.00	20.00	30.00
\.


--
-- Data for Name: order_items; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.order_items (id, order_id, menu_id, quantity, price, subtotal, notes, cost) FROM stdin;
1	1	2	2	100.00	200.00	\N	0.00
2	2	39	1	90.00	90.00	\N	0.00
3	3	40	1	100.00	100.00	\N	0.00
4	4	8	1	180.00	180.00	\N	0.00
5	4	40	1	100.00	100.00	\N	0.00
6	5	62	1	100.00	100.00	\N	0.00
7	6	39	1	90.00	90.00	\N	0.00
8	6	40	1	100.00	100.00	\N	0.00
9	7	39	1	90.00	90.00	\N	0.00
10	10	39	1	90.00	90.00	no ice	0.00
11	11	54	1	165.00	165.00	\N	0.00
12	13	48	1	120.00	120.00	\N	0.00
13	16	8	1	180.00	180.00	\N	0.00
14	17	39	1	90.00	90.00	no ice	0.00
15	18	39	1	90.00	90.00	no ice	0.00
16	19	39	1	90.00	90.00	no ice	0.00
17	20	39	1	90.00	90.00	no ice	0.00
18	21	39	2	90.00	180.00	test order	0.00
19	22	39	2	90.00	180.00	test order	0.00
20	23	27	1	150.00	150.00	more miki	0.00
22	25	39	1	90.00	90.00	\N	0.00
23	27	30	1	70.00	70.00	\N	0.00
24	28	16	1	100.00	100.00	\N	0.00
25	29	24	1	100.00	100.00	\N	0.00
26	30	54	1	165.00	165.00	no ice	0.00
27	31	2	1	100.00	100.00	\N	0.00
\.


--
-- Data for Name: orders; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.orders (id, customer_id, staff_id, reservation_id, order_type, status, total_amount, datetime_ordered, notes, delivery_fee, delivery_address, customer_name, customer_phone, table_time, payment_method, delivery_fee_status, delivery_fee_assigned_by, delivery_fee_assigned_at, delivery_barangay, delivery_city, delivery_landmark) FROM stdin;
1	2	\N	\N	dine_in	pending	200.00	2026-08-05 09:11:10.068189	\N	0.00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
3	9	\N	\N	pickup	pending	100.00	2026-08-08 11:42:02.327839	\N	0.00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
2	7	\N	\N	dine_in	completed	90.00	2026-08-08 03:15:17.777794	\N	0.00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
4	10	\N	\N	pickup	completed	280.00	2026-08-08 21:31:13.445152	\N	0.00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
5	7	\N	\N	dine_in	completed	100.00	2026-08-08 22:57:29.06057	\N	0.00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
6	1	6	\N	dine_in	completed	190.00	2026-08-08 23:01:09.604105	\N	0.00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
7	7	\N	\N	pickup	completed	90.00	2026-08-09 13:35:18.733601	\N	0.00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
10	1	6	\N	dine_in	pending	90.00	2026-08-09 19:41:12.131513	\N	0.00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
11	2	6	\N	pickup	pending	165.00	2026-08-09 19:41:20.943274	\N	0.00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
13	3	6	\N	pickup	pending	120.00	2026-08-09 19:41:35.835651	\N	0.00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
16	13	5	\N	dine_in	completed	180.00	2026-08-10 19:15:49.041487	\N	0.00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
17	13	5	\N	dine_in	completed	90.00	2026-08-10 19:20:40.545883	\N	0.00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
18	13	5	\N	dine_in	completed	90.00	2026-08-10 19:29:39.738166	\N	0.00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
19	7	\N	\N	pickup	completed	90.00	2026-08-10 19:30:56.368212	\N	0.00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
20	7	\N	\N	pickup	completed	90.00	2026-08-11 13:29:35.871854	\N	0.00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
21	13	1	\N	dine_in	completed	200.00	2026-08-12 01:52:28.895831	\N	0.00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
22	13	1	\N	dine_in	completed	200.00	2026-08-12 01:54:24.526137	\N	0.00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
23	14	\N	\N	dine_in	pending	150.00	2026-08-12 12:23:08.348864	\N	0.00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
25	14	\N	\N	dine_in	completed	90.00	2026-08-12 13:12:13.914997	\N	0.00	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
27	14	\N	\N	dine_in	pending	70.00	2026-08-12 13:59:49.288772	\N	0.00	\N	Jade De Leon	09222222222	12:00pm	cash	\N	\N	\N	\N	\N	\N
28	14	\N	\N	online	confirmed	100.00	2026-08-12 15:40:35.317984	\N	0.00	Tuguegarao City, Leonarda	Jade De Leon	09222222222	12:00pm	cash	\N	\N	\N	\N	\N	\N
29	14	\N	\N	online	pending	100.00	2026-08-13 03:09:48.248394	\N	0.00	asd	Jade De Leon	09222222222	12:00pm	cash	\N	\N	\N	\N	\N	\N
30	15	\N	\N	online	completed	195.00	2026-08-13 13:05:22.138674	\N	0.00	BAGGAO	MJ ELLASO	0933333333	12:00	cash	\N	\N	\N	\N	\N	\N
31	7	\N	\N	dine_in	confirmed	100.00	2026-08-16 03:05:22.517846	\N	0.00	\N	Cyrus de Leon	0933333333	12:00pm	cash	\N	\N	\N	\N	\N	\N
\.


--
-- Data for Name: payments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.payments (id, order_id, payment_method, amount, datetime_paid, reference_number, status) FROM stdin;
1	1	cash	200.00	2026-08-05 09:11:10.068189	\N	paid
2	21	cash	200.00	2026-08-12 01:52:28.895831	\N	paid
3	22	cash	200.00	2026-08-12 01:54:24.526137	\N	paid
\.


--
-- Data for Name: reservations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.reservations (id, customer_id, table_no, reservation_date, reservation_time, guests, status, notes, datetime_reserved) FROM stdin;
1	2	T5	2026-08-07	18:00:00	4	pending	Birthday celebration	2026-08-05 09:11:10.068189
2	7	\N	2026-08-21	15:50:00	10	pending	Birthday	2026-08-10 01:45:38.118534
16	1	\N	2026-08-16	19:00:00	2	pending	\N	2026-08-12 15:25:08.433612
\.


--
-- Data for Name: staff; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.staff (id, name, email, password, role, status, created_at) FROM stdin;
1	Test Admin	admin@theyos.com	$2b$10$7VR869mPCj7KUgJzH4r6oeanKnuBVORaQ.rwc56h3Fyn/cN2cEPEO	Admin	active	2026-08-05 08:42:47.62518
5	cyrusdeleon	cyrusdeleon1804@gmail.com	$2b$10$ZQna4P27UQtWadrFKUWwCulcxxqyjHJqFyJ63/rJmYEuL2ccDGtDy	Admin	active	2026-08-08 22:59:29.606425
6	aaron	aaron@gmail.com	$2b$10$v5hNdFsZyurpSvGjYJFAKOQgWBMyNy7h4q2o0OcGIFULjkUIg80hW	Cashier	active	2026-08-08 23:00:04.291051
\.


--
-- Data for Name: staff_permissions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.staff_permissions (staff_id, can_access_inventory, can_access_stock_in, can_access_reports, updated_at) FROM stdin;
1	t	t	t	2026-08-05 08:42:47.62518
5	f	f	f	2026-08-08 22:59:29.606425
6	f	f	f	2026-08-15 12:40:21.61769
\.


--
-- Data for Name: stock_in; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.stock_in (id, menu_id, staff_id, quantity, expiration_date, stockin_date, remarks) FROM stdin;
1	2	1	20	2026-09-04	2026-08-05 09:11:10.068189	Weekly restock — seed data
\.


--
-- Data for Name: tables; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.tables (id, table_no, capacity, status, created_at) FROM stdin;
1	T1	2	active	2026-08-12 15:12:03.469123
2	T2	2	active	2026-08-12 15:12:03.469123
3	T3	4	active	2026-08-12 15:12:03.469123
4	T4	4	active	2026-08-12 15:12:03.469123
5	T5	4	active	2026-08-12 15:12:03.469123
6	T6	6	active	2026-08-12 15:12:03.469123
7	T7	8	active	2026-08-12 15:12:03.469123
8	T8	10	active	2026-08-12 15:12:03.469123
\.


--
-- Name: add_ons_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.add_ons_id_seq', 3, true);


--
-- Name: addon_inventory_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.addon_inventory_id_seq', 1, false);


--
-- Name: addon_products_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.addon_products_id_seq', 1, false);


--
-- Name: budgets_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.budgets_id_seq', 1, false);


--
-- Name: bundle_products_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.bundle_products_id_seq', 1, false);


--
-- Name: bundles_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.bundles_id_seq', 1, false);


--
-- Name: cash_accounts_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.cash_accounts_id_seq', 2, true);


--
-- Name: cash_transactions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.cash_transactions_id_seq', 1, false);


--
-- Name: categories_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.categories_id_seq', 5, true);


--
-- Name: customers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.customers_id_seq', 16, true);


--
-- Name: inventory_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.inventory_items_id_seq', 9, true);


--
-- Name: inventory_log_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.inventory_log_id_seq', 13, true);


--
-- Name: menu_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.menu_items_id_seq', 76, true);


--
-- Name: order_item_add_ons_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.order_item_add_ons_id_seq', 4, true);


--
-- Name: order_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.order_items_id_seq', 27, true);


--
-- Name: orders_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.orders_id_seq', 31, true);


--
-- Name: payments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.payments_id_seq', 3, true);


--
-- Name: reservations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.reservations_id_seq', 20, true);


--
-- Name: staff_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.staff_id_seq', 7, true);


--
-- Name: stock_in_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.stock_in_id_seq', 1, true);


--
-- Name: tables_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.tables_id_seq', 8, true);


--
-- Name: add_ons add_ons_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.add_ons
    ADD CONSTRAINT add_ons_pkey PRIMARY KEY (id);


--
-- Name: addon_inventory addon_inventory_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.addon_inventory
    ADD CONSTRAINT addon_inventory_pkey PRIMARY KEY (id);


--
-- Name: addon_products addon_products_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.addon_products
    ADD CONSTRAINT addon_products_pkey PRIMARY KEY (id);


--
-- Name: app_settings app_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_pkey PRIMARY KEY (key);


--
-- Name: budgets budgets_category_budget_month_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.budgets
    ADD CONSTRAINT budgets_category_budget_month_key UNIQUE (category, budget_month);


--
-- Name: budgets budgets_category_month_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.budgets
    ADD CONSTRAINT budgets_category_month_unique UNIQUE (category, budget_month);


--
-- Name: budgets budgets_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.budgets
    ADD CONSTRAINT budgets_pkey PRIMARY KEY (id);


--
-- Name: bundle_products bundle_products_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bundle_products
    ADD CONSTRAINT bundle_products_pkey PRIMARY KEY (id);


--
-- Name: bundles bundles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bundles
    ADD CONSTRAINT bundles_pkey PRIMARY KEY (id);


--
-- Name: cash_accounts cash_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cash_accounts
    ADD CONSTRAINT cash_accounts_pkey PRIMARY KEY (id);


--
-- Name: cash_transactions cash_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cash_transactions
    ADD CONSTRAINT cash_transactions_pkey PRIMARY KEY (id);


--
-- Name: categories categories_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_name_key UNIQUE (name);


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);


--
-- Name: customers customers_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_email_key UNIQUE (email);


--
-- Name: customers customers_firebase_uid_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_firebase_uid_key UNIQUE (firebase_uid);


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- Name: inventory_items inventory_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_items
    ADD CONSTRAINT inventory_items_pkey PRIMARY KEY (id);


--
-- Name: inventory_log inventory_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_log
    ADD CONSTRAINT inventory_log_pkey PRIMARY KEY (id);


--
-- Name: inventory_log inventory_log_stock_in_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_log
    ADD CONSTRAINT inventory_log_stock_in_id_key UNIQUE (stock_in_id);


--
-- Name: menu_items menu_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.menu_items
    ADD CONSTRAINT menu_items_pkey PRIMARY KEY (id);


--
-- Name: order_item_add_ons order_item_add_ons_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_item_add_ons
    ADD CONSTRAINT order_item_add_ons_pkey PRIMARY KEY (id);


--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);


--
-- Name: orders orders_delivery_fee_range; Type: CHECK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE public.orders
    ADD CONSTRAINT orders_delivery_fee_range CHECK (((delivery_fee = (0)::numeric) OR ((delivery_fee >= (20)::numeric) AND (delivery_fee <= (150)::numeric)))) NOT VALID;


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: payments payments_order_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_order_id_key UNIQUE (order_id);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: reservations reservations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reservations
    ADD CONSTRAINT reservations_pkey PRIMARY KEY (id);


--
-- Name: staff staff_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.staff
    ADD CONSTRAINT staff_email_key UNIQUE (email);


--
-- Name: staff_permissions staff_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.staff_permissions
    ADD CONSTRAINT staff_permissions_pkey PRIMARY KEY (staff_id);


--
-- Name: staff staff_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.staff
    ADD CONSTRAINT staff_pkey PRIMARY KEY (id);


--
-- Name: stock_in stock_in_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stock_in
    ADD CONSTRAINT stock_in_pkey PRIMARY KEY (id);


--
-- Name: tables tables_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tables
    ADD CONSTRAINT tables_pkey PRIMARY KEY (id);


--
-- Name: tables tables_table_no_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tables
    ADD CONSTRAINT tables_table_no_key UNIQUE (table_no);


--
-- Name: idx_budgets_month; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_budgets_month ON public.budgets USING btree (budget_month);


--
-- Name: idx_cash_transactions_account; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_cash_transactions_account ON public.cash_transactions USING btree (cash_account_id);


--
-- Name: idx_cash_transactions_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_cash_transactions_date ON public.cash_transactions USING btree (transaction_date);


--
-- Name: idx_inventory_log_menu; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_inventory_log_menu ON public.inventory_log USING btree (menu_id);


--
-- Name: idx_inventory_log_staff; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_inventory_log_staff ON public.inventory_log USING btree (staff_id);


--
-- Name: idx_menu_items_category; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_menu_items_category ON public.menu_items USING btree (category_id);


--
-- Name: idx_order_items_menu; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_order_items_menu ON public.order_items USING btree (menu_id);


--
-- Name: idx_order_items_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_order_items_order ON public.order_items USING btree (order_id);


--
-- Name: idx_orders_customer; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_orders_customer ON public.orders USING btree (customer_id);


--
-- Name: idx_orders_reservation; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_orders_reservation ON public.orders USING btree (reservation_id);


--
-- Name: idx_orders_staff; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_orders_staff ON public.orders USING btree (staff_id);


--
-- Name: idx_reservations_customer; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_reservations_customer ON public.reservations USING btree (customer_id);


--
-- Name: idx_stock_in_menu; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_stock_in_menu ON public.stock_in USING btree (menu_id);


--
-- Name: idx_stock_in_staff; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_stock_in_staff ON public.stock_in USING btree (staff_id);


--
-- Name: addon_inventory addon_inventory_addon_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.addon_inventory
    ADD CONSTRAINT addon_inventory_addon_id_fkey FOREIGN KEY (addon_id) REFERENCES public.add_ons(id) ON DELETE CASCADE;


--
-- Name: addon_inventory addon_inventory_inventory_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.addon_inventory
    ADD CONSTRAINT addon_inventory_inventory_id_fkey FOREIGN KEY (inventory_id) REFERENCES public.inventory_items(id) ON DELETE CASCADE;


--
-- Name: addon_products addon_products_addon_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.addon_products
    ADD CONSTRAINT addon_products_addon_id_fkey FOREIGN KEY (addon_id) REFERENCES public.add_ons(id) ON DELETE CASCADE;


--
-- Name: addon_products addon_products_menu_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.addon_products
    ADD CONSTRAINT addon_products_menu_id_fkey FOREIGN KEY (menu_id) REFERENCES public.menu_items(id) ON DELETE CASCADE;


--
-- Name: bundle_products bundle_products_bundle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bundle_products
    ADD CONSTRAINT bundle_products_bundle_id_fkey FOREIGN KEY (bundle_id) REFERENCES public.bundles(id) ON DELETE CASCADE;


--
-- Name: bundle_products bundle_products_menu_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bundle_products
    ADD CONSTRAINT bundle_products_menu_id_fkey FOREIGN KEY (menu_id) REFERENCES public.menu_items(id) ON DELETE CASCADE;


--
-- Name: cash_transactions cash_transactions_cash_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cash_transactions
    ADD CONSTRAINT cash_transactions_cash_account_id_fkey FOREIGN KEY (cash_account_id) REFERENCES public.cash_accounts(id) ON DELETE RESTRICT;


--
-- Name: cash_transactions cash_transactions_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cash_transactions
    ADD CONSTRAINT cash_transactions_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE SET NULL;


--
-- Name: inventory_log inventory_log_menu_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_log
    ADD CONSTRAINT inventory_log_menu_id_fkey FOREIGN KEY (menu_id) REFERENCES public.menu_items(id) ON DELETE CASCADE;


--
-- Name: inventory_log inventory_log_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_log
    ADD CONSTRAINT inventory_log_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE RESTRICT;


--
-- Name: inventory_log inventory_log_stock_in_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_log
    ADD CONSTRAINT inventory_log_stock_in_id_fkey FOREIGN KEY (stock_in_id) REFERENCES public.stock_in(id) ON DELETE SET NULL;


--
-- Name: menu_items menu_items_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.menu_items
    ADD CONSTRAINT menu_items_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE RESTRICT;


--
-- Name: order_item_add_ons order_item_add_ons_addon_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_item_add_ons
    ADD CONSTRAINT order_item_add_ons_addon_id_fkey FOREIGN KEY (addon_id) REFERENCES public.add_ons(id) ON DELETE SET NULL;


--
-- Name: order_item_add_ons order_item_add_ons_order_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_item_add_ons
    ADD CONSTRAINT order_item_add_ons_order_item_id_fkey FOREIGN KEY (order_item_id) REFERENCES public.order_items(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_menu_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_menu_id_fkey FOREIGN KEY (menu_id) REFERENCES public.menu_items(id) ON DELETE RESTRICT;


--
-- Name: order_items order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: orders orders_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE RESTRICT;


--
-- Name: orders orders_delivery_fee_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_delivery_fee_assigned_by_fkey FOREIGN KEY (delivery_fee_assigned_by) REFERENCES public.staff(id);


--
-- Name: orders orders_reservation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_reservation_id_fkey FOREIGN KEY (reservation_id) REFERENCES public.reservations(id) ON DELETE SET NULL;


--
-- Name: orders orders_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE SET NULL;


--
-- Name: payments payments_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: reservations reservations_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reservations
    ADD CONSTRAINT reservations_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;


--
-- Name: staff_permissions staff_permissions_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.staff_permissions
    ADD CONSTRAINT staff_permissions_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE CASCADE;


--
-- Name: stock_in stock_in_menu_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stock_in
    ADD CONSTRAINT stock_in_menu_id_fkey FOREIGN KEY (menu_id) REFERENCES public.menu_items(id) ON DELETE CASCADE;


--
-- Name: stock_in stock_in_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stock_in
    ADD CONSTRAINT stock_in_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE RESTRICT;


--
-- PostgreSQL database dump complete
--

\unrestrict sAYQYtdItx6mkC9pCBrK2eCo2LccjUpIwDlty80dvI2z9NLJPEZ97rFg98FwpWo

