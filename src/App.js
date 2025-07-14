import { useState, useEffect } from 'react';
import { Navbar, Nav, Container, Form, Button, Alert, Tabs, Tab } from 'react-bootstrap';
import { Line } from 'react-chartjs-2';
import 'bootstrap/dist/css/bootstrap.min.css';
import { Chart as ChartJS, LineElement, PointElement, LinearScale, Title, CategoryScale, Tooltip, Legend } from 'chart.js';
import { auth, db } from './firebase';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';

// Register Chart.js components
ChartJS.register(LineElement, PointElement, LinearScale, Title, CategoryScale, Tooltip, Legend);

function App() {
  const [balance, setBalance] = useState(10000);
  const [trades, setTrades] = useState([]);
  const [profitLossHistory, setProfitLossHistory] = useState([]);
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
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);

  // Log state changes for debugging
  useEffect(() => {
    console.log('State updated:', { balance, trades, profitLossHistory, coinPrices });
  }, [balance, trades, profitLossHistory, coinPrices]);

  // Mock CoinGecko prices
  useEffect(() => {
    const useMockPrices = true;
    const fetchPrices = async () => {
      if (useMockPrices) {
        const mockPrices = {
          BTC: 65000 + Math.random() * 1000,
          ETH: 3500 + Math.random() * 100,
          LTC: 200 + Math.random() * 10
        };
        console.log('Using mock prices:', mockPrices);
        setCoinPrices(mockPrices);
      }
    };

    fetchPrices();
    const interval = setInterval(() => {
      console.log('Fetching prices...');
      fetchPrices();
    }, 120000);
    return () => clearInterval(interval);
  }, []);

  // Update profit/loss history when trades or prices change
  useEffect(() => {
    if (user && trades.length > 0) {
      const totalProfitLoss = trades.reduce((sum, trade) => 
        sum + trade.amount * ((coinPrices[trade.coin] || 0) - trade.price), 0);
      const newHistory = [
        ...profitLossHistory,
        { timestamp: new Date().toISOString(), profitLoss: totalProfitLoss }
      ].slice(-10);
      setProfitLossHistory(newHistory);
      console.log('Profit/loss history updated:', newHistory);
      if (user) {
        setDoc(doc(db, 'users', user.uid), { profitLossHistory: newHistory }, { merge: true })
          .then(() => console.log('Profit/loss history saved to Firestore'))
          .catch(error => console.error('Firestore save error for profitLossHistory:', error));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trades, coinPrices, user]);

  // Check auth state and load user data with retry
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async user => {
      setUser(user);
      if (user) {
        try {
          setLoading(true);
          const userDocRef = doc(db, 'users', user.uid);
          console.log('Fetching Firestore data for user:', user.uid);

          // Retry fetch up to 3 times with delay
          let attempts = 0;
          let userDoc;
          while (attempts < 3) {
            await new Promise(resolve => setTimeout(resolve, 500)); // Delay for Firestore propagation
            userDoc = await getDoc(userDocRef);
            if (userDoc.exists()) {
              break;
            }
            attempts++;
            console.log(`Retry ${attempts}/3: No Firestore data found for user ${user.uid}`);
          }

          if (userDoc.exists()) {
            const data = userDoc.data();
            console.log('Firestore data loaded:', data);
            setBalance(data.balance !== undefined ? data.balance : 10000);
            setTrades(Array.isArray(data.trades) ? data.trades : []);
            setProfitLossHistory(Array.isArray(data.profitLossHistory) ? data.profitLossHistory : []);
          } else {
            console.log('No Firestore data, initializing defaults');
            const defaultData = { balance: 10000, trades: [], profitLossHistory: [] };
            await setDoc(userDocRef, defaultData, { merge: true });
            setBalance(defaultData.balance);
            setTrades(defaultData.trades);
            setProfitLossHistory(defaultData.profitLossHistory);
          }
        } catch (error) {
          console.error('Firestore load error:', error);
          setAlert({ type: 'danger', message: `Failed to load data: ${error.message}` });
          setTimeout(() => setAlert(null), 5000);
        } finally {
          setLoading(false);
        }
      } else {
        console.log('No user, clearing state');
        setBalance(10000);
        setTrades([]);
        setProfitLossHistory([]);
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  const saveUserData = async () => {
    if (user) {
      try {
        const userDocRef = doc(db, 'users', user.uid);
        const data = { balance, trades, profitLossHistory };
        console.log('Saving to Firestore:', data);
        await setDoc(userDocRef, data, { merge: true });
        console.log('Firestore save successful');
      } catch (error) {
        console.error('Firestore save error:', error);
        setAlert({ type: 'danger', message: `Failed to save data: ${error.message}` });
        setTimeout(() => setAlert(null), 5000);
      }
    }
  };

  const handleLogin = async e => {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, email, password);
      setAlert({ type: 'success', message: 'Logged in successfully!' });
      setTimeout(() => setAlert(null), 3000);
      setEmail('');
      setPassword('');
    } catch (error) {
      setAlert({ type: 'danger', message: 'Invalid email or password.' });
      setTimeout(() => setAlert(null), 3000);
    }
  };

  const handleLogout = async () => {
    try {
      await saveUserData(); // Ensure data is saved before logout
      await signOut(auth);
      setAlert({ type: 'success', message: 'Logged out successfully!' });
      setTimeout(() => setAlert(null), 3000);
    } catch (error) {
      console.error('Logout error:', error);
      setAlert({ type: 'danger', message: 'Error logging out.' });
      setTimeout(() => setAlert(null), 3000);
    }
  };

  const handleSubmit = async e => {
    e.preventDefault();
    if (!coin || !amount || !price || amount <= 0 || price <= 0) {
      setAlert({ type: 'danger', message: 'Please fill all fields with valid values.' });
      setTimeout(() => setAlert(null), 3000);
      return;
    }
    if (!['BTC', 'ETH', 'LTC'].includes(coin)) {
      setAlert({ type: 'danger', message: 'Invalid coin. Use BTC, ETH, or LTC.' });
      setTimeout(() => setAlert(null), 3000);
      return;
    }
    const cost = parseFloat(amount) * parseFloat(price);
    if (cost > balance) {
      setAlert({ type: 'danger', message: 'Insufficient balance.' });
      setTimeout(() => setAlert(null), 3000);
      return;
    }
    const newTrade = { id: Date.now(), coin, amount: parseFloat(amount), price: parseFloat(price) };
    const newTrades = [...trades, newTrade];
    const newBalance = balance - cost;
    console.log('Adding trade:', newTrade, 'New balance:', newBalance);
    setTrades(newTrades);
    setBalance(newBalance);
    setCoin('');
    setAmount('');
    setPrice('');
    setAlert({ type: 'success', message: 'Trade added successfully!' });
    setTimeout(() => setAlert(null), 3000);
    await saveUserData();
  };

  const handleSell = async (tradeId, coin, amount) => {
    const trade = trades.find(t => t.id === tradeId);
    if (trade) {
      const currentPrice = coinPrices[coin] || 0;
      const newBalance = balance + amount * currentPrice;
      const newTrades = trades.filter(t => t.id !== tradeId);
      console.log('Selling trade:', trade, 'New balance:', newBalance);
      setBalance(newBalance);
      setTrades(newTrades);
      setAlert({ type: 'success', message: `Sold ${amount} ${coin} for $${(amount * currentPrice).toFixed(2)}!` });
      setTimeout(() => setAlert(null), 3000);
      await saveUserData();
    }
  };

  const walletHoldings = trades.reduce((acc, trade) => {
    if (!acc[trade.coin]) {
      acc[trade.coin] = { amount: 0, value: 0, purchaseValue: 0, profitLoss: 0, profitLossPercent: 0 };
    }
    acc[trade.coin].amount += trade.amount;
    acc[trade.coin].value += trade.amount * (coinPrices[trade.coin] || 0);
    acc[trade.coin].purchaseValue += trade.amount * trade.price;
    acc[trade.coin].profitLoss += trade.amount * ((coinPrices[trade.coin] || 0) - trade.price);
    acc[trade.coin].profitLossPercent = acc[trade.coin].purchaseValue
      ? (acc[trade.coin].profitLoss / acc[trade.coin].purchaseValue) * 100
      : 0;
    return acc;
  }, {});

  const totalValue = Object.values(walletHoldings).reduce((sum, h) => sum + h.value, 0);
  const totalProfitLoss = Object.values(walletHoldings).reduce((sum, h) => sum + h.profitLoss, 0);
  const totalProfitLossPercent = totalValue
    ? (totalProfitLoss / Object.values(walletHoldings).reduce((sum, h) => sum + h.purchaseValue, 0)) * 100
    : 0;

  const chartData = {
    labels: trades.length > 0 ? trades.map((_, index) => `Trade ${index + 1}`) : ['No Trades'],
    datasets: [...new Set(trades.map(trade => trade.coin))].map(coin => ({
      label: `${coin} Value ($)`,
      data: trades.length > 0 
        ? trades.map(trade => (trade.coin === coin ? trade.amount * (coinPrices[trade.coin] || 0) : 0))
        : [0],
      borderColor: coin === 'BTC' ? 'rgba(255, 99, 132, 1)' : coin === 'ETH' ? 'rgba(54, 162, 235, 1)' : 'rgba(75, 192, 192, 1)',
      backgroundColor: coin === 'BTC' ? 'rgba(255, 99, 132, 0.2)' : coin === 'ETH' ? 'rgba(54, 162, 235, 0.2)' : 'rgba(75, 192, 192, 0.2)',
      fill: false
    }))
  };

  const profitLossChartData = {
    labels: profitLossHistory.length > 0 
      ? profitLossHistory.map(entry => new Date(entry.timestamp).toLocaleTimeString()) 
      : ['No Data'],
    datasets: [{
      label: 'Total Profit/Loss ($)',
      data: profitLossHistory.length > 0 ? profitLossHistory.map(entry => entry.profitLoss) : [0],
      borderColor: 'rgba(153, 102, 255, 1)',
      backgroundColor: 'rgba(153, 102, 255, 0.2)',
      fill: false
    }]
  };

  if (!user) {
    return (
      <Container className="mt-5">
        <h2>Login to Bidance</h2>
        {alert && <Alert variant={alert.type}>{alert.message}</Alert>}
        <Form onSubmit={handleLogin}>
          <Form.Group className="mb-3">
            <Form.Label>Email</Form.Label>
            <Form.Control
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Enter email"
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

  if (loading) {
    return (
      <Container className="mt-5">
        <h3>Loading data...</h3>
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
            <Nav.Link eventKey="analytics">Analytics</Nav.Link>
          </Nav>
          <Button variant="outline-light" onClick={handleLogout}>
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
            {trades.length === 0 ? (
              <p>No trades yet.</p>
            ) : (
              <ul>
                {trades.map(trade => (
                  <li key={trade.id}>
                    {trade.amount} {trade.coin} @ ${trade.price.toFixed(2)}
                  </li>
                ))}
              </ul>
            )}
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
            <h4>Total Profit/Loss: ${totalProfitLoss.toFixed(2)} ({totalProfitLossPercent.toFixed(2)}%)</h4>
            <h4>Holdings</h4>
            {Object.keys(walletHoldings).length === 0 ? (
              <p>No holdings yet.</p>
            ) : (
              <ul>
                {Object.entries(walletHoldings).map(([coin, holding]) => (
                  <li key={coin}>
                    {coin}: {holding.amount.toFixed(6)} (Value: ${holding.value.toFixed(2)}, P/L: ${holding.profitLoss.toFixed(2)} ({holding.profitLossPercent.toFixed(2)}%)
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
            )}
          </Tab>
          <Tab eventKey="history" title="History">
            <h4>Trade History</h4>
            {trades.length === 0 ? (
              <p>No trade history.</p>
            ) : (
              <ul>
                {trades.slice().reverse().map(trade => (
                  <li key={trade.id}>
                    {trade.amount} {trade.coin} @ ${trade.price.toFixed(2)}
                  </li>
                ))}
              </ul>
            )}
          </Tab>
          <Tab eventKey="chart" title="Chart">
            <h4>Trade Value Chart</h4>
            {trades.length === 0 ? (
              <p>No trades to display.</p>
            ) : (
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
            )}
          </Tab>
          <Tab eventKey="analytics" title="Analytics">
            <h4>Profit/Loss Trend</h4>
            <Line
              data={profitLossChartData}
              options={{
                responsive: true,
                scales: {
                  x: { title: { display: true, text: 'Time' } },
                  y: { title: { display: true, text: 'Profit/Loss ($)' } }
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