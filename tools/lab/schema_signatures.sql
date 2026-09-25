\pset tuples_only on
\pset format unaligned
\set ON_ERROR_STOP on
SET search_path = public, extensions, pg_catalog;
WITH signatures AS (
  SELECT 'column' category,format('%I.%I',c.relname,a.attname) identity,
         concat_ws('|',(SELECT count(*) FROM pg_attribute live
                         WHERE live.attrelid=a.attrelid AND live.attnum>0
                           AND NOT live.attisdropped AND live.attnum<=a.attnum),
                   format_type(a.atttypid,a.atttypmod),a.attnotnull,
                   a.attidentity,a.attgenerated,coalesce(pg_get_expr(ad.adbin,ad.adrelid),'')) definition
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
  LEFT JOIN pg_attrdef ad ON ad.adrelid=a.attrelid AND ad.adnum=a.attnum
  WHERE n.nspname='public' AND c.relkind IN ('r','p')
  UNION ALL
  SELECT 'constraint',format('%I.%I',c.relname,con.conname),
         concat_ws('|',con.contype,con.condeferrable,con.condeferred,con.convalidated,
                   con.connoinherit,pg_get_constraintdef(con.oid,true))
  FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND con.contype IN ('p','u','c','x','f')
  UNION ALL
  SELECT 'constraint_trigger_catalog',format('%I.%I',c.relname,con.conname),
         concat_ws('|',con.condeferrable,con.condeferred,con.convalidated)
  FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND con.contype='t'
  UNION ALL
  SELECT 'index',i.indexrelid::regclass::text,pg_get_indexdef(i.indexrelid)
  FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND NOT EXISTS (SELECT 1 FROM pg_constraint con WHERE con.conindid=i.indexrelid)
  UNION ALL
  SELECT 'function',p.oid::regprocedure::text,pg_get_functiondef(p.oid)
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.prokind IN ('f','p') AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid=p.oid AND d.deptype='e')
  UNION ALL
  SELECT 'view',c.relname,pg_get_viewdef(c.oid,true)||'|'||coalesce(array_to_string(c.reloptions,','),'')
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('v','m')
  UNION ALL
  SELECT 'sequence',c.relname,concat_ws('|',format_type(s.seqtypid,NULL),s.seqincrement,
         s.seqmin,s.seqmax,s.seqstart,s.seqcache,s.seqcycle,coalesce(d.deptype::text,''),
         CASE WHEN d.objid IS NULL THEN '' ELSE format('%I.%I',owner_table.relname,a.attname) END)
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_sequence s ON s.seqrelid=c.oid
  LEFT JOIN pg_depend d ON d.classid='pg_class'::regclass AND d.objid=c.oid
    AND d.refclassid='pg_class'::regclass AND d.deptype IN ('a','i')
  LEFT JOIN pg_class owner_table ON owner_table.oid=d.refobjid
  LEFT JOIN pg_attribute a ON a.attrelid=owner_table.oid AND a.attnum=d.refobjsubid
  WHERE n.nspname='public'
  UNION ALL
  SELECT 'rls',c.relname,concat_ws('|',c.relrowsecurity,c.relforcerowsecurity)
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')
  UNION ALL
  SELECT 'policy',format('%I.%I',c.relname,p.polname),concat_ws('|',p.polpermissive,p.polcmd,
         (SELECT string_agg(CASE WHEN role_oid=0 THEN 'PUBLIC' ELSE r.rolname END,',' ORDER BY role_oid) FROM unnest(p.polroles) role_oid LEFT JOIN pg_roles r ON r.oid=role_oid),
         coalesce(pg_get_expr(p.polqual,p.polrelid),''),coalesce(pg_get_expr(p.polwithcheck,p.polrelid),''))
  FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
  UNION ALL
  SELECT 'trigger',format('%I.%I',c.relname,t.tgname),pg_get_triggerdef(t.oid,true)
  FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND NOT t.tgisinternal
  UNION ALL
  SELECT 'object_acl',format('%s:%I',c.relkind,c.relname),
         string_agg(concat_ws(':',coalesce(grantor.rolname,'PUBLIC'),coalesce(grantee.rolname,'PUBLIC'),
                    a.privilege_type,a.is_grantable),',' ORDER BY coalesce(grantor.rolname,'PUBLIC'),
                    coalesce(grantee.rolname,'PUBLIC'),a.privilege_type,a.is_grantable)
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault(CASE WHEN c.relkind='S' THEN 'S'::"char" ELSE 'r'::"char" END,c.relowner))) a
  LEFT JOIN pg_roles grantor ON grantor.oid=a.grantor LEFT JOIN pg_roles grantee ON grantee.oid=a.grantee
  WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S','f') GROUP BY c.oid,c.relkind,c.relname
  UNION ALL
  SELECT 'function_acl',p.oid::regprocedure::text,
         string_agg(concat_ws(':',coalesce(grantor.rolname,'PUBLIC'),coalesce(grantee.rolname,'PUBLIC'),
                    a.privilege_type,a.is_grantable),',' ORDER BY coalesce(grantor.rolname,'PUBLIC'),
                    coalesce(grantee.rolname,'PUBLIC'),a.privilege_type,a.is_grantable)
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
  LEFT JOIN pg_roles grantor ON grantor.oid=a.grantor LEFT JOIN pg_roles grantee ON grantee.oid=a.grantee
  WHERE n.nspname='public' AND p.prokind IN ('f','p')
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid=p.oid AND d.deptype='e') GROUP BY p.oid
)
SELECT category||'|'||identity||'|'||md5(definition) FROM signatures ORDER BY category,identity;
