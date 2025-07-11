import { useState } from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';
import { Navbar, Nav, Container, Card, ListGroup, Form, Button, Tab, Tabs } from 'react-bootstrap';

function App() {
  // State for balance, trades, and active tab
  const [balance, setBalance] = useState(1500.75);
  const [trades, setTrades] = useState([
    { id: 1, coin: 'BTC', amount: 0.005, price: 65000 },
    { id: 2, coin: 'ETH', amount: 0.1, price: 3500 },
  ]);
  const [coin, setCoin] = useState('');
  const [amount, setAmount] = useState('');
  const [price, setPrice] = useState('');
  const [key, setKey] = useState('dashboard');

  // Handle form submission
  const handleSubmit = (e) => {
    e.preventDefault();
    const newTrade = {
      id: trades.length + 1,
      coin,
      amount: parseFloat(amount),
      price: parseFloat(price),
    };
    setTrades([...trades, newTrade]);
    setCoin('');
    setAmount('');
    setPrice('');
  };

  // Handle sell action
  const handleSell = (id) => {
    setTrades(trades.filter((trade) => trade.id !== id));
  };

  // Calculate wallet holdings and total value
  const walletHoldings = trades.reduce((acc, trade) => {
    if (!acc[trade.coin]) acc[trade.coin] = { amount: 0, value: 0 };
    acc[trade.coin].amount += trade.amount;
    acc[trade.coin].value += trade.amount * trade.price;
    return acc;
  }, {});
  const totalValue = Object.values(walletHoldings).reduce((sum, holding) => sum + holding.value, 0);

  return (
    <div className="App">
      <Navbar bg="dark" variant="dark" expand="lg">
        <Container>
          <Navbar.Brand href="#home">Bidance</Navbar.Brand>
          <Navbar.Toggle aria-controls="basic-navbar-nav" />
          <Navbar.Collapse id="basic-navbar-nav">
            <Nav className="me-auto">
              <Nav.Link href="#home" onClick={() => setKey('dashboard')}>Home</Nav.Link>
              <Nav.Link href="#trade" onClick={() => setKey('trade')}>Trade</Nav.Link>
              <Nav.Link href="#wallet" onClick={() => setKey('wallet')}>Wallet</Nav.Link>
            </Nav>
          </Navbar.Collapse>
        </Container>
      </Navbar>
      <Container className="mt-4">
        <Tabs activeKey={key} onSelect={(k) => setKey(k)} className="mb-3">
          <Tab eventKey="dashboard" title="Dashboard">
            <Card className="mb-4">
              <Card.Header>Account Balance</Card.Header>
              <Card.Body>
                <Card.Text>Total: ${balance.toFixed(2)}</Card.Text>
              </Card.Body>
            </Card>
            <Card>
              <Card.Header>Recent Trades</Card.Header>
              <ListGroup variant="flush">
                {trades.map((trade) => (
                  <ListGroup.Item key={trade.id}>
                    {trade.coin}: {trade.amount} @ ${trade.price.toFixed(2)}
                  </ListGroup.Item>
                ))}
              </ListGroup>
            </Card>
          </Tab>
          <Tab eventKey="trade" title="Trade">
            <Card className="mt-4">
              <Card.Header>Place a Trade</Card.Header>
              <Card.Body>
                <Form onSubmit={handleSubmit}>
                  <Form.Group className="mb-3" controlId="formCoin">
                    <Form.Label>Coin</Form.Label>
                    <Form.Control
                      type="text"
                      value={coin}
                      onChange={(e) => setCoin(e.target.value)}
                      placeholder="Enter coin (e.g., BTC)"
                      required
                    />
                  </Form.Group>
                  <Form.Group className="mb-3" controlId="formAmount">
                    <Form.Label>Amount</Form.Label>
                    <Form.Control
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="Enter amount"
                      step="0.001"
                      required
                    />
                  </Form.Group>
                  <Form.Group className="mb-3" controlId="formPrice">
                    <Form.Label>Price ($)</Form.Label>
                    <Form.Control
                      type="number"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      placeholder="Enter price"
                      step="0.01"
                      required
                    />
                  </Form.Group>
                  <Button variant="primary" type="submit">
                    Submit Trade
                  </Button>
                </Form>
              </Card.Body>
            </Card>
          </Tab>
          <Tab eventKey="wallet" title="Wallet">
            <Card>
              <Card.Header>Wallet Holdings (Total Value: ${totalValue.toFixed(2)})</Card.Header>
              <ListGroup variant="flush">
                {Object.entries(walletHoldings).map(([coin, { amount, value }]) => (
                  <ListGroup.Item key={coin}>
                    {coin}: {amount.toFixed(4)} (Value: ${value.toFixed(2)})
                    <Button
                      variant="danger"
                      size="sm"
                      className="ms-2"
                      onClick={() => handleSell(trades.find(t => t.coin === coin).id)}
                    >
                      Sell
                    </Button>
                  </ListGroup.Item>
                ))}
              </ListGroup>
            </Card>
          </Tab>
        </Tabs>
      </Container>
    </div>
  );
}

export default App;