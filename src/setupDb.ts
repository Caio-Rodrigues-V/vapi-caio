import pool from './db';

async function setupDb() {
  console.log('Starting Database Setup...');

  const connection = await pool.getConnection();

  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS fila_disparo (
        id INT AUTO_INCREMENT PRIMARY KEY,
        telefone VARCHAR(20) NOT NULL,
        cpf VARCHAR(14),
        status ENUM('pendente', 'em_progresso', 'aguardando_resultado', 'concluido', 'falha') DEFAULT 'pendente',
        lote_id VARCHAR(50) NULL,
        call_id VARCHAR(100) NULL,
        tentativas INT DEFAULT 0,
        proxima_tentativa_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        sem_debito BOOLEAN DEFAULT FALSE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_call_id (call_id),
        KEY idx_fila_processamento (status, proxima_tentativa_em, tentativas)
      )
    `);

    const [statusColumn]: any = await connection.query(`
      SELECT COLUMN_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'fila_disparo'
        AND COLUMN_NAME = 'status'
    `);

    if (!statusColumn[0]?.COLUMN_TYPE?.includes('aguardando_resultado')) {
      await connection.query(`
        ALTER TABLE fila_disparo
        MODIFY COLUMN status ENUM(
          'pendente',
          'em_progresso',
          'aguardando_resultado',
          'concluido',
          'falha'
        ) DEFAULT 'pendente'
      `);
    }

    const [callIdColumn]: any = await connection.query(`
      SELECT COUNT(*) AS total
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'fila_disparo'
        AND COLUMN_NAME = 'call_id'
    `);

    if (Number(callIdColumn[0]?.total) === 0) {
      await connection.query('ALTER TABLE fila_disparo ADD COLUMN call_id VARCHAR(100) NULL AFTER lote_id');
      await connection.query('ALTER TABLE fila_disparo ADD UNIQUE KEY unique_call_id (call_id)');
    }

    console.log('Tabela fila_disparo verificada/criada.');

    await connection.query(`
      CREATE TABLE IF NOT EXISTS eventos_webhook (
        id INT AUTO_INCREMENT PRIMARY KEY,
        call_id VARCHAR(100) NOT NULL,
        tipo_evento VARCHAR(50) NOT NULL,
        payload JSON,
        processado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_call_event (call_id, tipo_evento)
      )
    `);
    console.log('Tabela eventos_webhook verificada/criada.');

    await connection.query(`
      CREATE TABLE IF NOT EXISTS auditoria_chamadas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        call_id VARCHAR(100) NOT NULL,
        telefone VARCHAR(20) NOT NULL,
        decisao ENUM('Formaliza', 'Agendar', 'Zero') NOT NULL,
        data_agendamento DATETIME NULL,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_auditoria_call (call_id)
      )
    `);
    console.log('Tabela auditoria_chamadas verificada/criada.');

    console.log('Database Setup complete!');
  } finally {
    connection.release();
    await pool.end();
  }
}

setupDb().catch((error) => {
  console.error('Error setting up DB:', error);
  process.exitCode = 1;
});
