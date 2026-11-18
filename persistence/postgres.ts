import { Pool } from 'pg';

export class PostgresDatabase {
  private pool;
  private closed = false;

  constructor(connectionString, options = {}) {
    if (!connectionString || !/^postgres(ql)?:\/\//.test(connectionString)) {
      throw new Error('Configure uma conexão PostgreSQL válida.');
    }
    this.pool = new Pool({
      connectionString,
      max: options.maxConnections ?? 10,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      application_name: 'avila-academy'
    });
    this.pool.on('error', () => {
      console.error('Uma conexão ociosa da Academy com PostgreSQL foi interrompida.');
    });
  }

  async transaction(tenant, operation, isolation = 'READ COMMITTED') {
    if (!['READ COMMITTED','REPEATABLE READ','SERIALIZABLE'].includes(isolation)) throw new Error('Isolamento inválido.');
    if (this.closed) throw new Error('A conexão com o banco foi encerrada.');
    if (typeof tenant !== 'string' || !/^[a-z0-9][a-z0-9-]{1,62}$/.test(tenant)) {
      throw new Error('Academia inválida.');
    }
    const client = await this.pool.connect();
    let active = true;
    let discard = false;
    try {
      await client.query('BEGIN ISOLATION LEVEL '+isolation);
      await client.query("SET LOCAL search_path = academy, pg_catalog");
      await client.query("SET LOCAL lock_timeout = '5s'");
      await client.query("SET LOCAL statement_timeout = '15s'");
      const role = await client.query(`SELECT rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole AS privileged,
        (SELECT nspowner=pg_roles.oid FROM pg_namespace WHERE nspname='academy') AS owns_schema
        FROM pg_roles WHERE rolname=current_user`);
      if (role.rows[0]?.privileged || role.rows[0]?.owns_schema || !role.rowCount) {
        throw new Error('Use o usuário restrito da aplicação para acessar o banco.');
      }
      await client.query("SELECT set_config('academy.tenant',$1,true)", [tenant]);
      const connection = {
        query: async (sql, values = []) => {
          if (!active) throw new Error('A transação já foi encerrada.');
          return client.query(sql, values);
        }
      };
      const result = await operation(connection);
      active = false;
      const committed = await client.query('COMMIT');
      if (committed.command !== 'COMMIT') throw new Error('A transação não foi confirmada.');
      return result;
    } catch (error) {
      active = false;
      try { await client.query('ROLLBACK'); } catch { discard = true; }
      throw error;
    } finally {
      active = false;
      client.release(discard);
    }
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    await this.pool.end();
  }
}
