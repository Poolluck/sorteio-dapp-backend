// backend/index.js

// --- 1. IMPORTAÇÕES E CONFIGURAÇÃO INICIAL ---
require('dotenv').config(); // Carrega as variáveis do arquivo .env
const express = require('express');
const cors = require('cors');
const { Wallet, ethers, Contract } = require('ethers');
const db = require('./database.js'); // Nosso arquivo de configuração do banco de dados

const app = express();
app.use(cors()); // Permite que o frontend acesse a API
app.use(express.json()); // Permite que o servidor entenda JSON no corpo das requisições

// --- 2. CONFIGURAÇÃO DA BLOCKCHAIN ---

// Conecta a um provedor da blockchain. Pega a URL do .env ou usa um nó local como padrão.
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || "http://127.0.0.1:8545");

// Define os tokens que aceitamos. As informações vêm do arquivo .env.
const TOKENS = {
  // Para moedas como USDT, USDC, etc.
  USDT: {
    address: process.env.USDT_CONTRACT_ADDRESS,
    decimals: 6 // O USDT geralmente tem 6 decimais
  },
  // Para a moeda nativa da rede (ETH na Ethereum, MATIC na Polygon)
  MATIC: {
    address: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", // Endereço simbólico para moeda nativa
    decimals: 18 // ETH e MATIC têm 18 decimais
  },
};

// A ABI (Interface Binária da Aplicação) mínima para verificar o saldo de um token ERC20.
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
];


// --- 3. ENDPOINTS DA API (A "PORTA DE ENTRADA" PARA O FRONTEND) ---

/**
 * @route   POST /api/iniciar-pagamento
 * @desc    Cria um novo pedido de pagamento, gerando uma carteira única.
 * @access  Public
 */
app.post('/api/iniciar-pagamento', async (req, res) => {
  try {
    const { valor, token } = req.body;

    // Validação da entrada
    if (!valor || !token || !TOKENS[token]) {
      return res.status(400).json({ error: 'Os campos "valor" e "token" (válido) são obrigatórios.' });
    }

    const blocoCriacao = await provider.getBlockNumber();
    const novaCarteira = Wallet.createRandom(); // Gera a carteira descartável

    // Salva as informações no banco de dados
    db.run(
      `INSERT INTO pedidos (endereco, privateKey, valor_esperado, token, blocoCriacao) VALUES (?, ?, ?, ?, ?)`,
      [
        novaCarteira.address,
        novaCarteira.privateKey, // ATENÇÃO: Em produção, isso DEVE ser criptografado!
        valor.toString(), // Salvamos como string para evitar problemas de precisão
        token,
        blocoCriacao
      ],
      function (err) {
        if (err) {
          console.error('Erro ao salvar pedido no banco de dados:', err.message);
          return res.status(500).json({ error: 'Erro interno ao criar pedido.' });
        }
        
        console.log(`[PEDIDO CRIADO] ID: ${this.lastID}, Endereço: ${novaCarteira.address}, Valor: ${valor} ${token}`);
        
        // Retorna as informações necessárias para o frontend
        res.status(201).json({
          pedidoId: this.lastID,
          endereco: novaCarteira.address,
          valor: valor.toString(),
          token,
        });
      }
    );
  } catch (err) {
    console.error('Erro geral em /api/iniciar-pagamento:', err);
    res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

/**
 * @route   GET /api/status-pedido/:id
 * @desc    Permite que o frontend consulte o status de um pedido.
 * @access  Public
 */
app.get('/api/status-pedido/:id', (req, res) => {
  const pedidoId = req.params.id;
  db.get(`SELECT id, status FROM pedidos WHERE id = ?`, [pedidoId], (err, row) => {
    if (err) {
      return res.status(500).json({ error: 'Erro ao consultar o banco de dados.' });
    }
    if (!row) {
      return res.status(404).json({ error: 'Pedido não encontrado.' });
    }
    res.json(row); // Retorna { id: 123, status: 'pendente' } ou 'pago'
  });
});


// --- 4. MONITOR DE PAGAMENTOS (O "ROBÔ" QUE VERIFICA A BLOCKCHAIN) ---

async function verificarPagamentos() {
  console.log('🔄 Verificando pagamentos pendentes...');

  // Busca todos os pedidos que ainda não foram pagos
  db.all(`SELECT * FROM pedidos WHERE status = 'pendente'`, [], async (err, pedidos) => {
    if (err) {
      console.error("❌ Erro ao buscar pedidos pendentes:", err.message);
      return;
    }

    if (pedidos.length === 0) {
        console.log("✅ Nenhum pedido pendente no momento.");
        return;
    }

    // Itera sobre cada pedido pendente
    for (const pedido of pedidos) {
      try {
        const tokenInfo = TOKENS[pedido.token];
        const valorEsperado = ethers.parseUnits(pedido.valor_esperado, tokenInfo.decimals);
        let valorRecebido = BigInt(0);

        // Lógica para tokens ERC20 (USDT, etc.)
        if (pedido.token === 'USDT') {
          const contract = new Contract(tokenInfo.address, ERC20_ABI, provider);
          valorRecebido = await contract.balanceOf(pedido.endereco);
        } 
        // Lógica para moeda nativa (MATIC, ETH, etc.)
        else if (pedido.token === 'MATIC') {
          valorRecebido = await provider.getBalance(pedido.endereco);
        }

        console.log(`[VERIFICANDO] Pedido #${pedido.id} (${pedido.token}): Esperado: ${valorEsperado.toString()}, Recebido: ${valorRecebido.toString()}`);

        // Compara o valor recebido com o esperado
        if (valorRecebido >= valorEsperado) {
          console.log(`✅ [PAGAMENTO DETECTADO] Pedido #${pedido.id} confirmado!`);
          
          // Atualiza o status no banco de dados para "pago"
          db.run(`UPDATE pedidos SET status = 'pago' WHERE id = ?`, [pedido.id], (updateErr) => {
            if (updateErr) {
                console.error(`Erro ao atualizar status do pedido #${pedido.id}:`, updateErr.message);
            } else {
                console.log(`🏁 Pedido #${pedido.id} marcado como PAGO no banco de dados.`);
                // TODO: Adicionar lógica para liberar o produto ao usuário
                // TODO: Adicionar lógica para "varrer" os fundos para uma carteira principal
            }
          });
        }
      } catch (e) {
        console.error(`❌ Erro inesperado ao verificar pedido #${pedido.id}:`, e.message);
      }
    }
  });
}

// --- 5. INICIALIZAÇÃO DO SERVIDOR ---

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Servidor backend rodando em http://localhost:${PORT}`);
  // Inicia o ciclo de verificação de pagamentos em intervalos de 10 segundos
  setInterval(verificarPagamentos, 10000); 
  // Roda uma vez imediatamente quando o servidor inicia
  verificarPagamentos();
});