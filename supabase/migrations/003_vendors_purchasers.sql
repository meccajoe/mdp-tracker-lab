-- Vendors and Purchasers tables for combobox lookups

CREATE TABLE vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE purchasers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  initials text NOT NULL UNIQUE,
  full_name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_vendors_active ON vendors(active);
CREATE INDEX idx_purchasers_active ON purchasers(active);

-- RLS
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchasers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can do everything on vendors"
  ON vendors FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can do everything on purchasers"
  ON purchasers FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Seed purchasers from PM_NAMES
INSERT INTO purchasers (initials, full_name) VALUES
  ('VW', 'Vanessa Warfield'),
  ('GM', 'Greg Mayberry'),
  ('MS', 'Molly Strader'),
  ('AS', 'Aaron Schindehette'),
  ('NG', 'Nick Gonzales'),
  ('PM', 'Paul Mecca'),
  ('KM', 'Kristina Morland'),
  ('KS', 'Kristin Schilling'),
  ('CC', 'Carlos Chaidez'),
  ('MM', 'Maria Mecca');
