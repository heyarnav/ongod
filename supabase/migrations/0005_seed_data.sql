-- ============================================================================
-- on god. — 0005_seed_data.sql
--
-- Idempotent: every insert is guarded by `on conflict ... do nothing`, so
-- running this repeatedly is a no-op rather than a duplicate factory.
--
-- Seeds: the three realms, HUMAN / 001 — FORM with its variants and images,
-- the editable site copy, and the founding dispatches.
--
-- Deliberately NOT seeded: customer accounts and orders. Those come from real
-- people using the real flow. A fabricated order would put a fake address
-- into an order snapshot and make the historical-address guarantee untestable.
--
-- Images reference `storage_path` inside the `ongod-media` bucket;
-- `public_url` is filled in by `npm run media:import`, which uploads the
-- bytes. The read layer derives a public URL from storage_path regardless, so
-- the catalogue renders correctly even before that script has been run.
-- ============================================================================

-- ── The three realms ──────────────────────────────────────────────────────
insert into public.collections
  (slug, name, number, subtitle, description, hero_image, artwork, sort_order, published)
values
  (
    'human',
    'HUMAN',
    '001',
    'What are we?',
    'A study of the body. Its structure, its limits, its decay. Not a celebration of perfection — a documentation of becoming.',
    'seed/hero-bust.jpg',
    'seed/collection-human.jpg',
    1,
    true
  ),
  (
    'celestial',
    'CELESTIAL',
    '002',
    'Where are we?',
    'Orbital mechanics of a life. The body measured against the sky it rotates beneath — coordinates, tides, cycles.',
    'seed/collection-celestial.jpg',
    'seed/collection-celestial.jpg',
    2,
    true
  ),
  (
    'divine',
    'DIVINE',
    '003',
    'What is above us?',
    'The veiled question. Whatever stands above the body and the sky — documented at a respectful distance.',
    'seed/collection-divine.jpg',
    'seed/collection-divine.jpg',
    3,
    true
  )
on conflict (slug) do nothing;

-- ── HUMAN / 001 — FORM ────────────────────────────────────────────────────
insert into public.products (
  slug, collection_id, archive_number, name, subtitle,
  description, story, purpose, limitation, state, adaptation,
  price, compare_price, currency, model, sizes, featured, status,
  drop_status, edition_label,
  pre_order_starts_at, pre_order_ends_at,
  production_period, dispatch_period, pre_order_notice,
  in_production_message, fulfilling_message, sold_out_message,
  seo_title, seo_description, og_image, sort_order
)
select
  'human-001-form',
  c.id,
  '001',
  'FORM',
  'The first object in the archive.',
  'Heavyweight garment-washed tee. Front chest carries the anatomical plate — flayed figure, technical overlay, crimson annotations. Back carries the spine diagram. Screen-printed, distressed finish.',
  'The body breaks. Repairs. Adapts. Repeats.',
  'PERFECTION',
  'MORTALITY',
  'INCOMPLETE',
  'ONGOING',
  349900,
  null,
  'INR',
  '/models/specimen.glb',
  'XS,S,M,L,XL,XXL',
  true,
  'PUBLISHED',
  'PRE_ORDER',
  'FIRST EDITION',
  -- open now, closes in seven days
  now() - interval '1 day',
  now() + interval '7 days',
  'OCTOBER 2026',
  'NOVEMBER 2026',
  'THIS IS A PRE-ORDER. Your piece will be produced as part of the first edition after the pre-order period closes. It will not ship immediately after purchase.',
  'THE FIRST EDITION IS CURRENTLY BEING PRODUCED.',
  'ORDERS ARE BEING PREPARED FOR DISPATCH.',
  'THE ARCHIVE IS CLOSED.',
  'HUMAN / 001 — FORM | on god.',
  'The first object in the archive. A study of the body, its limits, and its potential.',
  'seed/product-front.webp',
  10
from public.collections c
where c.slug = 'human'
on conflict (slug) do nothing;

-- ── Variants and inventory ────────────────────────────────────────────────
insert into public.product_variants (product_id, size, sku, stock, active)
select
  p.id,
  v.size,
  'OG-001-' || v.size,
  v.stock,
  true
from public.products p
cross join (
  values
    ('XS', 4),
    ('S',  6),
    ('M', 10),
    ('L',  8),
    ('XL', 4),
    ('XXL', 2)
) as v (size, stock)
where p.slug = 'human-001-form'
on conflict (product_id, size) do nothing;

-- ── Product imagery ───────────────────────────────────────────────────────
insert into public.product_images (product_id, storage_path, alt_text, type, sort_order)
select
  p.id,
  i.storage_path,
  i.alt_text,
  i.type,
  i.sort_order
from public.products p
cross join (
  values
    ('seed/product-front.webp',    'HUMAN / 001 FORM — front plate',      'front',    0),
    ('seed/product-back.webp',     'HUMAN / 001 FORM — reverse plate',    'back',     1),
    ('seed/human-001-artwork.jpg', 'HUMAN / 001 FORM — full artwork plate','artwork',  2)
) as i (storage_path, alt_text, type, sort_order)
where p.slug = 'human-001-form'
on conflict (product_id, storage_path) do nothing;

-- ── Editable site copy ────────────────────────────────────────────────────
insert into public.site_settings (key, value, group_name, label, kind, sort_order)
values
  ('announcement',    'FIRST EDITION — PRE-ORDER OPEN — HUMAN / 001 — FORM', 'Banner',   'Announcement banner',            'text',     1),
  ('home_kicker',     'A STUDY IN EXISTENCE',                                   'Home',     'Home kicker — brand statement', 'text',     2),
  ('home_line_1',     'THE HUMAN',                                              'Home',     'Home headline — line 1',         'text',     3),
  ('home_line_2',     'EXPERIENCE,',                                            'Home',     'Home headline — line 2',         'text',     4),
  ('home_line_3',     'DOCUMENTED.',                                            'Home',     'Home headline — line 3',         'text',     5),
  ('home_sub',        'DISCIPLINE CREATES FREEDOM.',                            'Home',     'Home sub statement',             'text',     6),
  ('home_note',       'A NEW ARCHIVE. THREE REALMS. ONE CONTINUUM. THE STUDY HAS BEGUN.', 'Home', 'Home closing note',       'text',     7),
  ('newdrop_title',   'NEW DROP',                                               'New drop', 'New drop — title',               'text',     8),
  ('newdrop_kicker',  '001',                                                    'New drop', 'New drop — kicker number',       'text',     9),
  ('newdrop_label',   'HUMAN / 001 — FORM',                                     'New drop', 'New drop — object label',        'text',    10),
  ('newdrop_body',    'The first object in the archive. A study of the body, its limits, and its potential. Produced as a first edition once the pre-order window closes.', 'New drop', 'New drop — body copy', 'textarea', 11),
  ('archive_note',    'THREE REALMS, ONE CONTINUUM.',                           'Archive',  'Archive index note',             'text',    12),
  ('footer_motto',    'NOT JUST CLOTHING. A WAY OF BEING.',                     'Brand',    'Footer motto',                   'text',    13),
  ('about_body',      'on god. is a clothing archive documenting the human experience through three realms: HUMAN, CELESTIAL and DIVINE.', 'Brand', 'About paragraph', 'textarea', 14),
  ('contact_email',   'archive@ongod.in',                                       'Brand',    'Contact email',                  'text',    15),
  ('instagram_url',   'https://instagram.com/ongod',                            'Brand',    'Instagram URL',                  'text',    16)
on conflict (key) do nothing;

-- ── The founding dispatches ───────────────────────────────────────────────
insert into public.journal_entries
  (slug, number, title, dek, body, read_minutes, published, published_at)
values
  (
    'on-beginnings',
    '001',
    'ON BEGINNINGS',
    'Why an archive, and not a brand.',
    E'Every clothing label begins the same way — a moodboard, a manufacturer, a launch calendar. We chose a different first document: a register.\n\nAn archive does not sell. It records. It assigns numbers, notes conditions, states what was observed and when. The garments in this archive are records first and garments second — the object is simply the part of the study you can wear.\n\nHUMAN / 001 — FORM is therefore not a "product launch." It is the opening entry. A heavyweight cotton tee, printed with a flayed figure, an eye, a spine, a heart — the anatomy of a person rendered as a technical plate. It is worn against the skin it diagrams.\n\nWhat we can promise is method. Each release will be numbered. Each number will belong to a realm of the study: HUMAN, what are we; CELESTIAL, where are we; DIVINE, what is above us. The method outruns the catalog. At this writing, one object exists. That is not scarcity theatre — it is simply the state of the documentation.\n\nBegin where every archive begins. At the first entry.',
    3,
    true,
    now() - interval '2 days'
  ),
  (
    'the-body-as-document',
    '002',
    'THE BODY AS DOCUMENT',
    'Notes toward HUMAN — the first realm of the study.',
    E'The anatomists drew the body in sections because that is how understanding arrives: not all at once, but plate by plate. Muscle under skin. Vessel under muscle. Frame under everything.\n\nHUMAN, the first realm, adopts the same discipline. Its question is the oldest one in the register — what are we — and its instruments are borrowed from the dissection room: the measurement line, the annotation, the margin note in crimson ink where an observer marked an anomaly.\n\nThe crimson markings on FORM are not decoration. In the plates we studied, red was the color of intervention — the hand of the observer on the body of the specimen. When you see a crimson line on our garments or on this site, it marks a place where the study touched its subject: a measurement taken, a limitation recorded, a repair noted.\n\nThe body breaks. Repairs. Adapts. Repeats. That sentence is the whole methodology. FORM is its first plate.',
    4,
    true,
    now() - interval '1 day'
  ),
  (
    'on-crimson',
    '003',
    'ON CRIMSON',
    'A note on the single color this archive permits itself.',
    E'The archive is kept in charcoal and bone — the color of plate ground and paper stock. One ink is permitted beyond them: a muted crimson, mixed toward oxide, never toward signal red.\n\nCrimson in this system means observation. It is the color of the annotation line, the registration mark, the current state of a release, the stage of an order moving toward dispatch. Wherever it appears, something is being watched, measured, or worked on.\n\nThat is the entire rule. No glow. No urgency. A restrained red that behaves like ink on vellum — because that is what it is.',
    2,
    true,
    now() - interval '12 hours'
  )
on conflict (slug) do nothing;