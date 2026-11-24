-- Empty duplicate folders (same normalized name, parent, and entity scope) would
-- block the unique index. Keep the oldest row when the extras have no documents
-- or child folders.
WITH ranked AS (
  SELECT
    f.id,
    ROW_NUMBER() OVER (
      PARTITION BY LOWER(BTRIM(f.name)), COALESCE(f."parentId", ''), COALESCE(f."entityType", ''), COALESCE(f."entityId", '')
      ORDER BY f."createdAt" ASC, f.id ASC
    ) AS rn,
    (SELECT COUNT(*) FROM "Document" d WHERE d."folderId" = f.id) AS docs,
    (SELECT COUNT(*) FROM "DocumentFolder" c WHERE c."parentId" = f.id) AS kids
  FROM "DocumentFolder" f
)
DELETE FROM "DocumentFolder" f
USING ranked r
WHERE f.id = r.id AND r.rn > 1 AND r.docs = 0 AND r.kids = 0;

ALTER TABLE "DocumentVersion" ADD COLUMN IF NOT EXISTS "sourceInfo" JSONB;

-- Case-insensitive folder names are unique within a parent and entity scope.
-- COALESCE makes a NULL parent (library root) participate in uniqueness.
CREATE UNIQUE INDEX "DocumentFolder_name_parent_scope_key"
ON "DocumentFolder" (
  LOWER(BTRIM(name)),
  COALESCE("parentId", ''),
  COALESCE("entityType", ''),
  COALESCE("entityId", '')
);
