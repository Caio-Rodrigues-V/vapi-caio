import pool from './src/db';

async function main() {
  const phone = '+5521984354821';
  try {
    console.log(`Resetando status do telefone ${phone} no banco de dados para permitir novos testes...`);
    
    // 1. Atualizar a tabela campaign_calls
    const [res1]: any = await pool.query(
      `UPDATE campaign_calls 
       SET status = 'pending', attempts = 0, result_code = NULL, last_error = NULL 
       WHERE customer_number = ?`,
      [phone]
    );
    console.log('Linhas atualizadas em campaign_calls:', res1.affectedRows);

    // 2. Limpar os resultados anteriores de call_results para esse numero
    const [res2]: any = await pool.query(
      `DELETE FROM call_results WHERE provider_call_id IN (
        SELECT provider_call_id FROM (
          SELECT provider_call_id FROM campaign_calls WHERE customer_number = ?
        ) as tmp
      )`,
      [phone]
    );
    console.log('Linhas removidas de call_results:', res2.affectedRows);

    console.log('Reset concluido com sucesso! O discador ira ligar novamente para este numero.');
    process.exit(0);
  } catch (err: any) {
    console.error('Erro ao resetar lead:', err.message);
    process.exit(1);
  }
}

main();
