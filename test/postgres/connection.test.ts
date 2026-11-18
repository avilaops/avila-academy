import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PostgresDatabase } from '../../persistence/postgres.ts';
import { PostgresCourses } from '../../persistence/courses.ts';

test('pool PostgreSQL preserva academia, rollback e ordenação concorrente', async t => {
  assert(process.env.DATABASE_URL, 'Configure DATABASE_URL para o usuário restrito do banco de teste.');
  const database = new PostgresDatabase(process.env.DATABASE_URL, { maxConnections: 2 });
  const courses = new PostgresCourses(database);
  const suffix = randomUUID().slice(0, 8);
  const tenants = ['adapter-a-' + suffix, 'adapter-b-' + suffix];
  t.after(async () => {
    try {
      for (const tenant of tenants) {
        await database.transaction(tenant, async connection => {
          await connection.query('DELETE FROM modules');
          await connection.query('DELETE FROM courses');
          await connection.query('DELETE FROM academies');
        });
      }
    } finally { await database.close(); }
  });
  for (const tenant of tenants) {
    await database.transaction(tenant, connection => connection.query(
      'INSERT INTO academies(id,name) VALUES($1,$2)', [tenant, tenant]
    ));
  }
  const first = await courses.create(tenants[0], 'Curso A');
  const second = await courses.create(tenants[1], 'Curso B');
  const parallel = await Promise.all([
    courses.outline(tenants[0]), courses.outline(tenants[1]),
    courses.outline(tenants[0]), courses.outline(tenants[1])
  ]);
  assert.deepEqual(parallel.map(rows => rows.map(row => row.title)), [['Curso A'], ['Curso B'], ['Curso A'], ['Curso B']]);
  assert.equal(await courses.addModule(tenants[0], second.id, 'Intruso'), null);
  const modules = await Promise.all(Array.from({ length: 5 }, (_, index) =>
    courses.addModule(tenants[0], first.id, 'Módulo ' + index)
  ));
  assert.deepEqual(modules.map(module => module.position).sort(), [0, 1, 2, 3, 4]);
  const ids = modules.sort((a,b) => b.position - a.position).map(module => module.id);
  await courses.reorderModules(tenants[0], first.id, ids);
  const reordered = await courses.outline(tenants[0]);
  assert.deepEqual(reordered[0].modules.map(module => module.id), ids);
  await assert.rejects(courses.reorderModules(tenants[0], first.id, [ids[0], ids[0]]));
  assert.deepEqual((await courses.outline(tenants[0]))[0].modules.map(module => module.id), ids);
  await assert.rejects(database.transaction(tenants[0], async connection => {
    await connection.query('INSERT INTO courses(id,tenant,title,created) VALUES($1,$2,$3,$4)',
      [randomUUID(), tenants[0], 'Deve reverter', Date.now()]);
    throw new Error('Interrupção de teste');
  }), /Interrupção/);
  assert.equal((await courses.outline(tenants[0])).length, 1);
  // A swallowed SQL error must never look like a committed operation.
  await assert.rejects(database.transaction(tenants[0], async connection => {
    try { await connection.query('SELECT nonexistent_column FROM courses'); } catch {}
    return 'não pode confirmar';
  }), /não foi confirmada/);
  let expired;
  await database.transaction(tenants[0], async connection => { expired = connection; });
  await assert.rejects(expired.query('SELECT 1'), /encerrada/);
  await assert.rejects(database.transaction('bad tenant', async () => {}), /inválida/);
  assert.equal((await courses.outline(tenants[1]))[0].id, second.id);
});

test('conexão privilegiada é recusada pela camada da aplicação',
  { skip: !process.env.POSTGRES_ADMIN_TEST_URL }, async t => {
    const database = new PostgresDatabase(process.env.POSTGRES_ADMIN_TEST_URL);
    t.after(() => database.close());
    await assert.rejects(database.transaction('verification', connection => connection.query('SELECT 1')),
      /usuário restrito/);
  });
