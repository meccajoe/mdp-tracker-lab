-- Seed COGS categories from the Key tab
INSERT INTO cogs_categories (code, name) VALUES
  ('500100', 'Production Labor'),
  ('500150', 'I&D Labor'),
  ('500200', 'Fabrication'),
  ('500300', 'On-site Show Services'),
  ('500400', 'Shipping/Trucking'),
  ('500450', 'Fuel Costs'),
  ('500500', 'Storage'),
  ('500600', 'Graphics'),
  ('500700', 'Design Labor'),
  ('500800', 'Rental'),
  ('500900', 'Forklifts and Trucks'),
  ('501000', 'Show Prep'),
  ('501200', 'Fab Supplies and Small Equipment'),
  ('501300', 'Design'),
  ('501400', 'Install/Strike'),
  ('501500', 'Production Meals'),
  ('501700', 'Machinery Repairs & Maintenance'),
  ('505000', 'Travel'),
  ('500510', 'Travel-Hotels'),
  ('500520', 'Travel-Per Diem'),
  ('500530', 'Travel-Airfare & Baggage Fees')
ON CONFLICT (code) DO NOTHING;
