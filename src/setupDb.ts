import pool from './db';

async function setupDb() {
  console.log('Starting Database Setup...');
  
  try {
    const connection = await pool.getConnection();

    // Tabela fila_disparo
    await connection.query(`
      CREATE TABLE IF NOT EXISTS fila_disparo (
        id INT AUTO_INCREMENT PRIMARY KEY,
        telefone VARCHAR(20) NOT NULL,
        cpf VARCHAR(14),
        status ENUM('pendente', 'em_progresso', 'concluido', 'falha') DEFAULT 'pendente',
        lote_id VARCHAR(50) NULL,
        tentativas INT DEFAULT 0,
        proxima_tentativa_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        sem_debito BOOLEAN DEFAULT FALSE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log('Tabela fila_disparo verificada/criada.');

    // Tabela eventos_webhook (Idempotência)
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

    // Tabela auditoria (Acordos Formalizados, etc)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS auditoria_chamadas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        call_id VARCHAR(100) NOT NULL,
        telefone VARCHAR(20) NOT NULL,
        decisao ENUM('Formaliza', 'Agendar', 'Zero') NOT NULL,
        data_agendamento DATETIME NULL,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Tabela auditoria_chamadas verificada/criada.');

    connection.release();
    console.log('Database Setup complete!');
    process.exit(0);
  } catch (error) {
    console.error('Error setting up DB:', error);
    process.exit(1);
  }
}

setupDb();
