// backend/index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Wallet, ethers } = require('ethers');
const db = require('./database.js');

const app = express();
app.use(cors());
app.use(express.json());

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);

const TOKENS = {
  USDT: { address: process.env.USDT_CONTRACT_ADDRESS, decimals: 6 },
  MATIC: { address: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", decimals: 18 },
};

app.post('/api/iniciar-pagamento', async (req, res) => {
  try {
    const { valor, token } = req.body;
    if (!valor || !token || !TOKENS[token]) {
      return res.status(400).json({ error: 'Valor e um token válido são obrigatórios!' });
    }
    const blocoCriacao = await provider.getBlockNumber();
    const novaCarteira = Wallet.createRandom();
    db.run(
      `INSERT INTO pedidos (endereco, privateKey, valor_esperado, token, blocoCriacao) VALUES (?, ?, ?, ?, ?)`,
      [novaCarteira.address, novaCarteira.privateKey, valor.toString(), token, blocoCriacao],
      function (err) {
        if (err) return res.status(500).json({ error: 'Erro interno ao criar pedido' });
        console.log(`[PEDIDO CRIADO] ID: ${this.lastID}, Endereço: ${novaCarteira.address}`);
        res.status(201).json({
          pedidoId: this.lastID,
          endereco: novaCarteira.address,
          valor: valor.toString(),
          token,
        });
      }
    );
  } catch (err) {
    console.error('Erro em /api/iniciar-pagamento:', err);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

app.get('/api/status-pedido/:id', (req, res) => {
  db.get(`SELECT id, status FROM pedidos WHERE id = ?`, [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: 'Erro ao consultar pedido' });
    if (!row) return res.status(404).json({ error: 'Pedido não encontrado' });
    res.json(row);
  });
});

async function verificarPagamentos() {
  console.log('🔄 Verificando pagamentos pendentes...');
  db.all(`SELECT * FROM pedidos WHERE status = 'pendente'`, [], async (err, pedidos) => {
    if (err || !pedidos) return;
    for (const pedido of pedidos) {
      try {
        const tokenInfo = TOKENS[pedido.token];
        const valorEsperado = ethers.parseUnits(pedido.valor_esperado, tokenInfo.decimals);
        let valorRecebido = BigInt(0);

        if (pedido.token === 'USDT') {
          const contract = new ethers.Contract(tokenInfo.address, ["function balanceOf(address) view returns (uint256)"], provider);
          valorRecebido = await contract.balanceOf(pedido.endereco);
        } else if (pedido.token === 'MATIC') {
          valorRecebido = await provider.getBalance(pedido.endereco);
        }

        if (valorRecebido >= valorEsperado) {
          console.log(`✅ [PAGAMENTO DETECTADO] Pedido #${pedido.id}.`);
          db.run(`UPDATE pedidos SET status = 'pago' WHERE id = ?`, [pedido.id]);
        }
      } catch (e) {
        console.error(`❌ Erro ao verificar pedido #${pedido.id}:`, e.message);
      }
    }
  });
}

setInterval(verificarPagamentos, 10000); // Verifica a cada 10 segundos

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Backend rodando na porta ${PORT}`);
});