import pkg from 'pg';
const { Pool } = pkg;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not set in environment');
}

const pool = new Pool({ connectionString });

export default pool;

export async function query(text: string, params?: any[]) {
  const res = await pool.query(text, params);
  return res;
}
