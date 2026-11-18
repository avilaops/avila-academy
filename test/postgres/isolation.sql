\set ON_ERROR_STOP on
BEGIN;
SET LOCAL ROLE academy_app;
SELECT set_config('academy.tenant','academy-verification-a',true);
INSERT INTO academy.academies(id,name) VALUES('academy-verification-a','Teste A');
INSERT INTO academy.courses(id,tenant,title,created)
VALUES('00000000-0000-4000-8000-000000000001','academy-verification-a','Curso A',0);
SELECT set_config('academy.tenant','academy-verification-b',true);
INSERT INTO academy.academies(id,name) VALUES('academy-verification-b','Teste B');
INSERT INTO academy.courses(id,tenant,title,created)
VALUES('00000000-0000-4000-8000-000000000002','academy-verification-b','Curso B',0);
SELECT set_config('academy.tenant','academy-verification-a',true);
DO $test$
BEGIN
  IF (SELECT count(*) FROM academy.courses)<>1 THEN RAISE EXCEPTION 'Isolamento de leitura falhou'; END IF;
  IF EXISTS(SELECT FROM academy.courses WHERE title='Curso B') THEN RAISE EXCEPTION 'Leitura cruzada'; END IF;
  UPDATE academy.courses SET title='Intruso' WHERE id='00000000-0000-4000-8000-000000000002';
  IF FOUND THEN RAISE EXCEPTION 'Alteração cruzada'; END IF;
  DELETE FROM academy.courses WHERE id='00000000-0000-4000-8000-000000000002';
  IF FOUND THEN RAISE EXCEPTION 'Exclusão cruzada'; END IF;
  BEGIN
    INSERT INTO academy.courses(id,tenant,title,created) VALUES(gen_random_uuid(),'academy-verification-b','Intruso',0);
    RAISE EXCEPTION 'Inserção cruzada foi aceita';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO academy.modules(id,tenant,course_id,title,position)
    VALUES(gen_random_uuid(),'academy-verification-a','00000000-0000-4000-8000-000000000002','Módulo cruzado',0);
    RAISE EXCEPTION 'Vínculo cruzado foi aceito';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN
    CREATE TABLE academy.prohibited(id integer);
    RAISE EXCEPTION 'Usuário da aplicação recebeu permissão DDL';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $test$;
SELECT set_config('academy.tenant','',true);
DO $test$
BEGIN
  IF EXISTS(SELECT FROM academy.courses) THEN RAISE EXCEPTION 'Consulta sem academia retornou dados'; END IF;
END $test$;
ROLLBACK;
SELECT 'PostgreSQL: isolamento e permissões verificados' AS result;
