BEGIN;
CREATE SCHEMA IF NOT EXISTS academy;
REVOKE ALL ON SCHEMA academy FROM PUBLIC;
CREATE TABLE IF NOT EXISTS academy.schema_migrations (
  version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now()
);
DO $migration$
BEGIN
  IF EXISTS (SELECT FROM academy.schema_migrations WHERE version=1) THEN RETURN; END IF;
  CREATE TABLE academy.academies (
    id text PRIMARY KEY CHECK(id ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
    name text NOT NULL CHECK(length(name) BETWEEN 1 AND 160),
    color text NOT NULL DEFAULT '#195f52' CHECK(color ~ '^#[a-fA-F0-9]{6}$'),
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE academy.domains (
    hostname text PRIMARY KEY CHECK(hostname=lower(hostname) AND hostname !~ '[/ :]' AND length(hostname)<=253),
    tenant text NOT NULL REFERENCES academy.academies(id),
    verified_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE academy.members (
    tenant text NOT NULL REFERENCES academy.academies(id),
    subject text NOT NULL CHECK(length(subject) BETWEEN 1 AND 255),
    role text NOT NULL CHECK(role IN ('admin','producer','student')),
    active boolean NOT NULL DEFAULT true, PRIMARY KEY(tenant,subject)
  );
  CREATE TABLE academy.recordings (
    id uuid PRIMARY KEY, tenant text NOT NULL REFERENCES academy.academies(id),
    title text NOT NULL CHECK(length(title) BETWEEN 1 AND 160),
    course text NOT NULL, unit text NOT NULL, mime text NOT NULL,
    state text NOT NULL DEFAULT 'uploading' CHECK(state IN ('uploading','processing','ready','failed')),
    next_chunk integer NOT NULL DEFAULT 0 CHECK(next_chunk>=0),
    bytes bigint NOT NULL DEFAULT 0 CHECK(bytes>=0),
    created bigint NOT NULL, UNIQUE(tenant,id)
  );
  CREATE TABLE academy.media_parts (
    tenant text NOT NULL, recording_id uuid NOT NULL, number integer NOT NULL CHECK(number>=0),
    bytes integer NOT NULL CHECK(bytes BETWEEN 1 AND 8388608),
    digest text NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'),
    object_key text NOT NULL CHECK(starts_with(object_key,tenant||'/')),
    PRIMARY KEY(tenant,recording_id,number), UNIQUE(tenant,object_key),
    FOREIGN KEY(tenant,recording_id) REFERENCES academy.recordings(tenant,id)
  );
  CREATE TABLE academy.courses (
    id uuid PRIMARY KEY, tenant text NOT NULL REFERENCES academy.academies(id),
    title text NOT NULL CHECK(length(title) BETWEEN 1 AND 160),
    description text NOT NULL DEFAULT '' CHECK(length(description)<=10000),
    created bigint NOT NULL, UNIQUE(tenant,id)
  );
  CREATE TABLE academy.modules (
    id uuid PRIMARY KEY, tenant text NOT NULL, course_id uuid NOT NULL,
    title text NOT NULL CHECK(length(title) BETWEEN 1 AND 160), position integer NOT NULL CHECK(position>=0),
    UNIQUE(tenant,id), FOREIGN KEY(tenant,course_id) REFERENCES academy.courses(tenant,id)
  );
  CREATE TABLE academy.lessons (
    id uuid PRIMARY KEY, tenant text NOT NULL, module_id uuid NOT NULL, recording_id uuid NOT NULL,
    title text NOT NULL CHECK(length(title) BETWEEN 1 AND 160),
    description text NOT NULL DEFAULT '' CHECK(length(description)<=10000),
    position integer NOT NULL CHECK(position>=0), published boolean NOT NULL DEFAULT false,
    UNIQUE(tenant,id), FOREIGN KEY(tenant,module_id) REFERENCES academy.modules(tenant,id),
    FOREIGN KEY(tenant,recording_id) REFERENCES academy.recordings(tenant,id)
  );
  CREATE TABLE academy.attachments (
    id uuid PRIMARY KEY, tenant text NOT NULL, lesson_id uuid NOT NULL,
    name text NOT NULL CHECK(length(name) BETWEEN 1 AND 180), mime text NOT NULL,
    bytes integer NOT NULL CHECK(bytes BETWEEN 1 AND 26214400),
    digest text NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'),
    object_key text NOT NULL CHECK(starts_with(object_key,tenant||'/')),
    UNIQUE(tenant,object_key), FOREIGN KEY(tenant,lesson_id) REFERENCES academy.lessons(tenant,id)
  );
  CREATE TABLE academy.enrollments (
    id uuid PRIMARY KEY, tenant text NOT NULL, course_id uuid NOT NULL,
    subject text NOT NULL CHECK(length(subject) BETWEEN 1 AND 255), active boolean NOT NULL DEFAULT true,
    UNIQUE(tenant,id), UNIQUE(tenant,course_id,subject),
    FOREIGN KEY(tenant,course_id) REFERENCES academy.courses(tenant,id)
  );
  CREATE TABLE academy.progress (
    tenant text NOT NULL, enrollment_id uuid NOT NULL, lesson_id uuid NOT NULL,
    seconds double precision NOT NULL DEFAULT 0 CHECK(seconds BETWEEN 0 AND 604800),
    completed boolean NOT NULL DEFAULT false, updated bigint NOT NULL,
    PRIMARY KEY(tenant,enrollment_id,lesson_id),
    FOREIGN KEY(tenant,enrollment_id) REFERENCES academy.enrollments(tenant,id),
    FOREIGN KEY(tenant,lesson_id) REFERENCES academy.lessons(tenant,id)
  );
  CREATE INDEX domains_tenant ON academy.domains(tenant);
  CREATE INDEX courses_tenant_created ON academy.courses(tenant,created,id);
  CREATE INDEX recordings_tenant_created ON academy.recordings(tenant,created,id);
  CREATE INDEX modules_course_position ON academy.modules(tenant,course_id,position,id);
  CREATE INDEX lessons_module_position ON academy.lessons(tenant,module_id,position,id);
  CREATE INDEX attachments_lesson ON academy.attachments(tenant,lesson_id);
  CREATE INDEX enrollments_subject ON academy.enrollments(tenant,subject) WHERE active;
  INSERT INTO academy.schema_migrations(version) VALUES(1);
END
$migration$;
DO $policies$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['academies','domains','members','recordings','media_parts','courses','modules','lessons','attachments','enrollments','progress']
  LOOP
    EXECUTE format('ALTER TABLE academy.%I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE academy.%I FORCE ROW LEVEL SECURITY',table_name);
    IF NOT EXISTS (SELECT FROM pg_policies WHERE schemaname='academy' AND tablename=table_name AND policyname='tenant_isolation') THEN
      EXECUTE format('CREATE POLICY tenant_isolation ON academy.%I USING (%I = current_setting(''academy.tenant'',true)) WITH CHECK (%I = current_setting(''academy.tenant'',true))',
        table_name,CASE WHEN table_name='academies' THEN 'id' ELSE 'tenant' END,
        CASE WHEN table_name='academies' THEN 'id' ELSE 'tenant' END);
    END IF;
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON academy.%I TO academy_app',table_name);
  END LOOP;
END
$policies$;
GRANT USAGE ON SCHEMA academy TO academy_app;
COMMIT;
