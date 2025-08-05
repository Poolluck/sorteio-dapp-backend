// frontend/src/App.js
import React from 'react';
import PaymentGateway from './PaymentGateway';

function App() {
  return (
    <div>
      <header>
        <h1>Loja Exemplo</h1>
      </header>
      <main>
        {/* Aqui você pode passar o valor e o token do produto */}
        <PaymentGateway valor="10" token="USDT" />
      </main>
    </div>
  );
}

export default App;