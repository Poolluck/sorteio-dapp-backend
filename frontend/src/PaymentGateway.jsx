// frontend/src/PaymentGateway.jsx
import React, { useState, useEffect, useRef } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import './Gateway.css'; // Vamos criar este arquivo para os estilos

const API_URL = 'http://localhost:3001';

function PaymentGateway({ valor, token }) {
  const [pedido, setPedido] = useState(null);
  const [error, setError] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('inicial'); // inicial, pendente, pago
  const intervalRef = useRef(null);

  const iniciarPagamento = async () => {
    setPaymentStatus('carregando');
    try {
      const response = await fetch(`${API_URL}/api/iniciar-pagamento`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ valor, token }),
      });
      if (!response.ok) throw new Error('Falha ao criar o pedido.');
      const data = await response.json();
      setPedido(data);
      setPaymentStatus('pendente');
    } catch (err) {
      setError(err.message);
      setPaymentStatus('inicial');
    }
  };

  const verificarStatus = async (pedidoId) => {
    try {
      const response = await fetch(`${API_URL}/api/status-pedido/${pedidoId}`);
      const data = await response.json();
      if (data.status === 'pago') {
        setPaymentStatus('pago');
        clearInterval(intervalRef.current);
      }
    } catch (err) {
      console.error("Erro ao verificar status", err);
    }
  };

  useEffect(() => {
    if (pedido?.pedidoId && paymentStatus === 'pendente') {
      intervalRef.current = setInterval(() => {
        verificarStatus(pedido.pedidoId);
      }, 5000);
    }
    return () => clearInterval(intervalRef.current);
  }, [pedido, paymentStatus]);

  if (paymentStatus === 'pago') {
    return (
      <div className="gateway-container">
        <h2 className="success-title">✅ Pagamento Confirmado!</h2>
        <p>Seu pedido foi liberado. Obrigado!</p>
      </div>
    );
  }

  return (
    <div className="gateway-container">
      {paymentStatus === 'inicial' && (
        <>
          <h3>Produto Exemplo</h3>
          <p>Valor: {valor} {token}</p>
          <button onClick={iniciarPagamento} className="pay-button">
            Pagar com Cripto
          </button>
        </>
      )}

      {paymentStatus === 'carregando' && <p>Gerando carteira, aguarde...</p>}
      
      {paymentStatus === 'pendente' && pedido && (
        <div className="payment-details">
          <p>Envie exatamente <strong>{pedido.valor} {pedido.token}</strong> para o endereço abaixo:</p>
          <div className="qr-container">
            <QRCodeCanvas value={pedido.endereco} size={180} />
          </div>
          <div className="address-box">
            <input type="text" value={pedido.endereco} readOnly />
            <button onClick={() => navigator.clipboard.writeText(pedido.endereco)}>Copiar</button>
          </div>
          <p className="waiting-text">Aguardando pagamento na blockchain...</p>
        </div>
      )}
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}

export default PaymentGateway;