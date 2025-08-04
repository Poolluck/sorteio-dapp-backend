// backend/database.js
const sqlite3 = require('sqlite3').verbose();

// Cria ou abre o arquivo do banco de dados
const db = new sqlite3.Database('./gateway.db', (err) => {
  if (err) {
    console.error("Erro ao abrir o banco de dados", err.message);
  } else {
    console.log('Conectado ao banco de dados SQLite.');
    // Cria a tabela de pedidos se ela não existir
    db.run(`
      CREATE TABLE IF NOT EXISTS pedidos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          status TEXT NOT NULL DEFAULT 'pendente',
          endereco TEXT NOT NULL UNIQUE,
          privateKey TEXT NOT NULL, -- ATENÇÃO: Em produção, CRIPTOGRAFE ISSO!
          valor_esperado TEXT NOT NULL,
          token TEXT NOT NULL,
          blocoCriacao INTEGER NOT NULL,
          txHash TEXT,
          criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) {
        console.error("Erro ao criar a tabela 'pedidos'", err.message);
      }
    });
  }
});

module.exports = db;