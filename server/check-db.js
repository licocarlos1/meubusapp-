/**
 * Verifica a conexão com o PostgreSQL e lista as tabelas existentes.
 * Rode DENTRO da VPS (onde o banco está acessível):  node check-db.js
 */
import { pool } from './db.js';

try {
  const info = await pool.query('SELECT current_database() AS db, version() AS v');
  console.log('✅ Conectado ao banco:', info.rows[0].db);
  console.log('   ', info.rows[0].v.split(',')[0]);

  const tables = await pool.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name"
  );
  const names = tables.rows.map((r) => r.table_name);
  console.log(`\n📋 Tabelas (${names.length}):`, names.join(', ') || '(nenhuma)');

  const expected = ['lojas', 'brindes', 'anuncios', 'linhas', 'resgates', 'perfis',
    'historico_transmissoes', 'historico_coordenadas', 'onibus_posicoes', 'configuracoes'];
  const missing = expected.filter((t) => !names.includes(t));
  if (missing.length) {
    console.log('\n⚠️  Tabelas faltando:', missing.join(', '));
    console.log('   Execute os arquivos .sql descritos no SETUP_BACKEND.md');
  } else {
    console.log('\n✅ Todas as tabelas esperadas existem!');
  }
} catch (e) {
  console.error('❌ Falha na conexão:', e.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
