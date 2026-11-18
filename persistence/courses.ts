import { randomUUID } from 'node:crypto';

// The HTTP adapter will use these methods after the remaining data services are migrated.
export class PostgresCourses {
  private database;
  constructor(database) { this.database = database; }

  async create(tenant, title, description = '') {
    if (typeof title !== 'string' || !title.trim() || title.length > 160 ||
      typeof description !== 'string' || description.length > 10000) {
      throw new Error('Dados do curso inválidos.');
    }
    return this.database.transaction(tenant, async connection => {
      const id = randomUUID();
      const result = await connection.query(
        'INSERT INTO courses(id,tenant,title,description,created) VALUES($1,$2,$3,$4,$5) RETURNING id,title,description',
        [id, tenant, title.trim(), description, Date.now()]
      );
      return result.rows[0];
    });
  }

  async outline(tenant) {
    return this.database.transaction(tenant, async connection => {
      // One repeatable snapshot prevents mismatched module/lesson lists during concurrent edits.
      const courses = (await connection.query(
        'SELECT id,title,description,created FROM courses ORDER BY created,id'
      )).rows;
      const modules = (await connection.query(
        'SELECT id,course_id,title,position FROM modules ORDER BY position,id'
      )).rows;
      const lessons = (await connection.query(
        'SELECT id,module_id,recording_id,title,description,position,published FROM lessons ORDER BY position,id'
      )).rows;
      return courses.map(course => ({
        ...course, created: Number(course.created),
        modules: modules.filter(module => module.course_id === course.id).map(module => ({
          ...module, lessons: lessons.filter(lesson => lesson.module_id === module.id)
        }))
      }));
    }, 'REPEATABLE READ');
  }

  async addModule(tenant, courseId, title) {
    if (typeof title !== 'string' || !title.trim() || title.length > 160) throw new Error('Nome do módulo inválido.');
    return this.database.transaction(tenant, async connection => {
      // All ordering operations lock the parent course, including concurrent module creation.
      const parent = await connection.query('SELECT id FROM courses WHERE id=$1 FOR UPDATE', [courseId]);
      if (!parent.rowCount) return null;
      const result = await connection.query(`INSERT INTO modules(id,tenant,course_id,title,position)
        SELECT $1,$2,$3,$4,COALESCE(MAX(position),-1)+1 FROM modules WHERE course_id=$3
        RETURNING id,title,position`, [randomUUID(), tenant, courseId, title.trim()]);
      return result.rows[0];
    });
  }

  async reorderModules(tenant, courseId, ids) {
    if (!Array.isArray(ids) || ids.length > 10000 || ids.some(id => typeof id !== 'string')) {
      throw new Error('Lista de módulos inválida.');
    }
    return this.database.transaction(tenant, async connection => {
      const parent = await connection.query('SELECT id FROM courses WHERE id=$1 FOR UPDATE', [courseId]);
      if (!parent.rowCount) return false;
      const existing = (await connection.query('SELECT id FROM modules WHERE course_id=$1', [courseId])).rows.map(row => row.id);
      if (existing.length !== ids.length || new Set(ids).size !== ids.length || !ids.every(id => existing.includes(id))) {
        throw new Error('Envie a lista completa de módulos sem duplicações.');
      }
      await connection.query(`UPDATE modules SET position=ordered.position-1
        FROM unnest($1::uuid[]) WITH ORDINALITY AS ordered(id,position)
        WHERE modules.id=ordered.id AND modules.course_id=$2`, [ids, courseId]);
      return true;
    });
  }
}

