import { useState, useEffect } from 'react';
import { Navbar, Nav, Container, Form, Button, Alert, Tabs, Tab } from 'react-bootstrap';
import { Line } from 'react-chartjs-2';
import 'bootstrap/dist/css/bootstrap.min.css';
import { Chart as ChartJS, LineElement, PointElement, LinearScale, Title, CategoryScale, Tooltip, Legend } from 'chart.js';

// Register Chart.js components
ChartJS.register(LineElement, PointElement, LinearScale, Title, CategoryScale, Tooltip, Legend);

function App() {
  const [balance, setBalance] = useState(10000);
  const [trades, setTrades] = useState([
    { id: 1, coin: 'BTC', amount: 0.005, price: 65000 },
    { id: 2, coin: 'ETH', amount: 0.1, price: 3500 }
  ]);
  const [coin, setCoin] = useState('');
  const [amount, setAmount] = useState('');
  const [price, setPrice] = useState('');
  const [alert, setAlert] = useState(null);
  const [key, setKey] = useState('dashboard');
  const [coinPrices, setCoinPrices] = useState({
    BTC: 65000,
    ETH: 3500,
    LTC: 200
  });
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // Mock API for real-time price updates
  useEffect(() => {
    const interval = setInterval(() => {
      setCoinPrices(prevPrices => ({
        BTC: prevPrices.BTC * (1 + (Math.random() - 0.5) * 0.02),
        ETH: prevPrices.ETH * (1 + (Math.random() - 0.5) * 0.02),
        LTC: prevPrices.LTC * (1 + (Math.random() - 0.5) * 0.02)
      }));
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleLogin = e => {
    e.preventDefault();
    // Mock authentication (replace with real logic later)
    if (username === 'user' && password === 'pass123') {
      setIsAuthenticated(true);
      setAlert({ type: 'success', message: 'Logged in successfully!' });
      setTimeout(() => setAlert(null), 3000);
      setUsername('');
      setPassword('');
    } else {
      setAlert({ type: 'danger', message: 'Invalid credentials.' });
      setTimeout(() => setAlert(null), 3000);
    }
  };

  const handleSubmit = e => {
    e.preventDefault();
    if (!coin || !amount || !price || amount <= 0 || price <= 0) {
      setAlert({ type: 'danger', message: 'Please fill all fields with valid values.' });
      setTimeout(() => setAlert(null), 3000);
      return;
    }
    const cost = parseFloat(amount) * parseFloat(price);
    if (cost > balance) {
      setAlert({ type: 'danger', message: 'Insufficient balance.' });
      setTimeout(() => setAlert(null), 3000);
      return;
    }
    const newTrade = { id: trades.length + 1, coin, amount: parseFloat(amount), price: parseFloat(price) };
    setTrades([...trades, newTrade]);
    setBalance(balance - cost);
    setCoin('');
    setAmount('');
    setPrice('');
    setAlert({ type: 'success', message: 'Trade added successfully!' });
    setTimeout(() => setAlert(null), 3000);
  };

  const handleSell = (tradeId, coin, amount) => {
    const trade = trades.find(t => t.id === tradeId);
    if (trade) {
      setBalance(balance + amount * coinPrices[coin]);
      setTrades(trades.filter(t => t.id !== tradeId));
      setAlert({ type: 'success', message: `Sold ${amount} ${coin} successfully!` });
      setTimeout(() => setAlert(null), 3000);
    }
  };

  const walletHoldings = trades.reduce((acc, trade) => {
    if (!acc[trade.coin]) {
      acc[trade.coin] = { amount: 0, value: 0 };
    }
    acc[trade.coin].amount += trade.amount;
    acc[trade.coin].value += trade.amount * coinPrices[trade.coin];
    return acc;
  }, {});

  const totalValue = Object.values(walletHoldings).reduce((sum, h) => sum + h.value, 0);

  // Prepare chart data with separate datasets per coin
  const uniqueCoins = [...new Set(trades.map(trade => trade.coin))];
  const chartData = {
    labels: trades.map((_, index) => `Trade ${index + 1}`),
    datasets: uniqueCoins.map(coin => ({
      label: `${coin} Value ($)`,
      data: trades.map(trade => (trade.coin === coin ? trade.amount * coinPrices[trade.coin] : 0)),
      borderColor: coin === 'BTC' ? 'rgba(255, 99, 132, 1)' : coin === 'ETH' ? 'rgba(54, 162, 235, 1)' : 'rgba(75, 192, 192, 1)',
      backgroundColor: coin === 'BTC' ? 'rgba(255, 99, 132, 0.2)' : coin === 'ETH' ? 'rgba(54, 162, 235, 0.2)' : 'rgba(75, 192, 192, 0.2)',
      fill: false
    }))
  };

  if (!isAuthenticated) {
    return (
      <Container className="mt-5">
        <h2>Login to Bidance</h2>
        {alert && <Alert variant={alert.type}>{alert.message}</Alert>}
        <Form onSubmit={handleLogin}>
          <Form.Group className="mb-3">
            <Form.Label>Username</Form.Label>
            <Form.Control
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Enter username"
            />
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label>Password</Form.Label>
            <Form.Control
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter password"
            />
          </Form.Group>
          <Button variant="primary" type="submit">
            Login
          </Button>
        </Form>
      </Container>
    );
  }

  return (
    <div>
      <Navbar bg="dark" variant="dark" expand="lg">
        <Container>
          <Navbar.Brand>Bidance</Navbar.Brand>
          <Nav className="me-auto" activeKey={key} onSelect={setKey}>
            <Nav.Link eventKey="dashboard">Home</Nav.Link>
            <Nav.Link eventKey="trade">Trade</Nav.Link>
            <Nav.Link eventKey="wallet">Wallet</Nav.Link>
            <Nav.Link eventKey="history">History</Nav.Link>
            <Nav.Link eventKey="chart">Chart</Nav.Link>
          </Nav>
          <Button variant="outline-light" onClick={() => setIsAuthenticated(false)}>
            Logout
          </Button>
        </Container>
      </Navbar>
      <Container className="mt-4">
        {alert && <Alert variant={alert.type}>{alert.message}</Alert>}
        <Tabs activeKey={key} onSelect={setKey} className="mb-3">
          <Tab eventKey="dashboard" title="Dashboard">
            <h3>Balance: ${balance.toFixed(2)}</h3>
            <h4>Trades</h4>
            <ul>
              {trades.map(trade => (
                <li key={trade.id}>
                  {trade.amount} {trade.coin} @ ${trade.price.toFixed(2)}
                </li>
              ))}
            </ul>
          </Tab>
          <Tab eventKey="trade" title="Trade">
            <Form onSubmit={handleSubmit}>
              <Form.Group className="mb-3">
                <Form.Label>Coin</Form.Label>
                <Form.Control
                  type="text"
                  value={coin}
                  onChange={e => setCoin(e.target.value.toUpperCase())}
                  placeholder="e.g., BTC"
                />
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>Amount</Form.Label>
                <Form.Control
                  type="number"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="e.g., 0.01"
                />
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>Price ($)</Form.Label>
                <Form.Control
                  type="number"
                  value={price}
                  onChange={e => setPrice(e.target.value)}
                  placeholder="e.g., 65000"
                />
              </Form.Group>
              <Button variant="primary" type="submit">
                Buy
              </Button>
            </Form>
          </Tab>
          <Tab eventKey="wallet" title="Wallet">
            <h3>Total Value: ${totalValue.toFixed(2)}</h3>
            <h4>Holdings</h4>
            <ul>
              {Object.entries(walletHoldings).map(([coin, holding]) => (
                <li key={coin}>
                  {coin}: {holding.amount.toFixed(6)} (Value: ${holding.value.toFixed(2)})
                  <Button
                    variant="danger"
                    size="sm"
                    className="ms-2"
                    onClick={() => {
                      const latestTrade = trades
                        .filter(t => t.coin === coin)
                        .slice(-1)[0];
                      if (latestTrade) handleSell(latestTrade.id, coin, latestTrade.amount);
                    }}
                  >
                    Sell
                  </Button>
                </li>
              ))}
            </ul>
          </Tab>
          <Tab eventKey="history" title="History">
            <h4>Trade History</h4>
            <ul>
              {trades.slice().reverse().map(trade => (
                <li key={trade.id}>
                  {trade.amount} {trade.coin} @ ${trade.price.toFixed(2)}
                </li>
              ))}
            </ul>
          </Tab>
          <Tab eventKey="chart" title="Chart">
            <h4>Trade Value Chart</h4>
            <Line
              data={chartData}
              options={{
                responsive: true,
                scales: {
                  x: { title: { display: true, text: 'Trade Number' } },
                  y: { title: { display: true, text: 'Value ($)' } }
                }
              }}
            />
          </Tab>
        </Tabs>
      </Container>
    </div>
  );
}

export default App;