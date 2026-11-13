WITH cleaned AS (
    SELECT trim(regexp_replace(
      regexp_replace(lower(regexp_replace(COALESCE(worker_name, ''), '\([^)]*\)', ' ', 'g')), '[^a-z]', ' ', 'g'),
      '\s+', ' ', 'g'
    )) AS value
  )
  SELECT CASE value
    WHEN 'daniel guiterrez' THEN 'daniel gutierrez'
    WHEN 'cruz eduardo deleon' THEN 'eduardo c deleon'
    WHEN 'eliezar william sosa' THEN 'eliezer william salinas sosa'
    WHEN 'greg maslyk' THEN 'gregory maslyk'
    WHEN 'henry ledezma' THEN 'henry ledezma mireles'
    WHEN 'john chitwood' THEN 'john chittwood'
    WHEN 'jorge reyes' THEN 'jorge rodriguez reyes'
    WHEN 'jose dozal' THEN 'jose l dozal'
    WHEN 'josua datray' THEN 'joshua datray'
    WHEN 'juan gaucin' THEN 'juan a gaucin'
    WHEN 'roger davis' THEN 'roger d davis'
    WHEN 'jesse valeriano iii' THEN 'jesse valeriano'
    ELSE value
  END
  FROM cleaned;