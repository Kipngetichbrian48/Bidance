import 'bootstrap/dist/css/bootstrap.min.css';
import { Navbar, Nav, Container, Card, ListGroup } from 'react-bootstrap';

function App() {
  // Mock data for the dashboard
  const balance = 1500.75;
  const trades = [
    { id: 1, coin: 'BTC', amount: 0.005, price: 65000 },
    { id: 2, coin: 'ETH', amount: 0.1, price: 3500 },
  ];

  return (
    <div className="App">
      <Navbar bg="dark" variant="dark" expand="lg">
        <Container>
          <Navbar.Brand href="#home">Bidance</Navbar.Brand>
          <Navbar.Toggle aria-controls="basic-navbar-nav" />
          <Navbar.Collapse id="basic-navbar-nav">
            <Nav className="me-auto">
              <Nav.Link href="#home">Home</Nav.Link>
              <Nav.Link href="#trade">Trade</Nav.Link>
              <Nav.Link href="#wallet">Wallet</Nav.Link>
            </Nav>
          </Navbar.Collapse>
        </Container>
      </Navbar>
      <Container className="mt-4">
        <h2>Dashboard</h2>
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
      </Container>
    </div>
  );
}

export default App;