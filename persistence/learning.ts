import { randomUUID } from 'node:crypto';

export class PostgresLearning {
  private database;
  constructor(database) { this.database = database; }

  async enroll(tenant, courseId, subject) {
    if(typeof subject!=='string'||!subject.trim()||subject.length>255)throw new Error('Aluno inválido.');
    return this.database.transaction(tenant,async connection=>{
      const course=await connection.query('SELECT id FROM courses WHERE id=$1',[courseId]);
      if(!course.rowCount)return null;
      const result=await connection.query(`INSERT INTO enrollments(id,tenant,course_id,subject)
        VALUES($1,$2,$3,$4) ON CONFLICT(tenant,course_id,subject)
        DO UPDATE SET active=true RETURNING id,course_id,subject,active`,
        [randomUUID(),tenant,courseId,subject.trim()]);
      return result.rows[0];
    });
  }

  async setActive(tenant, enrollmentId, active) {
    if(typeof active!=='boolean')throw new Error('Situação de matrícula inválida.');
    return this.database.transaction(tenant,async connection=>
      (await connection.query('UPDATE enrollments SET active=$1 WHERE id=$2 RETURNING id,active',[active,enrollmentId])).rows[0]??null);
  }

  async listEnrollments(tenant) {
    return this.database.transaction(tenant,async connection=>
      (await connection.query('SELECT id,course_id,subject,active FROM enrollments ORDER BY id')).rows);
  }

  async outline(tenant, subject) {
    return this.database.transaction(tenant,async connection=>{
      const courses=(await connection.query(`SELECT c.id,c.title,c.description,e.id AS enrollment_id
        FROM courses c JOIN enrollments e ON e.tenant=c.tenant AND e.course_id=c.id
        WHERE e.subject=$1 AND e.active ORDER BY c.created,c.id`,[subject])).rows;
      for(const course of courses){
        course.modules=(await connection.query('SELECT id,title,position FROM modules WHERE course_id=$1 ORDER BY position,id',[course.id])).rows;
        for(const module of course.modules){
          module.lessons=(await connection.query(`SELECT l.id,l.title,l.description,l.position,
            COALESCE(p.seconds,0) AS seconds,COALESCE(p.completed,false) AS completed
            FROM lessons l JOIN recordings r ON r.tenant=l.tenant AND r.id=l.recording_id AND r.state='ready'
            LEFT JOIN progress p ON p.tenant=l.tenant AND p.lesson_id=l.id AND p.enrollment_id=$1
            WHERE l.module_id=$2 AND l.published ORDER BY l.position,l.id`,[course.enrollment_id,module.id])).rows;
        }
      }
      return courses;
    },'REPEATABLE READ');
  }

  async access(tenant, subject, lessonId) {
    return this.database.transaction(tenant,connection=>this.findAccess(connection,subject,lessonId));
  }

  private async findAccess(connection,subject,lessonId) {
    return (await connection.query(`SELECT l.id,l.recording_id,e.id AS enrollment_id
      FROM lessons l JOIN modules m ON m.tenant=l.tenant AND m.id=l.module_id
      JOIN enrollments e ON e.tenant=m.tenant AND e.course_id=m.course_id
      JOIN recordings r ON r.tenant=l.tenant AND r.id=l.recording_id AND r.state='ready'
      WHERE e.subject=$1 AND e.active AND l.published AND l.id=$2
      FOR SHARE OF e,l,r`,[subject,lessonId])).rows[0]??null;
  }

  async saveProgress(tenant,subject,lessonId,seconds,completed) {
    if(!Number.isFinite(seconds)||seconds<0||seconds>604800||typeof completed!=='boolean')throw new Error('Progresso inválido.');
    return this.database.transaction(tenant,async connection=>{
      // Share locks keep access stable until the progress write commits.
      const access=await this.findAccess(connection,subject,lessonId);
      if(!access)return false;
      await connection.query(`INSERT INTO progress(tenant,enrollment_id,lesson_id,seconds,completed,updated)
        VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(tenant,enrollment_id,lesson_id)
        DO UPDATE SET seconds=EXCLUDED.seconds,completed=progress.completed OR EXCLUDED.completed,updated=EXCLUDED.updated`,
        [tenant,access.enrollment_id,lessonId,seconds,completed,Date.now()]);
      return true;
    });
  }
}
